# PWV Insights — Product Overview

## Summary

A data-rich analytics dashboard for Poudre Wilderness Volunteers (PWV) members. Transforms raw patrol data from the Canyon Lakes Ranger District into intuitive, interactive visualizations — replacing a cumbersome legacy reporting site with a fast, insights-driven experience accessible to all active members.

**Problems addressed:** buried data with no big picture; trail coverage blind spots; invisible volunteer effort; need to protect sensitive violation and PII detail behind login.

## Planned Sections

1. **Activity Dashboard** — Configurable snapshot of patrol activity across the organization or for an individual member, with switchable time ranges and headline KPIs (patrols, trails covered, trees cleared, hikers contacted). Default logged-in view emphasizes the current member’s stats.

2. **Trails** — Per-trail patrol coverage and condition data: efficiency score, filters by area/difficulty/wilderness, detail with patrol history, trees, violations, and maintenance work.

3. **Leaderboards + Trends** — Rankings across multiple contribution metrics plus org-wide trend charts (This Year vs year-over-year mode and four chart types: patrol, violations, trees by size, seasonal).

## Product Entities

- **Member** — Registered volunteer; profile, patrol participation, stats.
- **PatrolReport** — Submitted patrol record for a trail/date; central fact for aggregates.
- **Trail** — Named FS trail in Canyon Lakes RD; number, length, difficulty, wilderness.
- **Area** — Geographic region grouping trails (seven canonical areas).
- **TreeDown** — Fallen tree on patrol, by diameter class.
- **Violation** — Rule violation on trail, by category.
- **ParkingLot** — Trailhead parking; counts feed visitor-pressure signals.
- **TrailWork** — Maintenance/clearing during a patrol.
- **Schedule** — Planned patrol linking to trails and members.

## Design System

**Colors (Tailwind palette names):**

- Primary: **emerald**
- Secondary: **amber**
- Neutral: **stone**

**Typography:**

- Heading: **Inter**
- Body: **Inter**
- Mono: **JetBrains Mono**

## Implementation Sequence

Build in milestones:

1. **Shell** — Design tokens and application shell (sidebar, nav, user menu).
2. **Activity Dashboard** — KPIs, charts, trail coverage, member scope.
3. **Trails** — List, filters, detail, public vs authenticated gating for sensitive blocks.
4. **Leaderboards + Trends** — Podium + list, trend charts, leaderboard gating for public.

Each milestone has a dedicated file under `product-plan/instructions/incremental/`.
