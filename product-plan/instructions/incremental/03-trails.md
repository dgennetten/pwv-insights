# Milestone 3: Trails (Trail Health)

> **Provide alongside:** `product-overview.md`
> **Prerequisites:** Milestones 1–2

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

A per-trail view of patrol coverage and condition data for all trails in the Canyon Lakes Ranger District. Provides a filterable, sortable trail list and a detail view per trail with patrol history, tree clearing data, violations, and maintenance logs.

## Overview

The Trails section helps PWV leadership understand which trails are getting adequate coverage relative to visitor pressure. The trail list shows an efficiency score (green ≥ 75, amber 50–74, red < 50), patrol count, and last patrol date. An “under-patrolled” flag surfaces trails that need more coverage. Clicking a trail opens a detailed view. Public users can see the list and basic trail stats; the violation records and patrol history are blurred with a “Sign in to view” prompt for unauthenticated users.

**Key Functionality:**
- Filter by geographic area (7 areas in Canyon Lakes RD), difficulty, wilderness status, under-patrolled flag
- Sort by patrol efficiency score, patrol count, or last patrol date
- Search by trail name or trail number
- Trail detail: patrol history, trees down/cleared by size class, violations by category, maintenance work log
- Public gating: violations and patrol history are blurred with a “Sign in to view” overlay

## Components Provided

Copy from `product-plan/sections/trails/components/`:

| Component | Role |
|-----------|------|
| `TrailHealth.tsx` | Orchestrates list → detail navigation |
| `TrailList.tsx` | Filterable, sortable trail list with search |
| `TrailDetail.tsx` | Full trail detail with gated patrol history and violations |

## Props Reference

```typescript
interface TrailHealthProps {
  trails: Trail[]
  isAuthenticated?: boolean  // false/undefined = public; true = full detail
  onSelectTrail?: (trailId: string) => void
  onBackToList?: () => void
  onSignInPrompt?: () => void  // called when user clicks “Sign in” on gate overlay
}
```

## Expected User Flows

### Flow 1: Filter and Browse Trail List

1. User sees the full trail list with filters above
2. User selects “Red Feather Lakes” from the area dropdown
3. User toggles “Wilderness” filter
4. **Outcome:** List narrows to wilderness trails in Red Feather Lakes; count updates

### Flow 2: Sort by Efficiency Score

1. User sees list sorted by efficiency score descending (default)
2. User clicks the “Score” column header to sort ascending
3. **Outcome:** Under-patrolled trails with lowest scores move to the top

### Flow 3: View Trail Detail (Authenticated)

1. User clicks a trail row
2. `onSelectTrail(trail.id)` fires
3. **Outcome:** Detail view shows patrol history, trees down/cleared, violations, maintenance; all sections fully visible

### Flow 4: View Trail Detail (Public — Gated)

1. Unauthenticated user clicks a trail row
2. Detail view renders
3. **Outcome:** Trail header, stats, efficiency score, trees section are visible; patrol history and violations are blurred with “Sign in to view” overlays; clicking “Sign in” calls `onSignInPrompt`

### Flow 5: Return to Trail List

1. User clicks the “Trails” back button in detail view
2. **Outcome:** `onBackToList()` fires; list view is restored

## Empty States

- **No trails match filters:** “No trails match the current filters.” message in the table
- **No patrol history:** “No patrols recorded.” in the patrol history section
- **No violations:** “No violations recorded.” in the violations section
- **No maintenance work:** “No maintenance work recorded.” in the maintenance section

## Testing

See `product-plan/sections/trails/tests.md` for UI behavior test specs covering:
- List filter and sort behavior
- Trail detail — authenticated vs. public gating
- Navigation between list and detail
- Empty state rendering

## Files to Reference

- `product-plan/sections/trails/README.md` — Feature overview
- `product-plan/sections/trails/tests.md` — UI behavior test specs
- `product-plan/sections/trails/components/` — React components
- `product-plan/sections/trails/types.ts` — TypeScript interfaces
- `product-plan/sections/trails/sample-data.json` — Test data
- `product-plan/sections/trails/screenshot-list.png` — Trail list visual reference
- `product-plan/sections/trails/screenshot-detail.png` — Trail detail visual reference

## Done When

- [ ] Trail list renders with all filter, search, and sort controls working
- [ ] Efficiency score badges color-coded correctly (green/amber/red)
- [ ] Under-patrolled trails show amber warning icon
- [ ] Trail detail renders with patrol history, trees, violations, maintenance
- [ ] Public gating: patrol history and violations blurred with “Sign in to view” overlay
- [ ] `onSignInPrompt` called when user clicks “Sign in” on gated sections
- [ ] Back button returns to list and fires `onBackToList`
- [ ] Responsive on mobile: filters stack, table scrolls horizontally if needed
