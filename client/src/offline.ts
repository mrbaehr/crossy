// Offline support: cache puzzle state in IndexedDB, queue edits made while
// offline, and replay them to the server on reconnect. LWW on the server —
// per the product decision, offline edits trample / get trampled, which is
// acceptable for the "drove through a tunnel" use case.

export interface QueuedEdit {
  id: string; // uuid
  puzzleId: number;
  kind: "letter" | "block";
  row: number;
  col: number;
  letter?: string | null; // for letter edits
  ts: number;
}

const DB_NAME = "crossy-offline";
const DB_VERSION = 1;
const STORE_PUZZLES = "puzzles"; // cached full puzzle payloads, keyed by puzzleId
const STORE_QUEUE = "queue"; // queued edits, keyed by edit id

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PUZZLES)) db.createObjectStore(STORE_PUZZLES);
      if (!db.objectStoreNames.contains(STORE_QUEUE)) db.createObjectStore(STORE_QUEUE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

// --- puzzle cache ---

export async function cachePuzzle(puzzleId: number, payload: unknown): Promise<void> {
  await tx(STORE_PUZZLES, "readwrite", (s) => s.put(payload, puzzleId));
}

export async function getCachedPuzzle(puzzleId: number): Promise<any | undefined> {
  return tx(STORE_PUZZLES, "readonly", (s) => s.get(puzzleId));
}

// --- edit queue ---

export async function queueEdit(edit: QueuedEdit): Promise<void> {
  await tx(STORE_QUEUE, "readwrite", (s) => s.put(edit, edit.id));
}

export async function getQueue(): Promise<QueuedEdit[]> {
  const all = await tx<QueuedEdit[]>(STORE_QUEUE, "readonly", (s) => s.getAll());
  return (all ?? []).sort((a, b) => a.ts - b.ts);
}

export async function clearQueuedEdit(id: string): Promise<void> {
  await tx(STORE_QUEUE, "readwrite", (s) => s.delete(id));
}

export async function queueLength(): Promise<number> {
  const q = await getQueue();
  return q.length;
}

/**
 * Replay queued edits to the server in order. LWW: later real-time edits may
 * overwrite these; that's accepted. Removes each edit from the queue on success.
 * Returns the number successfully flushed.
 */
export async function flushQueue(): Promise<number> {
  const queue = await getQueue();
  let flushed = 0;
  for (const edit of queue) {
    try {
      const path =
        edit.kind === "letter"
          ? `/api/puzzles/${edit.puzzleId}/letter`
          : `/api/puzzles/${edit.puzzleId}/block`;
      const body =
        edit.kind === "letter"
          ? { row: edit.row, col: edit.col, letter: edit.letter ?? null }
          : { row: edit.row, col: edit.col };
      const res = await fetch(path, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      // 4xx that aren't auth: the edit is invalid now (e.g. typing into a cell
      // that became a block). Drop it rather than retry forever.
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 401)) {
        await clearQueuedEdit(edit.id);
        if (res.ok) flushed++;
      } else {
        // 401 / 5xx / network: stop; try again next reconnect.
        break;
      }
    } catch {
      break; // network gone again
    }
  }
  return flushed;
}

export function uuid(): string {
  return crypto.randomUUID();
}
