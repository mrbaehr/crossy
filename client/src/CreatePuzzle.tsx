import { useState, type FormEvent } from "react";
import type { Puzzle } from "@crossy/shared";

const PRESETS = [15, 21];

export function CreatePuzzle() {
  const [title, setTitle] = useState("");
  const [width, setWidth] = useState("15");
  const [height, setHeight] = useState("15");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Puzzle | null>(null);

  const preset = (n: number) => {
    setWidth(String(n));
    setHeight(String(n));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCreated(null);
    setBusy(true);
    try {
      const res = await fetch("/api/puzzles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          title,
          width: width.trim() === "" ? null : Number(width),
          height: height.trim() === "" ? null : Number(height),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setError("You need to log in before creating a puzzle.");
      } else if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
      } else {
        setCreated(data.puzzle as Puzzle);
      }
    } catch {
      setError("Server not reachable.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: "0.75rem", maxWidth: 420 }}>
      <h2>New puzzle</h2>
      <label>
        Title (optional){" "}
        <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: "100%" }} />
      </label>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {PRESETS.map((n) => (
          <button type="button" key={n} onClick={() => preset(n)}>
            {n}×{n}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <label>
          Width{" "}
          <input type="number" value={width} onChange={(e) => setWidth(e.target.value)} style={{ width: "5rem" }} />
        </label>
        <label>
          Height{" "}
          <input type="number" value={height} onChange={(e) => setHeight(e.target.value)} style={{ width: "5rem" }} />
        </label>
      </div>
      <button type="submit" disabled={busy}>
        {busy ? "Creating…" : "Create puzzle"}
      </button>
      {error && <p role="alert" style={{ color: "#b00020", margin: 0 }}>{error}</p>}
      {created && (
        <p style={{ margin: 0 }}>
          Created puzzle <strong>#{created.id}</strong> ({created.width}×{created.height}, {created.status}).
        </p>
      )}
    </form>
  );
}
