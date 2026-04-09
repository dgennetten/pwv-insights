# Application Shell

## Intent

Persistent **sidebar layout** for PWV Insights: fixed left navigation (full width on desktop, icon rail on tablet, drawer on mobile), main content area for section screens.

## Navigation (wire to your router)

| Label | Suggested path |
|-------|----------------|
| Activity Dashboard | `/dashboard` |
| Trails | `/trails` |
| Leaderboards & Trends | `/leaderboards` |
| Admin | `/admin` (role-gated) |
| Settings | `/settings` |
| Help & About | `/help` |

## User menu

- **Authenticated:** Name, optional email, avatar or initials, **Sign out** (calls `onLogout`).
- **Unauthenticated:** **Sign In** button (connect to your auth flow).

## Props (`AppShell`)

- `children` — Page content
- `activeHref` — Highlights current nav item
- `user` — `{ name, email?, avatarUrl? }` or omit for public
- `onNavigate(href)` — Route changes
- `onLogout()` — Clear session

## Visual reference

No screenshot was bundled in `product/` for the shell; match `spec.md` in the repo (`product/shell/spec.md`) for colors and behavior.
