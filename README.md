# crossy

Crossword co-construction harness machine. A collaborative crossword **construction** tool for
two constructors, aimed at NYT submission.

## Layout

```
shared/   @crossy/shared — types + pure grid logic (symmetry, numbering, stats, export)
server/   @crossy/server — Hono API + WebSockets; serves the built client in production
client/   @crossy/client — React + Vite frontend
```

Single repo, single deployable: in production the server serves the built client.

## Prerequisites

- Node 22+ (`.nvmrc` pins 22; newer works too)

## Getting started

```bash
npm install          # install all workspaces
npm run dev          # client on :5173 (proxying /api to the server on :3000)
```

Then open http://localhost:5173 — the page shows the server health check status.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Run client + server together (hot reload) |
| `npm run build` | Build shared → client → server into `dist/` |
| `npm start` | Run the production server (serves built client) |
| `npm run typecheck` | Strict TypeScript across all workspaces |
| `npm run test` | Vitest |

## Working together

See [`AGENTS.md`](./AGENTS.md) for how two constructors parallelize safely, and
[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the data model, sync protocol, and NYT
submission requirements. The backlog lives in GitHub issues and milestones.
