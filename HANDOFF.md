# The Annexation Handoff

This repo is the local-first household app formerly scaffolded as `homeOS`; the user-facing app name is now **The Annexation**.

## Current State

- GitHub remote: `https://github.com/aleksmigul/homeos.git`
- Main branch is `main`.
- Frontend: React + TypeScript + Vite in `apps/web`.
- Backend: Express + TypeScript in `apps/api`.
- Persistence: SQLite database file at `data/homeos.db`, implemented with `sql.js` for portability.
- Shared types: `packages/shared`.
- Current user-facing modules: reusable checklists and travel planner.

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
GOOGLE_CLIENT_ID=
AUTH_ALLOWED_EMAILS=you@example.com
AUTH_SESSION_SECRET=
```

Google Sign-In is required for application routes. Only verified accounts listed
in `AUTH_ALLOWED_EMAILS` can create a signed session cookie.

## Important Implementation Notes

- The `@homeos/*` package names remain internal; do not rename them unless you want a lockfile/import cleanup pass.
- `data/*.db` is ignored by Git. Production or VPS setup needs a persistent writable `data/` directory, or a deliberate DB path in `DATABASE_PATH`.
- The travel planner pre-fills one row per date when a plan is created.
- Checklist runs snapshot their template items, so later template edits do not
  rewrite historical runs.
- Travel row notes are stored as Markdown text in the existing `notes` column.
- The first rich editor attempt used `@uiw/react-md-editor`, but it was glitchy and heavy. It was replaced with `apps/web/src/components/MarkdownNotesEditor.tsx`, a controlled textarea plus toolbar and `react-markdown` preview.
- Existing local test data may include trips like Hawaii/Seattle in `data/homeos.db`, but that DB is not pushed.

## Production

- Production runs from `/srv/homeos` behind nginx.
- The API runs as the unprivileged `homeos` account and listens on loopback only.
- The database is `/var/lib/homeos/homeos.db`.
- Secrets are stored in `/etc/homeos.env`.
- Operational templates, deployment instructions, and backup details are in `ops/`.

## Recent Decisions

- Commits were intentionally kept small/coherent.
- The app was published to the private GitHub repo on `main`.
- The visible app name is **The Annexation** in the sidebar, browser title, README, and API startup log.
