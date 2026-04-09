# Milestone 4: Leaderboards & Trends

> **Provide alongside:** `product-overview.md`
> **Prerequisites:** Milestones 1–3

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

## Goal

Two-tab section: **Leaderboards** (gamified member contribution rankings) and **Trends** (org-wide chart suite showing patrol activity, violations, trees, and seasonal patterns over time).

## Overview

Leaderboards & Trends encourages member engagement by surfacing who's contributing most and showing how the organization's patrol effort evolves over time. The leaderboard has a podium treatment for top 3 and a numbered list below; the current user is always findable (highlighted inline or pinned at the bottom). Public users see the Trends tab fully but the Leaderboards tab is disabled — no names or rankings are exposed without authentication. Category and metric selections persist across sessions via localStorage.

**Key Functionality:**
- Time range: Week to Date, Month to Date, Quarter to Date, Season to Date, All Time
- Leaderboards: category dropdown (Days / Work / Trails / Hours) + metric tabs per category; podium for top 3; numbered list for rank 4+; current user pinned if outside visible range
- Persistence: last-selected category + metric saved in localStorage and restored on next visit
- Trends: "This Year" / "Year over Year" dropdown + four chart types (Patrol Activity, Violations, Trees by Size, Seasonal); All Time disables the year comparison dropdown
- Public gating: Leaderboards tab is disabled for unauthenticated users; Trends remains fully accessible

## Components Provided

Copy from `product-plan/sections/leaderboards-trends/components/`:

| Component | Role |
|-----------|------|
| `LeaderboardsTrends.tsx` | Page wrapper, tabs, time range, localStorage persistence |
| `Leaderboard.tsx` | Podium treatment, ranked list, current user pin/highlight |
| `TrendCharts.tsx` | Year mode dropdown, chart type pills, chart rendering |

## Props Reference

```typescript
interface LeaderboardsTrendsProps {
  members: Member[]              // All members with all metric values
  trends: Trends                 // All trend chart data series
  currentUserId?: string         // Omit for public; provide for authenticated
  defaultTimeRange?: TimeRange
  defaultLeaderboardCategory?: LeaderboardCategory
  defaultMetric?: LeaderboardMetric
  onTimeRangeChange?: (range: TimeRange) => void
  onLeaderboardCategoryChange?: (category: LeaderboardCategory) => void
  onMetricChange?: (metric: LeaderboardMetric) => void
  onSignInPrompt?: () => void    // Called when public user clicks "Sign in" on leaderboard gate
}
```

**Categories and metrics:**
- **Days:** Patrol, Hike, Stock, Trailwork, Wilderness
- **Work:** Contacts, Trees, Brushing, Fire rings, Trash
- **Trails:** Miles, #Trails, Types
- **Hours:** Total, Patrol, Non-patrol

## Expected User Flows

### Flow 1: Public User Views Trends

1. Unauthenticated user navigates to `/leaderboards`
2. **Outcome:** "Trends" tab is active; "Leaderboards" tab is disabled with "Sign in to view leaderboards" messaging; trend charts render and are fully interactive

### Flow 2: Authenticated User Views Leaderboard

1. Logged-in user navigates to `/leaderboards`
2. User sees Leaderboards tab active with top 3 in podium
3. User changes time range to "Month to Date"
4. **Outcome:** `onTimeRangeChange('month')` fires; leaderboard re-ranks based on the new time window

### Flow 3: Switch Leaderboard Category

1. User opens category dropdown and selects "Days"
2. **Outcome:** Metric tabs update to Patrol / Hike / Stock / Trailwork / Wilderness; "Patrol" selected by default; `onLeaderboardCategoryChange('days')` and `onMetricChange('patrolDays')` fire; selection persisted in localStorage

### Flow 4: View Year over Year Trends

1. User clicks "Trends" tab
2. User opens year mode dropdown and selects "Year over Year"
3. User ensures time range is not "All Time"
4. **Outcome:** Patrol Activity chart shows paired monthly bars (previous year gray, current year emerald) from `trends.yearOverYear`

### Flow 5: All Time Disables Year Mode

1. User clicks "All Time" in time range selector
2. **Outcome:** Year mode dropdown grays out; behavior defaults to This Year–style full history display

## Empty States

- **Empty members array:** Page renders without crash; podium and list show gracefully empty state
- **Current user outside visible list:** Pinned "You" row appears below the list with a dashed separator; shows correct rank and metric value
- **All Time + Year over Year disabled:** Year mode dropdown is grayed out; chart shows full-history data

## Testing

See `product-plan/sections/leaderboards-trends/tests.md` for UI behavior test specs covering:
- Public vs. authenticated access gating
- Leaderboard category and metric interactions
- Current user highlighting and pinning
- Trend chart switching and year mode behavior
- localStorage persistence

## Files to Reference

- `product-plan/sections/leaderboards-trends/README.md` — Feature overview
- `product-plan/sections/leaderboards-trends/tests.md` — UI behavior test specs
- `product-plan/sections/leaderboards-trends/components/` — React components
- `product-plan/sections/leaderboards-trends/types.ts` — TypeScript interfaces
- `product-plan/sections/leaderboards-trends/sample-data.json` — Test data
- `product-plan/sections/leaderboards-trends/screenshot.png` — Leaderboard visual reference
- `product-plan/sections/leaderboards-trends/screenshot-charts.png` — Trend charts visual reference

## Done When

- [ ] Public view: Leaderboards tab disabled; no member names exposed; Trends fully functional
- [ ] Authenticated view: full leaderboard with podium, ranked list, current user highlight
- [ ] Current user pinned below list when outside visible rank range
- [ ] Category dropdown + metric tabs work and persist in localStorage
- [ ] All four trend chart types switch correctly
- [ ] "This Year" / "Year over Year" dropdown works; grays out for All Time
- [ ] Patrol Activity YoY uses `trends.yearOverYear` data
- [ ] Responsive: all elements stack vertically on mobile
