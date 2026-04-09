# Test Specs: Trails (Trail Health)

These test specs are **framework-agnostic**. Adapt them to your testing setup (Jest, Vitest, Playwright, Cypress, React Testing Library, etc.).

## Overview

The Trails section provides a per-trail deep-dive into patrol coverage and condition data. Key behaviors: filtering/sorting the trail list, navigating to trail detail, and the public/authenticated gating of sensitive sections (violations, patrol history).

---

## User Flow Tests

### Flow 1: Browse and Filter the Trail List

**Scenario:** User filters trails by area and wilderness status

**Setup:**
- `trails` contains 15 trails across multiple areas, some wilderness
- No filters active initially

**Steps:**
1. User sees list of all 15 trails
2. User selects "Red Feather Lakes" from the area dropdown
3. User toggles "Wilderness" filter

**Expected Results:**
- [ ] List narrows to only trails in "Red Feather Lakes" that have `wilderness: true`
- [ ] Trail count updates (e.g., "3 of 15 trails")
- [ ] No layout breakage; all remaining rows are visible

---

### Flow 2: Sort by Efficiency Score

**Scenario:** User sorts the trail list by patrol efficiency score

**Setup:**
- `trails` contains multiple trails with varying `efficiencyScore` values

**Steps:**
1. User sees list sorted by efficiency score (default, descending)
2. User clicks "Score" column header
3. Sort direction reverses (ascending)

**Expected Results:**
- [ ] List re-orders so lowest efficiency trails appear first
- [ ] Sort icon on "Score" header indicates ascending order
- [ ] Trails with score ≥ 75 show green badge, 50–74 amber, < 50 red

---

### Flow 3: Open Trail Detail (Authenticated)

**Scenario:** A logged-in user opens a trail's detail view

**Setup:**
- `isAuthenticated` = `true`
- `trails[0]` has `id: 'trail-55'`, full patrol history, violations, maintenance work

**Steps:**
1. User clicks the first trail row
2. `onSelectTrail` fires with `'trail-55'`
3. Detail view renders

**Expected Results:**
- [ ] `onSelectTrail` called with `'trail-55'`
- [ ] Trail name, number, length, area, and difficulty badge are visible
- [ ] Wilderness badge visible if `wilderness: true`
- [ ] "Patrol efficiency score" bar and numeric value shown
- [ ] KPI cards show "Total Patrols", "Seen", "Contacted"
- [ ] Violations by category section is **visible** with bar chart
- [ ] Trees down/cleared section shows size-class breakdown
- [ ] Maintenance work table is visible with rows
- [ ] Patrol history section is **visible** with dated entries

---

### Flow 4: Open Trail Detail (Public — Gated Sections)

**Scenario:** An unauthenticated user opens a trail's detail view

**Setup:**
- `isAuthenticated` = `false` (or omitted)
- Trail has patrol history and violations

**Steps:**
1. User clicks a trail row
2. Detail view renders

**Expected Results:**
- [ ] Trail header, stats, trees, and efficiency score are **visible**
- [ ] Patrol history section is **blurred** with an overlay
- [ ] Overlay contains text: "To view patrol history you must be logged in."
- [ ] Overlay contains a "Sign in" button
- [ ] Clicking "Sign in" calls `onSignInPrompt`
- [ ] Violations section is also **blurred** with "Sign in to view" overlay

---

### Flow 5: Navigate Back to Trail List

**Scenario:** User returns from trail detail to the trail list

**Setup:**
- Currently viewing trail detail for `'trail-55'`
- List had "Red Feather Lakes" area filter active

**Steps:**
1. User clicks "Trails" back button
2. `onBackToList` fires

**Expected Results:**
- [ ] List view is shown again
- [ ] `onBackToList` is called
- [ ] Previously active filters are restored (implementation may choose to preserve or reset)

---

### Flow 6: Under-Patrolled Toggle

**Scenario:** User activates the under-patrolled quick-filter

**Setup:**
- 3 of 15 trails have `underPatrolled: true`

**Steps:**
1. User clicks "Under-patrolled" toggle button
2. List filters to only under-patrolled trails

**Expected Results:**
- [ ] Only 3 trails remain visible
- [ ] Each visible trail shows an amber warning icon
- [ ] Count updates to "3 of 15 trails"

---

## Empty State Tests

### No Trails Match Filters

**Scenario:** Applied filters return no results

**Setup:**
- User has selected an area with no wilderness trails and toggled "Wilderness" filter

**Expected Results:**
- [ ] "No trails match the current filters." message is visible
- [ ] No trail rows are rendered
- [ ] Table headers still visible

### Trail with No Patrol History

**Scenario:** Trail has `patrolHistory: []`

**Expected Results:**
- [ ] "No patrols recorded." message in the patrol history section
- [ ] Other detail sections (trees, violations, maintenance) still render correctly

### Trail with No Violations

**Scenario:** Trail has `violationsByCategory: []`

**Expected Results:**
- [ ] "No violations recorded." message in the violations section

### Trail with No Maintenance Work

**Scenario:** Trail has `maintenanceWork: []`

**Expected Results:**
- [ ] "No maintenance work recorded." message in the maintenance section

---

## Component Interaction Tests

### TrailList

**Efficiency score badges:**
- [ ] Score ≥ 75 shows green (`bg-emerald-100 text-emerald-700`) badge
- [ ] Score 50–74 shows amber badge
- [ ] Score < 50 shows red badge

**Status indicators in trail rows:**
- [ ] Wilderness trails show a leaf icon
- [ ] Under-patrolled trails show an amber warning icon
- [ ] Trails with uncleared trees show a count badge (orange)

**Search:**
- [ ] Typing a trail name filters rows matching that name
- [ ] Typing a trail number (e.g., "944") filters by trail number

### TrailDetail

**Efficiency bar:**
- [ ] Progress bar width matches `efficiencyScore / 100`
- [ ] Color matches score tier (green/amber/red)

**Trees section:**
- [ ] Each size class row shows "down" and "cleared" counts
- [ ] Remaining trees shown in amber; fully cleared shown in emerald
- [ ] Legend shows "Down" and "Cleared" color keys

---

## Edge Cases

- [ ] Very long trail name truncates in list row without overflowing layout
- [ ] Trail with `efficiencyScore: 0` renders the bar at zero width without crash
- [ ] Trail with all trees cleared shows "cleared" label for each size class
- [ ] Switching from authenticated to unauthenticated state hides patrol history correctly
- [ ] Trail with `patrolCount: 0` and null `lastPatrolDate` shows "Never" for last patrol

---

## Accessibility Checks

- [ ] Filter buttons (area dropdown, difficulty, wilderness, under-patrolled) are keyboard accessible
- [ ] Sort buttons have aria labels or visible text labels
- [ ] Back button returns focus appropriately
- [ ] Sign-in overlay is announced to screen readers via `aria-live`

---

## Sample Test Data

```typescript
const mockTrail: Trail = {
  id: 'trail-55',
  name: 'Flowers Road Trail',
  trailNumber: 944,
  lengthMiles: 4.2,
  area: 'Lower Poudre Canyon',
  difficulty: 'moderate',
  wilderness: false,
  patrolCount: 8,
  patrolFrequency: 1.5,
  hikersSeen: 241,
  hikersContacted: 198,
  efficiencyScore: 72,
  underPatrolled: false,
  patrolHistory: [
    { date: '2026-03-28', memberName: 'Alice Ranger', hikersSeen: 31, hikersContacted: 25, durationHours: 4 },
    { date: '2026-03-15', memberName: 'Bob Trail', hikersSeen: 18, hikersContacted: 14, durationHours: 3 },
  ],
  treesDown: { small: 3, medium: 1, large: 0, xl: 0, xxl: 0 },
  treesCleared: { small: 3, medium: 0, large: 0, xl: 0, xxl: 0 },
  violationsByCategory: [
    { category: 'Off-leash dog', count: 4 },
    { category: 'Non-designated camping', count: 2 },
  ],
  maintenanceWork: [
    { date: '2026-03-15', workType: 'Brushing', quantity: 120, unit: 'ft', notes: 'Cleared brush along upper switchbacks' },
  ],
}

const mockUnderPatrolledTrail: Trail = {
  ...mockTrail,
  id: 'trail-77',
  name: 'Signal Mountain Trail',
  trailNumber: 940,
  area: 'Red Feather Lakes',
  wilderness: true,
  patrolCount: 1,
  efficiencyScore: 22,
  underPatrolled: true,
  patrolHistory: [],
}

const mockTrails: Trail[] = [mockTrail, mockUnderPatrolledTrail]
```
