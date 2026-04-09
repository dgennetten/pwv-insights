# Milestone 2: Activity Dashboard

> **Provide alongside:** `product-overview.md`
> **Prerequisites:** Milestone 1 (Shell)

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

The primary patrol activity snapshot for PWV Insights. Shows KPI cards, charts, and a sortable trail coverage list. Supports configurable time ranges and a member scope toggle (public users see org-wide aggregates only; authenticated users can view their own or any member's stats).

## Overview

The Activity Dashboard lets members understand the collective and individual patrol effort of Poudre Wilderness Volunteers. At a glance, users see headline KPIs for the selected time range, a bar chart of patrol activity, a sortable trail coverage table, a violations breakdown, and trees cleared by size class. Authenticated users can also see a member age histogram (org-wide scope only) and switch between All Members and their personal view.

**Key Functionality:**
- Time range selection: Last 7 Days, Last Month, Season to Date, Last Year, All Time
- Member scope: All Members / Me / Other member (admin) — **hidden entirely** when not authenticated
- KPI cards: Patrols, Trails Covered, Trees Cleared, Hikers Contacted (with prior-period deltas)
- Patrol activity bar chart (daily or weekly granularity)
- Trail coverage sortable table with "Load more" pagination; clicking a row opens the trail patrol list
- Trail patrol list detail view (scoped to the same time range + member as the dashboard)
- Violations by category horizontal bar chart
- Trees cleared chart with All Trails / By Trail toggle
- Members by Age histogram — shown only for org-wide scope

## Components Provided

Copy from `product-plan/sections/activity-dashboard/components/`:

| Component | Role |
|-----------|------|
| `ActivityDashboard.tsx` | Page composition, scope controls, internal navigation to trail detail |
| `PatrolActivityChart.tsx` | Bar chart showing patrol volume over time |
| `TrailCoverageList.tsx` | Sortable table with Load more pagination; row click opens patrol detail |
| `TrailCoveragePatrolDetail.tsx` | Trail header + scoped patrol list (same time range + member as dashboard) |
| `ViolationsChart.tsx` | Horizontal bar chart by violation category |
| `TreesClearedChart.tsx` | Size-class grouped bars with All/By Trail toggle |
| `MembersByAgeChart.tsx` | Active vs inactive volunteer histogram by age band |

## Props Reference

**Data props:**

```typescript
interface ActivityDashboardProps {
  scope: DashboardScope            // { timeRange, memberContext }
  summary: ActivitySummary         // KPI numbers + periodLabel
  patrolActivity: PatrolActivityDay[]
  trailCoverage: TrailCoverageRow[]
  patrolsByTrailId: Record<number, CoveragePatrolRow[]>  // for trail detail
  violationsByCategory: ViolationCategory[]
  treesCleared: TreesCleared       // { aggregate, byTrail }
  members: MemberOption[]          // for member selector dropdown
  membersByAge: MemberAgeGroup[]   // shown only for all-members scope
  currentUserId?: number           // omit for public/unauthenticated
  trailCoveragePageSize?: number   // default 50; from org admin settings
}
```

**Callback props:**

| Callback | Triggered When |
|----------|---------------|
| `onTimeRangeChange` | User selects a time range preset |
| `onMemberChange` | User switches member scope (All / Me / another member) |
| `onTrailSelect` | User opens a trail from the trail coverage table |
| `onTrailCoverageBack` | User returns from trail patrol detail to the dashboard |
| `onTrailCoverageSortChange` | User changes the trail coverage sort column or direction |

## Expected User Flows

### Flow 1: View Org-Wide Stats (Public or All Members)

1. User navigates to `/dashboard`
2. User sees four KPI cards: Patrols, Trails Covered, Trees Cleared, Hikers Contacted
3. User clicks a different time range preset ("Last Year")
4. **Outcome:** `onTimeRangeChange('1y')` fires; page data updates to reflect the new time range

### Flow 2: Switch to Personal View (Authenticated)

1. Logged-in user sees "All Members" active in the member selector
2. User clicks "Me"
3. **Outcome:** `onMemberChange(currentUserId)` fires; KPIs update to personal stats; Members by Age chart hides

### Flow 3: Drill Into Trail Coverage Detail

1. User sees the Trail Coverage table with trail rows
2. User clicks "Flowers Road Trail" row
3. **Outcome:** `onTrailSelect(55)` fires; detail view appears showing patrol list for that trail, scoped to the current time range and member

### Flow 4: Return to Dashboard from Trail Detail

1. User is viewing the trail patrol list for "Flowers Road Trail"
2. User clicks "Back to Activity Dashboard"
3. **Outcome:** `onTrailCoverageBack()` fires; dashboard view is restored

## Empty States

- **No trails in scope:** Trail coverage table shows "No trails in this scope"
- **No patrols for selected trail:** Trail patrol detail shows "No patrols match this time range and member scope for this trail."
- **Trail coverage "Load more":** When more rows exist beyond the page size, a "Load more" control appears at the bottom of the table

## Testing

See `product-plan/sections/activity-dashboard/tests.md` for UI behavior test specs covering:
- Public vs. authenticated scope behavior
- Time range and member scope interactions
- Trail coverage drill-down navigation
- Empty state rendering

## Files to Reference

- `product-plan/sections/activity-dashboard/README.md` — Feature overview
- `product-plan/sections/activity-dashboard/tests.md` — UI behavior test specs
- `product-plan/sections/activity-dashboard/components/` — React components
- `product-plan/sections/activity-dashboard/types.ts` — TypeScript interfaces
- `product-plan/sections/activity-dashboard/sample-data.json` — Test data
- `product-plan/sections/activity-dashboard/screenshot.png` — Visual reference

## Done When

- [ ] Public view: no member selector; all KPIs and charts show org-wide aggregates
- [ ] Authenticated view: member selector visible; defaults to "Me"; callbacks update data
- [ ] All five time range presets work and fire `onTimeRangeChange`
- [ ] Trail coverage table is sortable with correct column sort behavior
- [ ] Trail coverage "Load more" paginates correctly
- [ ] Trail patrol detail view renders with correct scope context
- [ ] Members by Age chart visible for org-wide scope; hidden for single-member scope
- [ ] Responsive: KPI cards stack 2×2 on mobile; charts stack vertically
- [ ] Empty states display properly when no data exists for the selected scope
