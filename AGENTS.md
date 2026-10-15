# AGENTS.md

Two constructors, each with an AI harness, build this repo in parallel. We're friends, we
coordinate, and mistakes are fine. This is a lightweight guide, not a rulebook.

## The one rule that matters

**Pick an issue, drop a comment saying you're on it, work on a branch.** That's it. GitHub
issues are our shared source of truth for who's doing what.

```bash
gh issue comment <N> --body "taking this"
git checkout -b <area>/<short-desc>   # e.g. grid/symmetry-engine
```

## How to stay out of each other's way

- Each issue lists **Depends on** and an **area:** label. Two issues in different areas with no
  shared dependency are safe to run at the same time.
- Issues labeled **`good-parallel`** are explicitly collision-free — grab those freely.
- The **pure grid logic** (symmetry, numbering, stats) lives in the shared package and is the
  easiest stuff to parallelize: pure functions, unit-tested, touched by no one else.

## Current critical path (to "log in + make a grid")

`#1 scaffold → #2 schema → (#3 auth ∥ #8 symmetry) → #11 create-puzzle → #12 editor`

Early on this is mostly serial. Once #2 lands, auth (#3) and the symmetry engine (#8) can go
in parallel — different files, no overlap.

## Working agreements

- **Branches, not direct-to-main**, for anything non-trivial. Open a PR; CI (once #4 lands) runs
  typecheck + test. Self-merge is fine — no formal review required between friends.
- **Grid logic = pure functions with Vitest tests.** Symmetry, numbering, stats, and export must
  be testable by the person who didn't write them.
- **Don't commit word lists or secrets.** Word lists are per-install (licensing); keys live in env.
- **Keep issues honest.** If scope shifts, edit the issue body so the other person sees reality.
- If you touch a file the other issue clearly owns, ping in the issue comment. No big deal, just
  say something.

## Project shape

- TypeScript end to end, single repo, single deployable (server serves the built client).
- `client/` React + Vite · `server/` Hono + ws · `shared/` types + pure grid logic.
- SQLite + Drizzle. Deploys to Fly.io (one machine, one volume), Litestream backs up the DB.

See `docs/ARCHITECTURE.md` for the data model, sync protocol, and NYT submission requirements.
