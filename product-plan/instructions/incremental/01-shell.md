# Milestone 1: Shell

> **Provide alongside:** `product-overview.md`  
> **Prerequisites:** None

---

## About This Handoff

**What you're receiving:** Finished UI designs (React + Tailwind), product requirements, design tokens, sample data shapes, and UI test specs.

**Your job:** Integrate into your app, wire callbacks to routing and auth, replace sample data with real APIs, add loading/error/empty states. Components are props-based.

---

## Goal

Set up **design tokens** and the **application shell** — persistent sidebar, navigation, user menu / Sign In.

## What to Implement

### 1. Design tokens

- `product-plan/design-system/tokens.css` — CSS variables
- `product-plan/design-system/tailwind-colors.md` — emerald / amber / stone
- `product-plan/design-system/fonts.md` — Inter + JetBrains Mono

### 2. Application shell

Copy `product-plan/shell/components/`:

- `AppShell.tsx` — layout wrapper, mobile drawer, `onNavigate` / `onLogout`
- `MainNav.tsx` — Activity Dashboard, Trails, Leaderboards & Trends, Admin, Settings, Help
- `UserMenu.tsx` — authenticated user block + **Sign In** when `user` is undefined

**Wire navigation** to your router (`/dashboard`, `/trails`, `/leaderboards`, `/admin`, `/settings`, `/help`).

**User menu:** pass `user: { name, email?, avatarUrl? }` when logged in; `onLogout` clears session.

## Files to Reference

- `product-plan/shell/README.md`
- `product/shell/spec.md` (in Design OS repo) for responsive and auth notes

## Done When

- [ ] Tokens/fonts applied globally
- [ ] Shell renders with working nav
- [ ] User menu shows Sign In (public) or profile + logout (authenticated)
- [ ] Responsive: desktop sidebar, mobile hamburger + drawer
