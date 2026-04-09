# Test Specs: Leaderboards & Trends

These test specs are **framework-agnostic**. Adapt them to your testing setup (Jest, Vitest, Playwright, Cypress, React Testing Library, etc.).

## Overview

The Leaderboards & Trends section has two tabs: Leaderboards (member contribution rankings with podium treatment) and Trends (org-wide chart suite). Key behaviors: the public/authenticated gating of leaderboards, the category+metric persistence in localStorage, and the time range / year mode controls on Trends.

---

## User Flow Tests

### Flow 1: Public User Views Trends (Leaderboards Gated)

**Scenario:** An unauthenticated user visits Leaderboards & Trends

**Setup:**
- `currentUserId` is not provided (omitted or empty string)
- `trends` has valid data

**Steps:**
1. User navigates to `/leaderboards`
2. User sees the page with “Trends” tab active

**Expected Results:**
- [ ] “Trends” tab is active by default (public users land on Trends)
- [ ] “Leaderboards” tab is **visible but disabled** (not clickable or shows as unavailable)
- [ ] Text explains sign-in is required for leaderboards (e.g., “Sign in to view leaderboards”)
- [ ] No member names, rankings, or scores are rendered on the page
- [ ] Trend charts are **fully functional** — chart type buttons and year mode work
- [ ] Time range controls are visible and interactive

---

### Flow 2: Authenticated User Views Leaderboards

**Scenario:** A logged-in user browses the leaderboard

**Setup:**
- `currentUserId` = `'member-12'`
- `members` has 10 entries, `member-12` is ranked 7th on the active metric

**Steps:**
1. User navigates to `/leaderboards` and sees Leaderboards tab active
2. Podium shows top 3 members
3. List shows members ranked 4–10

**Expected Results:**
- [ ] Podium displays rank 1 (center, elevated), rank 2 (left), rank 3 (right)
- [ ] Each podium slot shows member initials and metric value
- [ ] Members 4–10 shown in numbered list below podium
- [ ] `member-12` (rank 7) row has distinct highlight (green background)
- [ ] `member-12` row shows “You” label

---

### Flow 3: Current User Pinned When Off-Screen

**Scenario:** Logged-in user scrolls list but their rank is beyond the initially visible rows

**Setup:**
- `currentUserId` = `'member-40'`
- `members` has 50 entries; `member-40` is ranked 40th
- Initial visible list rows: ranks 4–10

**Steps:**
1. User sees the leaderboard; ranks 1–3 in podium, 4–10 in list
2. User has not expanded the list yet

**Expected Results:**
- [ ] A “You” pinned row for `member-40` is visible at the bottom of the list, separated by a dashed line
- [ ] The pinned row shows the correct rank (40) and metric value

---

### Flow 4: User Switches Leaderboard Category and Metric

**Scenario:** User changes from Work > Contacts to Days > Patrol Days

**Setup:**
- Default category is “Work”, default metric is “Contacts”

**Steps:**
1. User sees “Work” selected in the category dropdown and “Contacts” active in metric tabs
2. User opens the category dropdown and selects “Days”
3. “Patrol” metric tab is selected automatically (first in Days category)
4. `onLeaderboardCategoryChange` fires with `'days'`
5. `onMetricChange` fires with `'patrolDays'`

**Expected Results:**
- [ ] Category dropdown shows “Days”
- [ ] Metric tabs update to: Patrol, Hike, Stock, Trailwork, Wilderness
- [ ] “Patrol” tab is active
- [ ] Leaderboard list re-ranks members by `patrolDays`
- [ ] Selection is persisted in localStorage

---

### Flow 5: User Views Trends — This Year vs Year over Year

**Scenario:** User switches between “This Year” and “Year over Year” modes

**Setup:**
- `timeRange` = `'year'` (Season to Date)
- `trends.yearOverYear` has 12 month entries

**Steps:**
1. User sees Patrol Activity chart in “This Year” mode
2. User opens year mode dropdown and selects “Year over Year”
3. Chart updates to show paired monthly bars

**Expected Results:**
- [ ] Paired bars appear: one for previous year (stone/gray), one for current year (emerald)
- [ ] Legend shows “Prior year” and “Current year”
- [ ] Period line updates to include year comparison context

---

### Flow 6: All Time Disables Year Mode Dropdown

**Scenario:** User changes time range to “All Time”

**Setup:**
- Year mode dropdown shows “This Year”

**Steps:**
1. User clicks “All Time” in the time range selector
2. Year mode dropdown becomes disabled

**Expected Results:**
- [ ] Year mode dropdown appears grayed out and is not clickable
- [ ] Year mode resets to “This Year” behavior
- [ ] Trend chart shows full-history data

---

## Empty State Tests

### Empty Members Array

**Scenario:** No members in the data (e.g., new organization)

**Setup:**
- `members` = `[]`

**Expected Results:**
- [ ] Page renders without crash
- [ ] Podium area shows empty or placeholder state
- [ ] No error thrown

### Single Member

**Scenario:** Only one member in `members`

**Setup:**
- `members` has 1 entry

**Expected Results:**
- [ ] Podium shows partial or falls back gracefully (less than 3 podium slots)
- [ ] No crashes or layout breaks

---

## Component Interaction Tests

### Time Range Selector

- [ ] Five pill buttons visible: “Week to Date”, “Month to Date”, “Quarter to Date”, “Season to Date”, “All Time”
- [ ] Active pill appears highlighted
- [ ] Clicking any pill fires `onTimeRangeChange` with the correct value

### Leaderboard Controls

- [ ] Category dropdown visible with options: Days, Work, Trails, Hours
- [ ] Default selection is “Work” on first visit (no saved localStorage state)
- [ ] Metric tabs update when category changes
- [ ] Active metric tab highlighted with emerald bottom border

### Trend Charts

- [ ] “This Year” / “Year over Year” dropdown is to the **left** of chart-type pill buttons
- [ ] Four chart pills: “Patrol Activity”, “Violations”, “Trees by Size” (no Seasonal pill)
- [ ] Clicking each pill switches the active chart
- [ ] Active chart pill appears filled emerald

### Category Persistence

- [ ] After selecting “Days > Hike”, refreshing the page restores “Days > Hike” from localStorage
- [ ] Corrupt or stale localStorage falls back to “Work > Contacts” default

---

## Edge Cases

- [ ] Member with all-zero metrics still renders in list without layout breaks
- [ ] Very long member name truncates in podium slot and list row
- [ ] `currentUserId` matching a top-3 member highlights them in the podium with a ring (emerald ring)
- [ ] `onLeaderboardCategoryChange` and `onMetricChange` both fire when category changes (category change resets metric to first in category)
- [ ] Switching chart type buttons does not reset the year mode dropdown

---

## Accessibility Checks

- [ ] Time range buttons are keyboard accessible
- [ ] Category dropdown is keyboard accessible
- [ ] Metric tabs are keyboard accessible and navigable with Tab
- [ ] Sign-in prompt on leaderboard gate is announced to screen readers via `aria-live`
- [ ] Year mode dropdown label is accessible (has `sr-only` label)

---

## Sample Test Data

```typescript
const mockMembers: Member[] = [
  { id: 'member-1',  name: 'Alice Ranger',    initials: 'AR', patrolDays: 45, hikeDays: 5,  stockDays: 0, trailworkDays: 3, wildernessDays: 12, contacts: 512, treesCleared: 28, brushing: 40, fireRings: 2, trash: 15, milesCovered: 180, trailCount: 22, trailTypes: 4, totalHours: 210, patrolHours: 180, nonPatrolHours: 30 },
  { id: 'member-2',  name: 'Bob Trail',       initials: 'BT', patrolDays: 38, hikeDays: 3,  stockDays: 1, trailworkDays: 8, wildernessDays: 6,  contacts: 430, treesCleared: 41, brushing: 90, fireRings: 0, trash: 8,  milesCovered: 155, trailCount: 18, trailTypes: 3, totalHours: 175, patrolHours: 152, nonPatrolHours: 23 },
  { id: 'member-12', name: 'Carol Summit',    initials: 'CS', patrolDays: 12, hikeDays: 1,  stockDays: 0, trailworkDays: 1, wildernessDays: 2,  contacts: 88,  treesCleared: 5,  brushing: 10, fireRings: 0, trash: 3,  milesCovered: 48,  trailCount: 8,  trailTypes: 2, totalHours: 55,  patrolHours: 48,  nonPatrolHours: 7 },
]

const mockTrends: Trends = {
  patrolActivityByWeek: [
    { label: 'Oct W1', count: 12 },
    { label: 'Oct W2', count: 18 },
    { label: 'Oct W3', count: 9 },
  ],
  violationsByMonth: [
    { month: 'Oct', offLeashDog: 4, campfire: 1, nonDesignatedCamping: 2, other: 0 },
    { month: 'Nov', offLeashDog: 3, campfire: 0, nonDesignatedCamping: 1, other: 1 },
  ],
  treesBySizeByMonth: [
    { month: 'Oct', under8in: 3, eightTo15in: 2, sixteenTo23in: 1, twentyFourTo36in: 0, over36in: 0 },
    { month: 'Nov', under8in: 5, eightTo15in: 3, sixteenTo23in: 2, twentyFourTo36in: 1, over36in: 0 },
  ],
  seasonalPatrolsByMonth: [
    { month: 'Oct', patrols: 42 },
    { month: 'Nov', patrols: 38 },
  ],
  yearOverYear: [
    { month: 'Oct', previousYear: 35, currentYear: 42 },
    { month: 'Nov', previousYear: 41, currentYear: 38 },
  ],
}
```
