# Crossy — Architecture

A collaborative crossword **construction** tool for exactly two constructors who know each
other, working sync or async across many puzzles in parallel. Goal: submitting to the NYT.
Personal utility, not a product. Optimize for simplicity; avoid one-way doors that would
block adding more users later.

## Stack

Adopting the brief's stack as-is — no strong reason to deviate for a two-person tool.

- **Language:** TypeScript end to end, single repo, single deployable.
- **Frontend:** React + Vite. Grid rendered as SVG or CSS grid (decided in the editor issue).
- **Backend:** Node + Hono, `ws` for WebSockets, serving the built frontend in production.
- **DB:** SQLite (better-sqlite3) + Drizzle migrations.
- **Auth:** Minimal — username + password, users seeded from env, httpOnly session cookie.
- **Hosting:** Fly.io, one machine, one volume for SQLite. Litestream replicating to Tigris/S3.
- **CI/CD:** GitHub Actions — typecheck + test on PR/push; deploy on `main`.
- **Tests:** Vitest. Grid logic (symmetry, numbering, stats, export) is **pure functions** with unit tests.

Shared `types`/`core` package holds the data model and the pure grid logic so client, server,
and the Web Worker all reuse one definition.

## Data model (sketch)

Nine tables. Multi-user structure exists now even though there are two users.

- **user** — id, username, password hash. Seeded from env.
- **membership** — (user, puzzle) link. The seam that lets us add users later without a one-way door.
- **puzzle** — size (w×h), `symmetry_enabled`, status (`idea`/`filling`/`cluing`/`ready`/`submitted`), `last_edited_by`, `last_edited_at`.
- **cell** — puzzle ref, (row, col), `letter`, `is_block`, **`rebus`** (multi-char), **`is_circled`**, **`is_shaded`**.
  Rebus/circle/shade are present **from day one** even though their UI lands later (M4+), to avoid a migration under live data.
- **entry** — puzzle ref, direction (across/down), `number`, ordered slot cells, **`is_theme`** (seed/protected) flag.
- **clue_draft** — entry ref, `text`, `author` (user or `"AI"`), `is_chosen`. Many per entry.
- **clue_bank** — global, keyed by `answer`; `clue_text`, source puzzle ref, author. Cross-puzzle reuse.
- **snapshot** — puzzle ref, `name`, `parent` ref (fork lineage), serialized full puzzle state.
- **note** — target (puzzle **or** entry), `author`, `body`, timestamp. Async discussion.

Numbering and stats are **derived** from cells (pure functions), not stored as source of truth.

## Sync protocol (sketch)

Server-authoritative over `ws`. State lives in SQLite; the server is the single arbiter.

- **Granularity:** per-cell operations (letter set, block toggle) and clue operations.
- **Conflict policy:** per-cell **last-write-wins**. Acceptable for two trusted users.
- **Atomic symmetric toggle:** a block toggle on a symmetric puzzle is a **single operation**
  covering both the cell and its 180° partner — it must apply atomically on every client so the
  mirror can never desync. This is the one place LWW-per-cell is explicitly *not* applied cell-by-cell.
- **Presence:** cursor cell + selected entry broadcast over the same socket (ephemeral, not persisted).
- **Reconnect:** client resyncs full authoritative puzzle state on (re)connect.
- **Async:** per-user `last_opened` marker per puzzle; on open, server summarizes changes since then.

## Fill & AI boundary

- **Grid filling stays with the CSP solver**, in a browser Web Worker, over an imported scored word
  list (Broda `WORD;score`). LLMs are poor at letter-level grid constraints.
- **AI is leverage, not replacement**, always opt-in, never automatic: theme ideation, rerank/critique
  of solver output, clue drafts (attributed to `"AI"`), difficulty estimate. All go through one gated
  server endpoint using the Anthropic API key from env.

## Decisions & one-way doors we're deliberately avoiding

- **Multi-user seam now:** `user` + `membership` tables despite two users, so more users don't require a schema rewrite.
- **Rebus/circle/shade in schema from day one:** the costliest migration to defer, so we don't.
- **Derived numbering/stats:** keeping them computed avoids a stored-vs-truth divergence class of bugs.
- **Single deployable:** server serves the built client — one thing to deploy, one thing to reason about.
- **LWW chosen knowingly:** fine for two users; the atomic symmetric-toggle exception is the one carve-out.
  If we ever need true multi-user merge, operations are already discrete and server-authoritative, so CRDT/OT
  could be introduced behind the same op interface without reworking storage.

## Open items / flags from planning

- **NYT limits & submission format must be re-verified against the live NYT page** (it was
  captcha-walled during planning). The cited limits — **78** words themed / **72** themeless (15×15),
  **140** (21×21) — are encoded as named config constants and treated as *to-verify*, owned by the
  NYT-PDF issue (#23) and consumed by stats (#10) and validation (#21).
- **Word lists are per-install and gitignored** — licensing may be unclear; never committed.
- **Litestream** is heavier than strictly necessary for two users, but justified by "don't lose
  NYT-bound work"; sized to not block auth/scaffold.

## Backlog

Nine milestones (M0–M8) tracked as GitHub milestones; every issue carries Context / Scope /
Out-of-scope / testable Acceptance criteria / Depends-on / size, with `good-parallel` marking work
two agents can run concurrently without touching the same files. Issues are the intent substrate for
two constructors operating across this repo remotely.
