# The Annexation

A small local-first household web app. The first module is a travel planner, with room for notes, todos, and future Notion imports.

## Stack

- Frontend: React + TypeScript + Vite
- Backend: Node.js + TypeScript + Express
- Database: SQLite
- Package manager: pnpm workspaces

## Local Development

```powershell
pnpm install
cp .env.example .env
pnpm dev
```

The web app runs on `http://localhost:5173` and proxies API requests to `http://localhost:4000`.

Google authentication is configured with the variables documented in `.env.example`.
Use a Google OAuth web client for `GOOGLE_CLIENT_ID`, list permitted accounts in
`AUTH_ALLOWED_EMAILS`, and generate a random `AUTH_SESSION_SECRET`.
Production secrets belong in `/etc/homeos.env`, never in this repository.

## Architecture Notes

- `apps/web` contains the React app and user-facing modules.
- `apps/api` contains the HTTP API, persistence, and future importer jobs.
- `packages/shared` contains types shared between the frontend and backend.
- `data/` is used for the local SQLite database and is intentionally ignored by Git.

## Agent module API

HomeOS exposes a discoverable REST API for trusted local agents. It uses the
same `CODEX_WORKER_TOKEN` bearer token as the Codex worker and is separate from
the browser/session API. Start with the catalog rather than assuming which
modules or actions exist:

```bash
node scripts/homeos-action.mjs modules
node scripts/homeos-action.mjs describe shopping
node scripts/homeos-action.mjs content shopping
node scripts/homeos-action.mjs act shopping addItems '{"items":["milk","dish soap"]}'
```

`GET /api/internal/modules` lists every module, explains its content, and gives
the path, description, and JSON input schema for each supported action. Every
module supports `GET /api/internal/modules/:module/content`; mutations use
`POST /api/internal/modules/:module/actions/:action`. The catalog currently
covers checklists, to-dos, shopping, travel and its inbox, bookmarks, and voice
notes. Binary audio/image upload remains on the browser API, but agents can
inspect the resulting metadata and transcripts.

For user-scoped modules, set `HOMEOS_USER` in the helper environment (or send
`X-HomeOS-User`) to an address in `AUTH_ALLOWED_EMAILS`. It is optional when only
one account is configured and required when multiple accounts are configured.
`HOMEOS_API_URL` can override the helper's default `http://127.0.0.1:4000/api`.
The API must be running and `CODEX_WORKER_TOKEN` must be available to the helper.

## Modules

- **Checklists** creates reusable task templates, starts focused checklist runs,
  and keeps immutable run history.
- **Travel** organizes trip days, accommodations, and Markdown notes.
  Its inbox receives forwarded confirmations through the VPS's Postfix mail
  receiver and a durable local queue. A signed Resend webhook is also supported.

## Local day notes

Day notes use an editor bundled with HomeOS; opening the editor does not load
StackEdit or send notes to a third-party editor. It supports Markdown, live
preview, bold/italic, headings, lists, links, and PNG/JPEG/WebP/GIF images up to
12 MB each. Upload images with **Add image**, paste them, or drop them into the
source field. Images are stored through the existing authenticated HomeOS
attachment API. Existing Markdown, StackEdit notes, and legacy HTML remain
editable; legacy HTML opens as HTML source to preserve its formatting.

Changes save automatically through the day-notes API, in order. Saving and
uploading require a running HomeOS API and a connection to it. Previously linked
remote images still require access to their source. This is a basic local editor,
not a bundled copy of the full StackEdit application: cloud synchronization,
publishing, math, diagrams, and other StackEdit extensions are unavailable.

## Offline travel

Open the installed app while connected and wait for **Available offline** under
the Travel heading. Trips, day notes, note images, the travel inbox, and trip
emails are downloaded automatically. You can then close and reopen the app
without internet and browse any downloaded trip. Offline travel is read-only;
editing, creating, and deleting trips require a connection.

Downloads use the browser's Cache Storage and a service worker, with persistent
storage requested where supported. App updates preserve the offline copy.
Switching accounts or signing out removes private downloads. The same offline
support also works in a normal browser on supported devices.

Verify a production build with a real worker and a local mock API using
`pnpm --filter @homeos/web test:offline`.

## Production

Production runs from `/srv/homeos` as the unprivileged `homeos` user. Nginx serves
the frontend and proxies `/api` to the API on `127.0.0.1:4000`. Configuration and
deployment helpers live in `ops/`; see `ops/README.md` before deploying.

## Future Modules

- Notes and todo lists can be added as new modules alongside travel.
- The Notion importer should live in `apps/api/src/importers/notion` and write into the same domain-oriented tables used by the app.
- Authentication is intentionally simple for now because this is a two-person local app. Google OAuth can be added later without changing the travel data model.
