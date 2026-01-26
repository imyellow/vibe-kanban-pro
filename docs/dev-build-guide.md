# Dev & Build Guide (Local)

## Dev
- Install dependencies: `pnpm i`
- Start frontend + backend (QA mode recommended): `pnpm run dev:qa`
  - Auto-assigns `FRONTEND_PORT` and `BACKEND_PORT`
  - Check terminal logs for the chosen ports
  - Frontend: `http://localhost:<FRONTEND_PORT>`
  - Backend API: `http://localhost:<BACKEND_PORT>`
- If the QA script is unavailable, use: `pnpm run dev`

Frontend only:
- `pnpm -C frontend run dev -- --port 3000 --host`
- Visit: `http://localhost:3000`

## Build & Preview
- Build frontend for production: `pnpm -C frontend run build`
  - Output: `frontend/dist`
- Preview production build: `pnpm -C frontend run preview -- --host --port 4173`
  - Visit: `http://localhost:4173`

Backend (if you need API access):
- `cargo run --bin server` (local)
- Or `pnpm run backend:dev:watch` (dev mode)

## Database Location
- Dev (debug): `dev_assets/db.sqlite`
- Release (per OS data directory):
  - macOS: `~/Library/Application Support/vibe-kanban/db.sqlite`
  - Linux: `~/.local/share/vibe-kanban/db.sqlite`
  - Windows: `%APPDATA%\\vibe-kanban\\db.sqlite`
