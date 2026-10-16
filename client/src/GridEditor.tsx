import { useCallback, useEffect, useRef, useState } from "react";
import type { Cell, ClueStatus, Puzzle } from "@crossy/shared";
import { ClueSidebar, type EntryView } from "./ClueSidebar";
import { fetchExportData, exportPuz, exportPdf } from "./export";
import { OnScreenKeyboard } from "./OnScreenKeyboard";
import { useIsPhone } from "./useViewport";
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
  const svgRef = useRef<SVGSVGElement>(null);

  const key = (r: number, c: number) => `${r},${c}`;

  const load = useCallback(async () => {
    const res = await fetch(`/api/puzzles/${puzzleId}`, { credentials: "same-origin" });
    if (!res.ok) {
      setError(res.status === 401 ? "Please log in." : `Failed to load (${res.status}).`);
      return;
    }
    const data = await res.json();
    setPuzzle(data.puzzle);
    const map = new Map<string, Cell>();
    for (const cell of data.cells as Cell[]) map.set(key(cell.row, cell.col), cell);
    setCells(map);
    setNumbers(data.numbers ?? {});
    setEntries(data.entries ?? []);
    setClueStatus(data.clueStatus ?? {});
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
    const res = await fetch(`/api/puzzles/${puzzleId}/letter`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ row: r, col: c, letter }),
    });
    if (res.ok) mergeCells((await res.json()).cells);
  }

  async function toggleBlock(r: number, c: number) {
    const res = await fetch(`/api/puzzles/${puzzleId}/block`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ row: r, col: c }),
    });
    if (res.ok) {
      const data = await res.json();
      mergeCells(data.cells);
      if (data.numbers) setNumbers(data.numbers);
      if (data.entries) {
        setEntries(data.entries);
        void refreshClues();
      }
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
          <span style={{ fontSize: 11, color: connected ? "#2b8a3e" : "#999" }}>{connected ? "live" : ""}</span>
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
        <span style={{ fontSize: 12, color: connected ? "#2b8a3e" : "#999" }}>
          {connected ? "● live" : "○ connecting…"}
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
