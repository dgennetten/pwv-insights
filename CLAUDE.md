# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Vite dev server (port 5173)
npm run dev:api      # Node.js dev API server (port 3001) — run in a separate terminal
npm run build        # TypeScript compile + Vite production build
npm run lint         # ESLint across the entire project
npm run preview      # Preview production build locally
npm run build-and-deploy  # Build and SSH-deploy to DreamHost
```

There are no automated tests. Linting is the primary code quality mechanism.

## Local Development Setup

Two servers must run simultaneously:

1. `npm run dev:api` — Node.js dev server (`server/dev-api.mjs`) handles OTP authentication and proxies to the MySQL database on port 3001. Requires a `.env.local` file (copy from `.env.example`) with `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME`.
2. `npm run dev` — Vite dev server that proxies `/api` requests to the dev API.

The dev API can optionally forward requests to production PHP via `PHP_API_UPSTREAM` env var.

## Architecture

**PWV Insights** is an analytics dashboard for Poudre Wilderness Volunteers — tracking patrol reports, trail coverage, member activity, and maintenance data.

### Stack

- **Frontend**: React 19, Vite 6, TypeScript, Tailwind CSS 4, React Router 7, Leaflet (maps)
- **Dev backend**: Node.js (`server/dev-api.mjs`) with MySQL2 + Nodemailer for local OTP auth
- **Prod backend**: PHP API (`php/api/`) deployed to DreamHost
- **Database**: MySQL; schema migrations live in `sql/`

### Frontend Structure (`src/`)

```
pages/          — One file per route (ActivityDashboard, Admin, DataLogger, Help,
                   Leaderboards, Reports, Schedule, Settings, Trails)
components/     — Feature-scoped directories mirroring pages, plus shell/ and auth/
services/       — API call layer (authService, dataLoggerService, settingsService)
contexts/       — AuthContext (sole global state)
types/          — TypeScript interfaces, one file per feature domain
lib/            — Small pure utilities (adminAccess, formatNumber, loggerSettings, theme)
layouts/        — AppLayout wrapping all authenticated pages
```

Pages own route-level state and orchestrate child components. Components are scoped to their feature directory and don't cross domains. Services abstract all `fetch` calls to `/api/...`.

### Backend Structure

```
php/api/        — PHP endpoints organized by feature (auth, dashboard, admin,
                   data-logger, leaderboards, reports, schedule, trails, user)
server/         — Node.js dev-only API server
sql/            — Numbered schema migration files
db/             — CSV sync and repair scripts
scripts/        — Deployment scripts (deploy.mjs)
```

### Design System

- **Colors**: Emerald (primary), Amber (secondary), Stone (neutral)
- **Fonts**: Inter (headings/body), JetBrains Mono (monospace)
- **Themes**: Light/dark with system preference detection
- Design tokens and specs are documented in `product-plan/design-system/`

### Key Domain Concepts

- **Patrol Report** — core data entity; most KPIs aggregate from these
- **Trail** — Canyon Lakes RD FS trails with number, length, difficulty, wilderness status
- **Area** — geographic grouping of trails
- **Tree Down** — fallen tree records by diameter class
- **Violation** — rule infraction records by category
- **Schedule** — planned patrol linking members + trails

Product documentation (features, data model, design specs) lives in `product-plan/`.
