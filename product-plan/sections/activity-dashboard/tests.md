# Test Specs: Activity Dashboard

These test specs are **framework-agnostic**. Adapt them to your testing setup (Jest, Vitest, Playwright, Cypress, React Testing Library, etc.).

## Overview

The Activity Dashboard is the primary view of PWV Insights — a configurable patrol activity snapshot with KPI cards, charts, and a trail coverage drill-down. Key behaviors: time range selection, member scope (public vs. logged in), and the trail coverage detail navigation.

---

## User Flow Tests

### Flow 1: Public User Views Org-Wide Stats

**Scenario:** An unauthenticated user visits the Activity Dashboard

**Setup:**
- `currentUserId` is not provided (omitted or undefined)
- `scope.memberContext` is `'all'`
- `summary` has valid data (e.g., `patrols: 42`, `patrolsDelta: 5`)

**Steps:**
1. User navigates to `/dashboard`
2. User sees the page title "Activity Dashboard"
3. User sees the period label (e.g., "Mar 23 – Mar 30, 2026")

**Expected Results:**
- [ ] Member selector ("All Members" / "Me" / "Other member") is **not visible** anywhere on the page
- [ ] KPI card labeled "Patrols" shows `42`
- [ ] KPI card delta shows "+5 vs prior"
- [ ] KPI cards for "Trails Covered", "Trees Cleared", "Contacted" are visible
- [ ] "Members by Age" chart is visible (org-wide scope = all)
- [ ] Patrol activity chart renders bars
- [ ] Trail coverage table renders rows

---

### Flow 2: Authenticated User Switches Scope to "Me"

**Scenario:** A logged-in user changes from "All Members" to their own stats

**Setup:**
- `currentUserId` = `101` (a valid `personId`)
- `scope.memberContext` starts as `'all'`
- `members` contains a member with `personId: 101`

**Steps:**
1. User sees "All Members" button active in the member selector
2. User clicks "Me"
3. `onMemberChange` fires with `101`
4. Page re-renders with updated `scope.memberContext = 101`

**Expected Results:**
- [ ] "Me" button appears active (highlighted)
- [ ] `onMemberChange` is called with `101`
- [ ] "Members by Age" chart is **hidden** (single-member scope)
- [ ] KPI cards update to reflect the member's personal stats
- [ ] Period label updates or remains accurate

---

### Flow 3: User Changes Time Range

**Scenario:** User clicks a different time range preset

**Setup:**
- `scope.timeRange` starts as `'1m'` (Last Month)

**Steps:**
1. User sees "Last Month" button active in the time range selector
2. User clicks "Last Year"
3. `onTimeRangeChange` fires with `'1y'`

**Expected Results:**
- [ ] "Last Year" button appears active
- [ ] `onTimeRangeChange` is called with `'1y'`
- [ ] All time range pill options are visible: "Last 7 Days", "Last Month", "Season to Date", "Last Year", "All Time"

---

### Flow 4: User Drills Into Trail Coverage Detail

**Scenario:** User clicks a trail row to see patrol history for that trail

**Setup:**
- `trailCoverage` contains a trail with `trailId: 55`, `trailName: "Flowers Road Trail"`
- `patrolsByTrailId[55]` contains 3 patrol rows

**Steps:**
1. User sees "Trail Coverage" table with "Flowers Road Trail" row
2. User clicks the "Flowers Road Trail" row
3. `onTrailSelect` fires with `55`
4. Detail view renders

**Expected Results:**
- [ ] `onTrailSelect` called with `55`
- [ ] Detail view shows "Back to Activity Dashboard" button
- [ ] Trail header shows "Flowers Road Trail"
- [ ] Scope subtitle shows current period label and member scope label
- [ ] 3 patrol rows are visible in the patrol table
- [ ] Each patrol row shows date, member name, duration, seen count, contacted count

---

### Flow 5: User Returns from Trail Detail

**Scenario:** User clicks "Back to Activity Dashboard" from the trail patrol detail view

**Setup:**
- Currently viewing trail detail for `trailId: 55`

**Steps:**
1. User clicks "Back to Activity Dashboard"
2. `onTrailCoverageBack` fires

**Expected Results:**
- [ ] Dashboard view is restored
- [ ] Trail coverage table is visible again
- [ ] `onTrailCoverageBack` is called

---

## Empty State Tests

### Trail Coverage — No Patrols in Scope

**Scenario:** Selected trail has no patrols matching the current time range + member scope

**Setup:**
- `patrolsByTrailId[55]` = `[]` (empty array)
- User navigates to trail detail for trail `55`

**Expected Results:**
- [ ] Empty state message is visible (e.g., "No patrols match this time range and member scope for this trail.")
- [ ] No patrol rows rendered
- [ ] Back button still available

### Trail Coverage — No Trails in Scope

**Scenario:** Current filter scope returns no trails

**Setup:**
- `trailCoverage` = `[]`

**Expected Results:**
- [ ] "No trails in this scope" message appears in the table area
- [ ] Count shows "0 trails"

---

## Component Interaction Tests

### KPI Cards

**Renders correctly:**
- [ ] Shows "Patrols" label with large numeric value
- [ ] Shows "Trails Covered" label
- [ ] Shows "Trees Cleared" label
- [ ] Shows "Contacted" label (hikers contacted)
- [ ] Positive `delta` shows green arrow and "+N vs prior"
- [ ] Zero `delta` shows "No change"
- [ ] Negative `delta` shows red arrow and "-N vs prior"

### Trail Coverage Table

**Sorting:**
- [ ] Clicking "Patrols" header changes sort; clicking again reverses direction
- [ ] Clicking "Trail" header sorts alphabetically
- [ ] Clicking "Contacted" header sorts by hikers contacted
- [ ] `onTrailCoverageSortChange` fires with the correct key and direction

**Trail rows:**
- [ ] Wilderness trails show "WLD" badge
- [ ] Trails with `patrols: 0` appear dimmed and show a warning icon
- [ ] Row click triggers navigation to trail detail

### Members by Age Chart

- [ ] Visible when `scope.memberContext === 'all'`
- [ ] **Hidden** when `scope.memberContext` is a number (Me or another member)

---

## Edge Cases

- [ ] `patrolActivity` with all zeros renders without division-by-zero errors
- [ ] Trail with very long name is truncated in table without breaking layout
- [ ] Large `trailCoverage` array (50+ rows) shows pagination/load-more control when exceeding `trailCoveragePageSize`
- [ ] Load more button shows "N more" count and loads additional rows
- [ ] `periodLabel` is displayed in the page header

---

## Accessibility Checks

- [ ] Time range buttons are keyboard accessible (Tab + Enter)
- [ ] Member selector buttons are keyboard accessible
- [ ] Sort buttons in trail coverage table have clear labels
- [ ] Detail view back button is keyboard accessible and returns focus to list

---

## Sample Test Data

```typescript
const mockScope: DashboardScope = {
  timeRange: '1m',
  memberContext: 'all',
}

const mockSummary: ActivitySummary = {
  patrols: 42,
  patrolsDelta: 5,
  trailsCovered: 18,
  trailsCoveredDelta: -2,
  treesCleared: 7,
  treesClearedDelta: 0,
  hikersContacted: 312,
  hikersContactedDelta: 28,
  volunteerHours: 189,
  totalActiveMembers: 34,
  periodLabel: 'Mar 1 – Mar 31, 2026',
}

const mockTrailCoverage: TrailCoverageRow[] = [
  {
    trailId: 55,
    trailName: 'Flowers Road Trail',
    trailNumber: '944',
    area: 'Lower Poudre Canyon',
    lengthMiles: 4.2,
    inWilderness: false,
    patrols: 8,
    members: 5,
    hikersSeen: 241,
    hikersContacted: 198,
    lastPatrolDate: '2026-03-28',
  },
  {
    trailId: 77,
    trailName: 'Signal Mountain Trail',
    trailNumber: '940',
    area: 'Red Feather Lakes',
    lengthMiles: 2.1,
    inWilderness: true,
    patrols: 0,
    members: 0,
    hikersSeen: 0,
    hikersContacted: 0,
    lastPatrolDate: null,
  },
]

const mockPatrolsByTrailId: Record<number, CoveragePatrolRow[]> = {
  55: [
    { date: '2026-03-28', memberName: 'Alice Ranger', hikersSeen: 31, hikersContacted: 25, durationHours: 4 },
    { date: '2026-03-15', memberName: 'Bob Trail', hikersSeen: 18, hikersContacted: 14, durationHours: 3 },
    { date: '2026-03-02', memberName: 'Alice Ranger', hikersSeen: 22, hikersContacted: 19, durationHours: 5 },
  ],
  77: [],
}
```
