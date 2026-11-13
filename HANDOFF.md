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
- Travel day notes use `StackEditNotesEditor.tsx` with the Apache-2.0 CLeditor contenteditable engine (`cledit`, from the StackEdit/Classeur editor family), loaded locally through `MarkdownSource.tsx`. Formatting markers remain visible in faint gray; the preview uses `react-markdown` and GFM. Images upload through `/api/share-attachments` and persist as Markdown attachment URLs. Legacy HTML tags are dropped when editing, preserving paragraph breaks and images. Notes are editable directly in the day form, with an icon toolbar and optional split preview (off by default). Standalone Markdown image lines display noneditable image decorations inside the source; those decorations have no text and never enter saved Markdown. Saves are debounced and serialized; Back to itinerary waits until uploads and unsaved changes are complete.
- Editor verification: `pnpm --filter @homeos/web test` and `pnpm --filter @homeos/web test:editor`. For browser tests install Chromium once with `pnpm --filter @homeos/web exec playwright install --with-deps chromium`. Browser fixtures run through the local Vite server; API calls are mocked and do not touch production data.
- Offline travel uses Cache Storage and a versioned service worker that precaches the entire production shell. Travel JSON, emails, and note images download independently of other modules; the heading shows when the download is complete. Successful online note saves update the cached itinerary. Offline mode is read-only, and private downloads clear on account switch/sign-out. `pnpm --filter @homeos/web test:offline` builds and tests actual offline relaunches against a local mock server with service workers enabled.
- Existing local test data may include trips like Hawaii/Seattle in `data/homeos.db`, but that DB is not pushed.

- The developer-only `/codex-terminal` module wraps the actual interactive Codex CLI in persistent tmux sessions, alongside the existing `/dev` queue. The unprivileged API proxies a root-owned Unix-socket terminal bridge; see `ops/README.md` for the one-time service/proxy configuration, session lifecycle and tests. Codex retains workspace-write sandboxing and on-request approvals.

## Production

- Production runs from `/srv/homeos` behind nginx.
- The API runs as the unprivileged `homeos` account and listens on loopback only.
- The database is `/var/lib/homeos/homeos.db`.
- Secrets are stored in `/etc/homeos.env`.
- Operational templates, deployment instructions, and backup details are in `ops/`.

## Recent Decisions

- Commits were intentionally kept small/coherent.
- The app is published to the GitHub repo on `main`; the repository is currently public.
- The visible app name is **The Annexation** in the sidebar, browser title, README, and API startup log.
