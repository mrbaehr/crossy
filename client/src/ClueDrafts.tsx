import { useCallback, useEffect, useState } from "react";

export interface DraftView {
  id: number;
  text: string;
  authorKind: "user" | "ai";
  authorName: string | null;
  isChosen: boolean;
  bothApproved: boolean;
}

interface Props {
  entryId: number;
  label: string;
  /** Called after any change so statuses refresh. */
  onChanged: () => void;
}

const json = { "content-type": "application/json" };

/** Drafts for one entry: add, edit, delete, choose one, toggle both-approved. */
export function ClueDrafts({ entryId, label, onChanged }: Props) {
  const [drafts, setDrafts] = useState<DraftView[]>([]);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/entries/${entryId}/clues`, { credentials: "same-origin" });
    if (res.ok) setDrafts((await res.json()).drafts);
  }, [entryId]);

  useEffect(() => {
    setEditing(null);
    setText("");
    setError(null);
    void load();
    const t = setInterval(() => void load(), 10000);
    return () => clearInterval(t);
  }, [load]);

  async function call(path: string, method: string, body?: unknown) {
    setError(null);
    const res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: json,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "request failed");
      return false;
    }
    await load();
    onChanged();
    return true;
  }

  async function add() {
    if (!text.trim()) return;
    if (await call(`/api/entries/${entryId}/clues`, "POST", { text })) setText("");
  }

  const btn = { fontSize: 11, cursor: "pointer" } as const;
  const accent = (d: DraftView) => (d.bothApproved ? "#2b8a3e" : d.isChosen ? "#1971c2" : "#e0e0e0");
  return (
    <section data-testid="clue-drafts" style={{ borderTop: "1px solid #ccc", paddingTop: 8, fontSize: 13 }}>
      <h3 style={{ margin: "0 0 4px", fontSize: 14 }}>Clues for {label}</h3>
      {drafts.length === 0 && <p style={{ color: "#777", margin: "0 0 6px" }}>No drafts yet.</p>}
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {drafts.map((d) => (
          <li
            key={d.id}
            data-testid={`draft-${d.id}`}
            style={{
              marginBottom: 6,
              padding: "6px 8px",
              border: "1px solid #e0e0e0",
              borderLeft: `3px solid ${accent(d)}`,
              borderRadius: 4,
              background: d.isChosen ? "#f5f9ff" : "#fff",
            }}
          >
            {editing?.id === d.id ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await call(`/api/clues/${d.id}`, "PUT", { text: editing.text })) setEditing(null);
                }}
              >
                <input
                  value={editing.text}
                  autoFocus
                  onChange={(e) => setEditing({ id: d.id, text: e.target.value })}
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
                <button type="submit" style={btn}>save</button>{" "}
                <button type="button" style={btn} onClick={() => setEditing(null)}>cancel</button>
              </form>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ flex: 1 }}>{d.text}</span>
                  {d.isChosen && (
                    <span style={{ fontSize: 10, fontWeight: 600, color: accent(d), whiteSpace: "nowrap" }}>
                      {d.bothApproved ? "✓ APPROVED" : "CHOSEN"}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 1 }}>
                  {d.authorKind === "ai" ? "AI" : (d.authorName ?? "unknown")}
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4 }}>
                  <button
                    style={{
                      ...btn,
                      fontWeight: d.isChosen ? 600 : 400,
                      color: d.isChosen ? "#1971c2" : "#555",
                      background: "none",
                      border: "none",
                      padding: 0,
                    }}
                    onClick={() =>
                      void call(`/api/clues/${d.id}`, "PUT", { isChosen: !d.isChosen })
                    }
                  >
                    {d.isChosen ? "★ chosen" : "☆ choose"}
                  </button>
                  {d.isChosen && (
                    <label style={{ fontSize: 11, color: "#555", display: "flex", alignItems: "center", gap: 3 }}>
                      <input
                        type="checkbox"
                        checked={d.bothApproved}
                        onChange={(e) => void call(`/api/clues/${d.id}`, "PUT", { bothApproved: e.target.checked })}
                      />
                      both approved
                    </label>
                  )}
                  <span style={{ flex: 1 }} />
                  <button style={{ ...btn, background: "none", border: "none", color: "#555", padding: 0 }} onClick={() => setEditing({ id: d.id, text: d.text })}>edit</button>
                  <button style={{ ...btn, background: "none", border: "none", color: "#b00", padding: 0 }} onClick={() => void call(`/api/clues/${d.id}`, "DELETE")}>delete</button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
        style={{ display: "flex", gap: 4 }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a clue draft"
          aria-label="New clue draft"
          style={{ flex: 1, minWidth: 0 }}
        />
        <button type="submit">Add</button>
      </form>
      {error && <p style={{ color: "crimson", margin: "4px 0 0" }}>{error}</p>}
    </section>
  );
}
