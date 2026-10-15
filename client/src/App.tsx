import { useEffect, useState } from "react";
import { NYT_LIMITS } from "@crossy/shared";
import { CreatePuzzle } from "./CreatePuzzle";

export function App() {
  const [health, setHealth] = useState<string>("checking…");

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setHealth(d.ok ? "connected" : "error"))
      .catch(() => setHealth("server not reachable"));
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: 640, boxSizing: "border-box" }}>
      <h1>Crossy</h1>
      <p>Crossword co-construction harness. Scaffold is up.</p>
      <p>
        Server: <strong>{health}</strong>
      </p>
      <CreatePuzzle />
      <p style={{ color: "#666", fontSize: 14 }}>
        NYT 15×15 limits wired from shared package: {NYT_LIMITS.themed15.maxWords} words,{" "}
        {NYT_LIMITS.themed15.maxBlocks} black squares.
      </p>
    </main>
  );
}
