# The Annexation Handoff

This repo is the local-first household app formerly scaffolded as `homeOS`; the user-facing app name is now **The Annexation**.

## Current State

- GitHub remote: `https://github.com/aleksmigul/homeos.git`
- Main branch is `main`.
- Frontend: React + TypeScript + Vite in `apps/web`.
- Backend: Express + TypeScript in `apps/api`.
- Persistence: SQLite database file at `data/homeos.db`, implemented with `sql.js` for portability.
- Shared types: `packages/shared`.
- Current user-facing module: travel planner.

## Local Commands

```bash
pnpm install
pnpm dev
pnpm check
pnpm build
```

Default local URLs:

- Web: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:4000`

Environment defaults live in `.env.example`:

```text
API_PORT=4000
DATABASE_PATH=./data/homeos.db
HOMEOS_PASSWORD=
```

`HOMEOS_PASSWORD` is optional. When set, API requests need the `x-homeos-password` header.

## Important Implementation Notes

- The `@homeos/*` package names remain internal; do not rename them unless you want a lockfile/import cleanup pass.
- `data/*.db` is ignored by Git. Production or VPS setup needs a persistent writable `data/` directory, or a deliberate DB path in `DATABASE_PATH`.
- The travel planner pre-fills one row per date when a plan is created.
- Travel row notes are stored as Markdown text in the existing `notes` column.
- The first rich editor attempt used `@uiw/react-md-editor`, but it was glitchy and heavy. It was replaced with `apps/web/src/components/MarkdownNotesEditor.tsx`, a controlled textarea plus toolbar and `react-markdown` preview.
- Existing local test data may include trips like Hawaii/Seattle in `data/homeos.db`, but that DB is not pushed.

## Hostinger/VPS Notes

- This is not deployment-packaged yet.
- For a VPS, likely next steps are:
  - install Node.js and pnpm;
  - run `pnpm install` and `pnpm build`;
  - run API with `node apps/api/dist/server.js`;
  - serve `apps/web/dist` with nginx or another static server;
  - proxy `/api` to the API process;
  - use systemd or pm2 for the API;
  - set `DATABASE_PATH` to a persistent location outside build artifacts.

## Recent Decisions

- Commits were intentionally kept small/coherent.
- The app was published to the private GitHub repo on `main`.
- The visible app name is **The Annexation** in the sidebar, browser title, README, and API startup log.

