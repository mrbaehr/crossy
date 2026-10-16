# Project status & handoff

Living snapshot of what's built, how to operate it, and what's left. Written so a
fresh agent/tool (or human) can pick up with no prior conversation context. Read this
plus `docs/ARCHITECTURE.md` and `AGENTS.md` before starting.

Last updated: after the offline/PWA work (PR #54).

## Live app

- **URL:** https://crossy-app.fly.dev  (the name `crossy` was taken globally; app is `crossy-app`)
- **Login:** two seeded accounts — `max` and `nick`, password `yellowhat` for both.
  There is no self-registration; these two accounts are the entire allowlist.
- **PWA:** installable ("Add to Home Screen"), works offline for letter/block editing.

## How to run locally

```bash
cd ~/Documents/dev/crossy
npm install
SESSION_SECRET=dev USERS="max:yellowhat,nick:yellowhat" npm run dev
# client http://localhost:5173 (proxies /api to server on :3000)
```

Production build: `npm run build` then `npm start`. `@crossy/shared` must be built
before server/client run — the root `build` script handles order (shared → client → server).

Gates (run before any PR): `npm run typecheck` and `npm run test` (Vitest). CI runs both.

## Deploy (manual — there is no auto-deploy yet)

```bash
fly deploy -a crossy-app --remote-only
```

- Fly org: personal (`mr.baehr@gmail.com`), region `dfw`, one machine, one 1GB volume
  (`crossy_data`) mounting `/data`; SQLite lives at `/data/crossy.db`.
- Secrets already set on Fly: `SESSION_SECRET`, `USERS`. To change passwords:
  `fly secrets set USERS="max:<pw>,nick:<pw>"` then redeploy (boot re-seeds).
- Migrations run automatically on boot. Health check: `GET /api/health`.
- Machine auto-stops when idle and cold-starts on next request (1-2s delay is normal).
- See `docs/DEPLOY.md` for first-time setup details.

## Architecture in one breath

TypeScript monorepo (npm workspaces): `shared/` (types + pure grid/export logic),
`server/` (Hono + better-sqlite3 + Drizzle + `ws`), `client/` (React + Vite). Single
deployable — the server serves the built client. Server is authoritative; realtime sync
fans out persisted changes over WebSockets; per-cell last-write-wins. Full design and the
deliberately-avoided one-way doors are in `docs/ARCHITECTURE.md`.

## What's built (and live)

- **M0:** scaffold, full 9-table schema, auth (scrypt + signed cookie), CI, Fly deploy.
- **Grid editor:** type letters, toggle blocks with 180° symmetry (`.` key), numbering,
  puzzle create, puzzle list, trash + restore.
- **Clues:** sidebar with per-entry status, multiple drafts, choose-one, both-approved,
  author attribution, drafter pinned at top of sidebar.
- **Realtime:** live co-editing + presence (peer cursors) over WebSockets.
- **Export:** `.puz` (verified against a real reader) + filled/unfilled PDF (jspdf).
- **Mobile part 1:** phone layout (grid top, one clue, custom on-screen keyboard) below
  720px; desktop/tablet unchanged (hardware keyboards stay on the web path).
- **Offline/PWA:** installable; app shell precached; puzzles cached in IndexedDB; offline
  edits queue and replay on reconnect.

## What's deferred (and why) — the real backlog

GitHub issues are the source of truth. Note: some closed work shows as "open" because
`Closes #N` didn't always fire — verify against git log / deploy before assuming an issue
is undone. Known-done-but-maybe-open: #4 CI, #5 deploy (lean pass), #35/#36 mobile part 1,
#46 trash.

Genuinely not built yet, roughly in value order:
- **Mobile part 2:** separate all-clues view + mobile clue *review* (writing stays desktop
  — intentional punt, it's deep work that wants a keyboard). Reading/approving on phone is
  the useful mobile clue feature.
- **Word list + autofill (M6):** #27 import Broda `WORD;score`, #28 pattern search,
  #29 CSP autofill in a Web Worker. This is the big "feels like a real tool" gap.
- **Stats & validation:** #10 (word/block counts, min len, dupes, interlock, NYT limits —
  the pure `numberGrid` is done, stats build on it), #21 pre-export checklist.
- **Backups:** #6 Litestream to Tigris/S3. Currently relying on Fly daily volume snapshots
  (5-day retention). Worth doing before serious puzzle work.
- **NYT submission PDF (#23):** strict format (clue-left/answer-right, constructor info on
  grid page, `LastName_Title` filename). The general filled/unfilled PDF (#22) is done;
  this is the submission-specific one. NYT limits/format recorded in ARCHITECTURE.md.
- **Snapshots/notes (#25/#26), clue bank (#17), .ipuz (#24), theme marking (#13),
  async change summary (#20), auto-deploy (#7).**
- **AI assist (M7, #30-#34):** opt-in Anthropic endpoint + theme brainstorm / clue
  suggestions / autofill critique / difficulty estimate. Needs #30 first.

## Known caveats / sharp edges

- **Offline edits trample, by design.** LWW on reconnect — your offline work can overwrite
  or be overwritten for cells edited concurrently. Accepted tradeoff for the "tunnel" case;
  no CRDT/forking. Offline *block* toggles don't recompute numbering until reconnect.
- **Unedited cells in `.puz`:** a white cell never clicked isn't persisted, so the `.puz`
  *solution* defaults it to "A". Affects only the answer grid for untouched cells. Fixable
  by persisting a full cell grid on create.
- **Clue drafts don't live-sync** over WebSocket yet — they poll every 10s / refresh on
  focus. Grid edits DO live-sync. (Deferred as nice-to-have in #16.)
- **Dev-only `npm audit` advisories** (esbuild/vitest) are known and not in the production
  build; fixing needs a breaking vitest major. Ignore for now.
- **No a11y work yet** (deliberate) — custom keyboard has no screen-reader path. Tablet +
  hardware keyboard intentionally uses the desktop web layout instead.

## Working norms (see AGENTS.md)

Branch per issue, PR, CI must pass, self-merge is fine. For parallel/background agents use a
**git worktree per agent** (`git worktree add ../crossy-wt-x -b branch main`) so they never
share a checkout — sharing one checkout caused branch-switch collisions early on. Clean up
worktrees after merge (`git worktree remove`). Don't commit `.env`, `*.sqlite`, `data/`, or
word lists.
