import type { ClueStatus, Cell, Coord, Direction } from "@crossy/shared";
import { entryAnswer } from "@crossy/shared";
import { ClueDrafts } from "./ClueDrafts";

export interface EntryView {
  id: number;
  direction: Direction;
  number: number;
  cells: Coord[];
}

const BADGE: Record<ClueStatus, { label: string; color: string }> = {
  none: { label: "none", color: "#999" },
  drafted: { label: "drafted", color: "#e67700" },
  chosen: { label: "chosen", color: "#1971c2" },
  "both-approved": { label: "approved", color: "#2b8a3e" },
};

interface Props {
  entries: EntryView[];
  cells: Map<string, Cell>;
  clueStatus: Record<number, ClueStatus>;
  /** Entry containing the cursor in the current direction, if any. */
  activeEntryId: number | null;
  onSelect: (entry: EntryView) => void;
  /** Drafts changed; refresh statuses. */
  onCluesChanged: () => void;
}

export function ClueSidebar({ entries, cells, clueStatus, activeEntryId, onSelect, onCluesChanged }: Props) {
  const column = (direction: Direction) => {
    const list = entries.filter((e) => e.direction === direction).sort((a, b) => a.number - b.number);
    return (
      <div key={direction} style={{ marginBottom: "0.75rem" }}>
        <h3 style={{ margin: "0 0 0.25rem", fontSize: 14, textTransform: "capitalize" }}>{direction}</h3>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {list.map((e) => {
            const letters = entryAnswer(e.cells, (r, c) => cells.get(`${r},${c}`));
            const answer = letters.map((l) => l || "_").join("");
            const st = clueStatus[e.id] ?? "none";
            const badge = BADGE[st];
            return (
              <li key={e.id}>
                <button
                  onClick={() => onSelect(e)}
                  data-testid={`entry-${direction}-${e.number}`}
                  style={{
                    display: "flex",
                    width: "100%",
                    gap: 6,
                    alignItems: "baseline",
                    textAlign: "left",
                    padding: "2px 4px",
                    border: "none",
                    cursor: "pointer",
                    background: e.id === activeEntryId ? "#cfe8ff" : "transparent",
                    font: "inherit",
                    fontSize: 13,
                  }}
                >
                  <strong style={{ minWidth: 22 }}>{e.number}</strong>
                  <span style={{ fontFamily: "monospace", letterSpacing: 1, flex: 1 }}>{answer}</span>
                  <span style={{ fontSize: 11, color: badge.color, border: `1px solid ${badge.color}`, borderRadius: 8, padding: "0 6px" }}>
                    {badge.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };
  const activeEntry = entries.find((e) => e.id === activeEntryId);
  return (
    <aside style={{ minWidth: 240, maxWidth: 320, maxHeight: "80vh", overflowY: "auto" }}>
      {column("across")}
      {column("down")}
      {activeEntry && (
        <ClueDrafts
          entryId={activeEntry.id}
          label={`${activeEntry.number}-${activeEntry.direction}`}
          onChanged={onCluesChanged}
        />
      )}
    </aside>
  );
}
