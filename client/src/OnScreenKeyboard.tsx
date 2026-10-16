// Custom touch keyboard for the phone layout. No native keyboard involved.
// A-Z plus crossword-specific keys: block toggle, direction toggle, delete,
// and prev/next clue navigation.

interface Props {
  onLetter: (letter: string) => void;
  onDelete: () => void;
  onToggleBlock: () => void;
  onToggleDir: () => void;
  onPrevEntry: () => void;
  onNextEntry: () => void;
  direction: "across" | "down";
}

const ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

const keyStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: "12px 0",
  fontSize: 18,
  fontFamily: "system-ui, sans-serif",
  border: "1px solid #ccc",
  borderRadius: 6,
  background: "#fff",
  cursor: "pointer",
  userSelect: "none",
  WebkitUserSelect: "none",
  touchAction: "manipulation",
};

const wideKey: React.CSSProperties = {
  ...keyStyle,
  fontSize: 13,
  flex: 1.4,
  background: "#f0f0f0",
};

export function OnScreenKeyboard({
  onLetter,
  onDelete,
  onToggleBlock,
  onToggleDir,
  onPrevEntry,
  onNextEntry,
  direction,
}: Props) {
  // Prevent the touch from stealing focus / triggering any native input.
  const press = (fn: () => void) => (e: React.PointerEvent) => {
    e.preventDefault();
    fn();
  };

  return (
    <div
      style={{
        position: "sticky",
        bottom: 0,
        background: "#e8e8e8",
        padding: "6px 4px calc(6px + env(safe-area-inset-bottom))",
        display: "flex",
        flexDirection: "column",
        gap: 5,
        borderTop: "1px solid #bbb",
      }}
    >
      {/* Navigation / mode row */}
      <div style={{ display: "flex", gap: 5 }}>
        <button style={wideKey} onPointerDown={press(onPrevEntry)}>‹ prev</button>
        <button style={wideKey} onPointerDown={press(onToggleDir)}>
          {direction === "across" ? "→ across" : "↓ down"}
        </button>
        <button style={wideKey} onPointerDown={press(onToggleBlock)}>■ block</button>
        <button style={wideKey} onPointerDown={press(onNextEntry)}>next ›</button>
      </div>
      {/* Letter rows */}
      {ROWS.map((row, i) => (
        <div key={row} style={{ display: "flex", gap: 4, padding: i === 1 ? "0 12px" : 0 }}>
          {row.split("").map((ch) => (
            <button key={ch} style={keyStyle} onPointerDown={press(() => onLetter(ch))}>
              {ch}
            </button>
          ))}
          {i === 2 && (
            <button style={{ ...keyStyle, flex: 1.6, background: "#f0f0f0", fontSize: 15 }} onPointerDown={press(onDelete)}>
              ⌫
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
