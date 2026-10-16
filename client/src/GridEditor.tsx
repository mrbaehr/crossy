import { useCallback, useEffect, useRef, useState } from "react";
import type { Cell, ClueStatus, Puzzle } from "@crossy/shared";
import { ClueSidebar, type EntryView } from "./ClueSidebar";
import { fetchExportData, exportPuz, exportPdf } from "./export";
import { OnScreenKeyboard } from "./OnScreenKeyboard";
import { useIsPhone } from "./useViewport";
import { cachePuzzle, getCachedPuzzle, queueEdit, flushQueue, queueLength, uuid } from "./offline";
import { useSync } from "./useSync";

type Dir = "across" | "down";

// Distinct colors for up to a few peer cursors.
const PEER_COLORS = ["#e8590c", "#9c36b5", "#2b8a3e", "#1971c2"];
function peerColor(userId: number): string {
  return PEER_COLORS[userId % PEER_COLORS.length]!;
}

interface Props {
  puzzleId: number;
  onBack: () => void;
}

const CELL = 34; // px

export function GridEditor({ puzzleId, onBack }: Props) {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [cells, setCells] = useState<Map<string, Cell>>(new Map());
  const [numbers, setNumbers] = useState<Record<string, number>>({});
  const isPhone = useIsPhone();
  const [cursor, setCursor] = useState<{ row: number; col: number }>({ row: 0, col: 0 });
  const [dir, setDir] = useState<Dir>("across");
  const [entries, setEntries] = useState<EntryView[]>([]);
  const [clueStatus, setClueStatus] = useState<Record<number, ClueStatus>>({});
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState<boolean>(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [pending, setPending] = useState<number>(0);
  const svgRef = useRef<SVGSVGElement>(null);

  const key = (r: number, c: number) => `${r},${c}`;

  function applyData(data: any) {
    setPuzzle(data.puzzle);
    const map = new Map<string, Cell>();
    for (const cell of data.cells as Cell[]) map.set(key(cell.row, cell.col), cell);
    setCells(map);
    setNumbers(data.numbers ?? {});
    setEntries(data.entries ?? []);
    setClueStatus(data.clueStatus ?? {});
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/puzzles/${puzzleId}`, { credentials: "same-origin" });
      if (res.status === 401) return setError("Please log in.");
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      applyData(data);
      void cachePuzzle(puzzleId, data); // stash for offline
    } catch {
      // Offline (or server unreachable): fall back to the cached copy.
      const cached = await getCachedPuzzle(puzzleId);
      if (cached) {
        applyData(cached);
      } else {
        setError("Offline and this puzzle isn't cached yet. Open it once online.");
      }
    }
    setPending(await queueLength());
  }, [puzzleId]);

  // Refresh clue statuses (drafts/approvals change). Called on entry changes,
  // window focus, and periodically until draft events are broadcast (#16).
  const refreshClues = useCallback(async () => {
    const res = await fetch(`/api/puzzles/${puzzleId}/clues`, { credentials: "same-origin" });
    if (res.ok) setClueStatus((await res.json()).clueStatus ?? {});
  }, [puzzleId]);

  useEffect(() => {
    const t = setInterval(() => void refreshClues(), 10000);
    const onFocus = () => void refreshClues();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshClues]);

  useEffect(() => {
    void load();
  }, [load]);

  // Online/offline tracking + flush the offline queue on reconnect.
  useEffect(() => {
    async function goOnline() {
      setOnline(true);
      const n = await flushQueue();
      setPending(await queueLength());
      if (n > 0) void load(); // re-sync authoritative state after replay
    }
    function goOffline() {
      setOnline(false);
    }
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    // Attempt a flush on mount in case we reloaded with a pending queue.
    if (navigator.onLine) void goOnline();
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [load]);

  function cellAt(r: number, c: number): Cell | undefined {
    return cells.get(key(r, c));
  }

  const mergeCells = useCallback((updated: Cell[]) => {
    setCells((prev) => {
      const next = new Map(prev);
      for (const cell of updated) next.set(`${cell.row},${cell.col}`, cell);
      return next;
    });
  }, []);

  // Realtime: apply remote edits, track peers, broadcast our cursor.
  const { peers, connected, sendCursor } = useSync({
    puzzleId,
    onCells: mergeCells,
    onEntries: (nums, ents) => {
      setNumbers(nums);
      setEntries(ents as EntryView[]);
      void refreshClues();
    },
  });

  useEffect(() => {
    sendCursor(cursor);
  }, [cursor, sendCursor]);

  async function putLetter(r: number, c: number, letter: string | null) {
    // Optimistic local update (also makes the online path feel instant).
    const prev = cells.get(key(r, c));
    mergeCells([{ row: r, col: c, letter, isBlock: false, rebus: prev?.rebus ?? null, isCircled: prev?.isCircled ?? false, isShaded: prev?.isShaded ?? false } as Cell]);
    try {
      const res = await fetch(`/api/puzzles/${puzzleId}/letter`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ row: r, col: c, letter }),
      });
      if (res.ok) mergeCells((await res.json()).cells);
    } catch {
      await queueEdit({ id: uuid(), puzzleId, kind: "letter", row: r, col: c, letter, ts: Date.now() });
      setPending(await queueLength());
    }
  }

  async function toggleBlock(r: number, c: number) {
    try {
      const res = await fetch(`/api/puzzles/${puzzleId}/block`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ row: r, col: c }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      mergeCells(data.cells);
      if (data.numbers) setNumbers(data.numbers);
      if (data.entries) {
        setEntries(data.entries);
        void refreshClues();
      }
    } catch {
      // Offline: optimistic local toggle of the cell (+ symmetric partner).
      // Numbering won't recompute until reconnect — acceptable for the stopgap.
      if (!puzzle) return;
      const existing = cells.get(key(r, c));
      const nowBlock = !existing?.isBlock;
      const updates: Cell[] = [{ row: r, col: c, letter: null, isBlock: nowBlock, rebus: null, isCircled: false, isShaded: false } as Cell];
      if (puzzle.symmetryEnabled) {
        const pr = puzzle.height - 1 - r;
        const pc = puzzle.width - 1 - c;
        if (!(pr === r && pc === c)) {
          updates.push({ row: pr, col: pc, letter: null, isBlock: nowBlock, rebus: null, isCircled: false, isShaded: false } as Cell);
        }
      }
      mergeCells(updates);
      await queueEdit({ id: uuid(), puzzleId, kind: "block", row: r, col: c, ts: Date.now() });
      setPending(await queueLength());
    }
  }

  function advance(r: number, c: number): { row: number; col: number } {
    if (!puzzle) return { row: r, col: c };
    if (dir === "across") return { row: r, col: Math.min(c + 1, puzzle.width - 1) };
    return { row: Math.min(r + 1, puzzle.height - 1), col: c };
  }

  function move(dr: number, dc: number) {
    if (!puzzle) return;
    setCursor((cur) => ({
      row: Math.max(0, Math.min(puzzle.height - 1, cur.row + dr)),
      col: Math.max(0, Math.min(puzzle.width - 1, cur.col + dc)),
    }));
  }

  // Reusable typing actions, shared by the physical keyboard and the on-screen one.
  function typeLetter(ch: string) {
    const { row, col } = cursor;
    if (cellAt(row, col)?.isBlock) return;
    void putLetter(row, col, ch.toUpperCase());
    setCursor(advance(row, col));
  }
  function deleteLetter() {
    const { row, col } = cursor;
    void putLetter(row, col, null);
    move(dir === "across" ? 0 : -1, dir === "across" ? -1 : 0);
  }
  function toggleDir() {
    setDir((d) => (d === "across" ? "down" : "across"));
  }
  function toggleBlockAtCursor() {
    void toggleBlock(cursor.row, cursor.col);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!puzzle) return;
    if (e.key === "ArrowRight") return move(0, 1);
    if (e.key === "ArrowLeft") return move(0, -1);
    if (e.key === "ArrowUp") return move(-1, 0);
    if (e.key === "ArrowDown") return move(1, 0);
    if (e.key === " ") {
      e.preventDefault();
      toggleDir();
      return;
    }
    if (e.key === ".") {
      e.preventDefault();
      toggleBlockAtCursor();
      return;
    }
    if (e.key === "Backspace") {
      e.preventDefault();
      deleteLetter();
      return;
    }
    if (/^[a-zA-Z]$/.test(e.key)) {
      e.preventDefault();
      typeLetter(e.key);
    }
  }

  const activeEntry = entries.find(
    (e) => e.direction === dir && e.cells.some((c) => c.row === cursor.row && c.col === cursor.col),
  );

  function selectEntry(e: EntryView) {
    setDir(e.direction);
    const first = e.cells.find((c) => !cells.get(key(c.row, c.col))?.letter) ?? e.cells[0]!;
    setCursor({ row: first.row, col: first.col });
    svgRef.current?.focus();
  }

  // Prev/next entry within the current direction (wraps).
  function stepEntry(delta: number) {
    const list = entries
      .filter((e) => e.direction === dir)
      .sort((a, b) => a.number - b.number);
    if (list.length === 0) return;
    const idx = activeEntry ? list.findIndex((e) => e.id === activeEntry.id) : -1;
    const next = list[(idx + delta + list.length) % list.length]!;
    selectEntry(next);
  }

  // Current clue text for the active entry (phone shows one clue at a time).
  const activeClueText = activeEntry
    ? (() => {
        const letters = activeEntry.cells.map((c) => cells.get(key(c.row, c.col))?.letter || "_").join("");
        return `${activeEntry.number} ${activeEntry.direction} · ${letters}`;
      })()
    : "Select a cell";

  if (error) {
    return (
      <div>
        <button onClick={onBack}>← Back</button>
        <p style={{ color: "crimson" }}>{error}</p>
      </div>
    );
  }
  if (!puzzle) return <p>Loading…</p>;

  async function doExport(kind: "puz" | "pdf-blank" | "pdf-filled") {
    try {
      const data = await fetchExportData(puzzleId);
      if (kind === "puz") exportPuz(data);
      else exportPdf(data, kind === "pdf-filled");
    } catch (e) {
      setError(e instanceof Error ? e.message : "export failed");
    }
  }

  const w = puzzle.width * CELL;
  const h = puzzle.height * CELL;

  const pz = puzzle;
  const gridSvg = renderGrid();
  function renderGrid() {
    return (
      <svg
        ref={svgRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        width="100%"
        viewBox={`0 0 ${w} ${h}`}
        style={{ maxWidth: w, border: "2px solid #111", outline: "none", touchAction: "manipulation" }}
        role="grid"
        aria-label="crossword grid"
      >
        {Array.from({ length: pz.height }).map((_, r) =>
          Array.from({ length: pz.width }).map((__, c) => {
            const cell = cellAt(r, c);
            const isBlock = cell?.isBlock ?? false;
            const isCursor = cursor.row === r && cursor.col === c;
            return (
              <g key={key(r, c)} onClick={() => { setCursor({ row: r, col: c }); svgRef.current?.focus(); }}>
                <rect x={c * CELL} y={r * CELL} width={CELL} height={CELL} fill={isBlock ? "#111" : isCursor ? "#cfe8ff" : "#fff"} stroke="#999" strokeWidth={0.5} />
                {!isBlock && numbers[key(r, c)] && (
                  <text x={c * CELL + 2} y={r * CELL + 9} fontSize={CELL * 0.26} fontFamily="system-ui, sans-serif" fill="#333">{numbers[key(r, c)]}</text>
                )}
                {cell?.isCircled && !isBlock && (
                  <circle cx={c * CELL + CELL / 2} cy={r * CELL + CELL / 2} r={CELL / 2 - 2} fill="none" stroke="#333" strokeWidth={0.75} />
                )}
                {!isBlock && (cell?.rebus ?? cell?.letter) && (
                  <text x={c * CELL + CELL / 2} y={r * CELL + CELL * 0.72} textAnchor="middle" fontSize={cell?.rebus ? CELL * 0.4 : CELL * 0.6} fontFamily="system-ui, sans-serif">{cell?.rebus ?? cell?.letter}</text>
                )}
              </g>
            );
          }),
        )}
        {peers.filter((p) => p.cursor).map((p) => (
          <rect key={`peer-${p.userId}`} x={p.cursor!.col * CELL + 1} y={p.cursor!.row * CELL + 1} width={CELL - 2} height={CELL - 2} fill="none" stroke={peerColor(p.userId)} strokeWidth={2.5} pointerEvents="none" />
        ))}
      </svg>
    );
  }

  if (isPhone) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100dvh", margin: "-1.5rem", touchAction: "manipulation" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderBottom: "1px solid #ddd" }}>
          <button onClick={onBack}>Back</button>
          <strong style={{ flex: 1, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {puzzle.title || `Puzzle #${puzzle.id}`}
          </strong>
          <span style={{ fontSize: 11, color: !online ? "#e8590c" : connected ? "#2b8a3e" : "#999" }}>
            {!online ? (pending ? `offline ${pending}\u2191` : "offline") : connected ? "live" : ""}
          </span>
        </div>
        <div style={{ flex: "0 0 auto", padding: 8, display: "flex", justifyContent: "center" }}>
          <div style={{ width: "100%", maxWidth: "min(92vw, 60dvh)" }}>{gridSvg}</div>
        </div>
        <div onClick={toggleDir} style={{ flex: 1, minHeight: 36, padding: "8px 12px", background: "#f5f9ff", borderTop: "1px solid #e0e0e0", fontSize: 15, display: "flex", alignItems: "center" }}>
          {activeClueText}
        </div>
        <OnScreenKeyboard
          direction={dir}
          onLetter={typeLetter}
          onDelete={deleteLetter}
          onToggleBlock={toggleBlockAtCursor}
          onToggleDir={toggleDir}
          onPrevEntry={() => stepEntry(-1)}
          onNextEntry={() => stepEntry(1)}
        />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap", marginBottom: "0.5rem" }}>
        <button onClick={onBack}>← Back</button>
        <strong>{puzzle.title || `Puzzle #${puzzle.id}`}</strong>
        <span style={{ color: "#666", fontSize: 13 }}>
          {puzzle.width}×{puzzle.height} · symmetry {puzzle.symmetryEnabled ? "on" : "off"} · typing {dir}
        </span>
        <span style={{ flex: 1 }} />
        <button onClick={() => void doExport("puz")} style={{ fontSize: 12 }}>⬇ .puz</button>
        <button onClick={() => void doExport("pdf-blank")} style={{ fontSize: 12 }}>⬇ PDF (blank)</button>
        <button onClick={() => void doExport("pdf-filled")} style={{ fontSize: 12 }}>⬇ PDF (filled)</button>
      </div>
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap", marginBottom: "0.5rem" }}>
        <span style={{ fontSize: 12, color: !online ? "#e8590c" : connected ? "#2b8a3e" : "#999" }}>
          {!online ? (pending ? `● offline · ${pending} queued` : "● offline") : connected ? "● live" : "○ connecting…"}
        </span>
        {peers.map((p) => (
          <span key={p.userId} style={{ fontSize: 12, color: peerColor(p.userId) }}>
            ● {p.username}
          </span>
        ))}
      </div>
      <p style={{ color: "#666", fontSize: 13, marginTop: 0 }}>
        Type letters · <kbd>Space</kbd> toggle direction · <kbd>.</kbd> toggle block · arrows to move · click a cell
      </p>
      <div style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start", flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 360px", minWidth: 0, maxWidth: w }}>
      {gridSvg}
      </div>
      <ClueSidebar
        entries={entries}
        cells={cells}
        clueStatus={clueStatus}
        activeEntryId={activeEntry?.id ?? null}
        onSelect={selectEntry}
        onCluesChanged={() => void refreshClues()}
      />
      </div>
    </div>
  );
}
