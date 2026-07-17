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
pnpm dev
```

The web app runs on `http://localhost:5173` and proxies API requests to `http://localhost:4000`.

Set `HOMEOS_PASSWORD` in `.env` if you want the API to require a shared password header later. It is empty by default for local development.

## Architecture Notes

- `apps/web` contains the React app and user-facing modules.
- `apps/api` contains the HTTP API, persistence, and future importer jobs.
- `packages/shared` contains types shared between the frontend and backend.
- `data/` is used for the local SQLite database and is intentionally ignored by Git.

## Future Modules

- Notes and todo lists can be added as new modules alongside travel.
- The Notion importer should live in `apps/api/src/importers/notion` and write into the same domain-oriented tables used by the app.
- Authentication is intentionally simple for now because this is a two-person local app. Google OAuth can be added later without changing the travel data model.
