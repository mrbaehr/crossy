import { useState, type FormEvent } from "react";

export function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) onLoggedIn();
      else setError(res.status === 401 ? "Wrong username or password." : `Login failed (${res.status}).`);
    } catch {
      setError("Server not reachable.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: "0.75rem", maxWidth: 320 }}>
      <h2>Log in</h2>
      <label>
        Username
        <input value={username} onChange={(e) => setUsername(e.target.value)} style={{ width: "100%" }} autoFocus />
      </label>
      <label>
        Password
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: "100%" }} />
      </label>
      <button type="submit" disabled={busy || !username || !password}>
        {busy ? "…" : "Log in"}
      </button>
      {error && <p style={{ color: "crimson", margin: 0 }}>{error}</p>}
    </form>
  );
}
