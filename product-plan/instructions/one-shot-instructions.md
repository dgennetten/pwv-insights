# PWV Insights — Complete Implementation Instructions

---

## About This Handoff

**What you're receiving:**
- Finished UI designs (React components with full styling)
- Product requirements and user flow specifications
- Design system tokens (colors, typography)
- Sample data showing the shape of data components expect
- Test specs focused on user-facing behavior

**Your job:**
- Integrate these components into your application
- Wire up callback props to your routing and business logic
- Replace sample data with real data from your backend
- Implement loading, error, and empty states

The components are props-based — they accept data and fire callbacks. How you architect the backend, data layer, and business logic is up to you.

---

## Testing

Each section includes a `tests.md` file with UI behavior test specs. These are **framework-agnostic** — adapt them to your testing setup.

**For each section:**
1. Read `product-plan/sections/[section-id]/tests.md`
2. Write tests for key user flows (success and failure paths)
3. Implement the feature to make tests pass
4. Refactor while keeping tests green

---

## Product Summary

See `product-overview.md` for the full product summary, entities, design system, and milestone list.

---

# Milestone 1: Shell

> **Provide alongside:** `product-overview.md`
> **Prerequisites:** None

## Goal

Set up **design tokens** and the **application shell** — persistent sidebar, navigation, user menu / Sign In.

## What to Implement

### 1. Design Tokens

- `product-plan/design-system/tokens.css` — CSS custom properties
- `product-plan/design-system/tailwind-colors.md` — emerald / amber / stone palette
- `product-plan/design-system/fonts.md` — Inter + JetBrains Mono (Google Fonts)

### 2. Application Shell

Copy `product-plan/shell/components/`:

- `AppShell.tsx` — layout wrapper, mobile drawer, `onNavigate` / `onLogout`
- `MainNav.tsx` — Activity Dashboard, Trails, Leaderboards & Trends, Admin, Settings, Help & About
- `UserMenu.tsx` — authenticated user block + **Sign In** button when `user` is undefined

**Wire navigation** to your router (`/dashboard`, `/trails`, `/leaderboards`, `/admin`, `/settings`, `/help`).

**User menu:** pass `user: { name, email?, avatarUrl? }` when logged in; `onLogout` clears session. When no user is passed, a "Sign In" button renders in its place.

**Responsive behavior:**
- Desktop (lg+): fixed 224px sidebar
- Mobile (< md): sidebar hidden; hamburger button opens a full-height overlay drawer

## Files to Reference

- `product-plan/shell/README.md` — Shell design intent
- `product-plan/shell/components/` — AppShell, MainNav, UserMenu

## Done When

- [ ] Design tokens and fonts applied globally
- [ ] Shell renders with all navigation items visible
- [ ] Navigation links to correct routes
- [ ] User menu shows "Sign In" (public) or profile + logout (authenticated)
- [ ] Responsive: desktop sidebar, mobile hamburger + drawer overlay

---

# Milestone 2: Activity Dashboard

> **Provide alongside:** `product-overview.md`
> **Prerequisites:** Milestone 1 (Shell)

## Goal

The primary patrol activity snapshot for PWV Insights. Shows KPI cards, charts, and a sortable trail coverage list. Supports configurable time ranges and a member scope toggle (public users see org-wide aggregates only; authenticated users can view their own or any member's stats).

## Key Functionality

- Time range: Last 7 Days, Last Month, Season to Date, Last Year, All Time
- Member scope: All Members / Me / Other member — **hidden entirely** when not authenticated (public = org aggregates only)
- KPI cards: Patrols, Trails Covered, Trees Cleared, Hikers Contacted (+ prior-period deltas)
- Patrol activity bar chart, trail coverage sortable table (Load more pagination), violations by category, trees cleared by size class (All/By Trail toggle), Members by Age histogram (org-wide scope only)
- Trail drill-down: clicking a trail row opens a patrol list scoped to the same time range + member as the dashboard

## Components

From `product-plan/sections/activity-dashboard/components/`:
`ActivityDashboard.tsx`, `PatrolActivityChart.tsx`, `TrailCoverageList.tsx`, `TrailCoveragePatrolDetail.tsx`, `ViolationsChart.tsx`, `TreesClearedChart.tsx`, `MembersByAgeChart.tsx`

## Props (`ActivityDashboardProps`)

**Data:** `scope`, `summary`, `patrolActivity`, `trailCoverage`, `patrolsByTrailId`, `violationsByCategory`, `treesCleared`, `members`, `membersByAge`, optional `currentUserId`, optional `trailCoveragePageSize`

**Callbacks:** `onTimeRangeChange`, `onMemberChange`, `onTrailSelect`, `onTrailCoverageBack`, `onTrailCoverageSortChange`

## Files to Reference

- `sections/activity-dashboard/README.md` — Feature overview
- `sections/activity-dashboard/tests.md` — UI behavior test specs
- `sections/activity-dashboard/components/` — React components
- `sections/activity-dashboard/types.ts` — TypeScript interfaces
- `sections/activity-dashboard/sample-data.json` — Test data
- `sections/activity-dashboard/screenshot.png` — Visual reference

## Done When

- [ ] Public: no member selector; org-wide aggregates only
- [ ] Authenticated: member selector visible; defaults to "Me"; Members by Age hidden for single-member scope
- [ ] Trail coverage drill-down navigates to patrol list and back
- [ ] All five time range presets fire `onTimeRangeChange`
- [ ] Trail coverage "Load more" paginates correctly
- [ ] Responsive: KPI cards 2x2 on mobile; charts stack vertically

---

# Milestone 3: Trails (Trail Health)

> **Provide alongside:** `product-overview.md`
> **Prerequisites:** Milestones 1-2

## Goal

Per-trail patrol coverage and condition data. Filterable, sortable trail list with efficiency scoring. Trail detail with patrol history, trees, violations, and maintenance — partially gated for public users.

## Key Functionality

- Filter by area, difficulty, wilderness status, under-patrolled flag; search by name or trail number
- Sort by efficiency score (color-coded green/amber/red), patrol count, or last patrol date
- Trail detail: patrol history, trees down/cleared by size class, violations by category, maintenance work log
- **Public gating:** patrol history and violations are blurred with a "Sign in to view" overlay; `onSignInPrompt` wires the CTA
- **Authenticated:** full detail visible

## Components

- `TrailHealth.tsx` — list + detail orchestration
- `TrailList.tsx`, `TrailDetail.tsx`

## Props (`TrailHealthProps`)

**Data:** `trails`, `isAuthenticated?`

**Callbacks:** `onSelectTrail`, `onBackToList`, `onSignInPrompt`

## Files to Reference

- `sections/trails/README.md` — Feature overview
- `sections/trails/tests.md` — UI behavior test specs
- `sections/trails/components/` — React components
- `sections/trails/types.ts` — TypeScript interfaces
- `sections/trails/sample-data.json` — Test data
- `sections/trails/screenshot-list.png` — Trail list visual reference
- `sections/trails/screenshot-detail.png` — Trail detail visual reference

## Done When

- [ ] Trail list filters, search, and sort work
- [ ] Efficiency score badges color-coded green/amber/red
- [ ] Under-patrolled trails show amber warning icon
- [ ] Patrol history and violations blurred with "Sign in to view" overlay when `isAuthenticated` is false
- [ ] `onSignInPrompt` called when user clicks "Sign in" on overlay
- [ ] Back button returns to list and fires `onBackToList`
- [ ] Responsive: filter bar stacks on mobile

---

# Milestone 4: Leaderboards & Trends

> **Provide alongside:** `product-overview.md`
> **Prerequisites:** Milestones 1-3

## Goal

Two-tab section: **Leaderboards** (gamified member contribution rankings with podium, numbered list, current user pinned) and **Trends** (patrol activity, violations, trees, seasonal charts with This Year / Year over Year mode).

## Key Functionality

- Time range: Week to Date, Month to Date, Quarter to Date, Season to Date, All Time
- Category dropdown (Days / Work / Trails / Hours) + metric tabs per category; selection persisted in localStorage
- Podium for top 3, numbered list for rank 4+, current user highlighted/pinned when outside visible range
- Trends: year mode dropdown (This Year / Year over Year) + four chart pills; All Time disables year mode
- **Public:** Trends fully accessible; Leaderboards tab disabled — no names/ranks exposed

## Components

- `LeaderboardsTrends.tsx` — page wrapper, tabs, time range, localStorage
- `Leaderboard.tsx` — podium, ranked list, current user pin
- `TrendCharts.tsx` — year mode, chart type switching, chart rendering

## Props (`LeaderboardsTrendsProps`)

**Data:** `members`, `trends`, `currentUserId` (omit for public), optional defaults

**Callbacks:** `onTimeRangeChange`, `onLeaderboardCategoryChange`, `onMetricChange`, `onSignInPrompt`

## Files to Reference

- `sections/leaderboards-trends/README.md` — Feature overview
- `sections/leaderboards-trends/tests.md` — UI behavior test specs
- `sections/leaderboards-trends/components/` — React components
- `sections/leaderboards-trends/types.ts` — TypeScript interfaces
- `sections/leaderboards-trends/sample-data.json` — Test data
- `sections/leaderboards-trends/screenshot.png` — Leaderboard visual reference
- `sections/leaderboards-trends/screenshot-charts.png` — Trend charts visual reference

## Done When

- [ ] Public: Leaderboards tab disabled; no names/ranks exposed; Trends fully functional
- [ ] Authenticated: podium + list with current user highlight; current user pinned when out of view
- [ ] Category + metric persistence in localStorage works across sessions
- [ ] All four chart types switch correctly; Year over Year uses `trends.yearOverYear` for Patrol Activity
- [ ] Year mode dropdown grays out for All Time
- [ ] Mobile: all elements stack vertically
