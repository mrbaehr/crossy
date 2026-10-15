import { useEffect, useState } from "react";
import type { Puzzle } from "@crossy/shared";
import { Login } from "./Login";
import { GridEditor } from "./GridEditor";

type Me = { id: number; username: string } | null;

export function App() {
  const [me, setMe] = useState<Me>(null);
  const [checked, setChecked] = useState(false);
  const [openPuzzleId, setOpenPuzzleId] = useState<number | null>(null);

  async function refreshMe() {
    try {
      const res = await fetch("/api/me", { credentials: "same-origin" });
      setMe(res.ok ? (await res.json()).user : null);
    } catch {
      setMe(null);
    } finally {
      setChecked(true);
    }
  }

  useEffect(() => {
    void refreshMe();
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    setMe(null);
    setOpenPuzzleId(null);
  }

  const shell = (children: React.ReactNode) => (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "1.5rem", maxWidth: 900, margin: "0 auto", boxSizing: "border-box" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Crossy</h1>
        {me && (
          <span style={{ fontSize: 14, color: "#555" }}>
            {me.username} · <button onClick={logout} style={{ fontSize: 13 }}>log out</button>
          </span>
        )}
      </header>
      <div style={{ marginTop: "1rem" }}>{children}</div>
    </main>
  );

  if (!checked) return shell(<p>Loading…</p>);
  if (!me) return shell(<Login onLoggedIn={refreshMe} />);
  if (openPuzzleId !== null)
    return shell(<GridEditor puzzleId={openPuzzleId} onBack={() => setOpenPuzzleId(null)} />);
  return shell(<Home onOpen={setOpenPuzzleId} />);
}

function Home({ onOpen }: { onOpen: (id: number) => void }) {
  const [puzzles, setPuzzles] = useState<Puzzle[]>([]);
  const [width, setWidth] = useState("15");
  const [height, setHeight] = useState("15");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/puzzles", { credentials: "same-origin" });
    if (res.ok) setPuzzles((await res.json()).puzzles);
  }
  useEffect(() => {
    void load();
  }, []);

  async function create() {
    setError(null);
    const res = await fetch("/api/puzzles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ title, width: Number(width), height: Number(height) }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) onOpen(data.puzzle.id);
    else setError(data.error ?? `Failed (${res.status})`);
  }

  const preset = (n: number) => {
    setWidth(String(n));
    setHeight(String(n));
  };

  return (
    <div style={{ display: "grid", gap: "2rem", gridTemplateColumns: "minmax(260px, 1fr) 2fr" }}>
      <section>
        <h2>New puzzle</h2>
        <div style={{ display: "grid", gap: "0.6rem", maxWidth: 260 }}>
          <input placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" onClick={() => preset(15)}>15×15</button>
            <button type="button" onClick={() => preset(21)}>21×21</button>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input aria-label="width" value={width} onChange={(e) => setWidth(e.target.value)} style={{ width: 70 }} />
            <span style={{ alignSelf: "center" }}>×</span>
            <input aria-label="height" value={height} onChange={(e) => setHeight(e.target.value)} style={{ width: 70 }} />
          </div>
          <button onClick={create}>Create & open</button>
          {error && <p style={{ color: "crimson", margin: 0 }}>{error}</p>}
        </div>
      </section>
      <section>
        <h2>Puzzles</h2>
        {puzzles.length === 0 ? (
          <p style={{ color: "#777" }}>None yet — create one.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.4rem" }}>
            {puzzles.map((p) => (
              <li key={p.id}>
                <button onClick={() => onOpen(p.id)} style={{ textAlign: "left", width: "100%" }}>
                  {p.title || `Puzzle #${p.id}`} — {p.width}×{p.height} · {p.status}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
