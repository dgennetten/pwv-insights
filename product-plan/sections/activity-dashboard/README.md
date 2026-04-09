# Activity Dashboard

## Overview

Primary PWV Insights view: patrol snapshot for the org or a selected member over a chosen time range — KPIs plus patrol activity, trail coverage, violations, trees cleared, and member age distribution.

## User Flows

- Change time range (7d / 1m / 3m / 1y / all) to refilter the page
- When logged in: switch All Members / Me / Other member (admin)
- Scan KPIs, charts, and sortable trail coverage; **click a trail row** to open the **patrol list** detail (same idea as Trails list → detail); **Back** returns to the dashboard

## Auth

- **Public:** Org-wide aggregates only; **member selector hidden**
- **Logged in:** Member selector visible; default **Me**

## Components

| File | Role |
|------|------|
| `ActivityDashboard.tsx` | Page shell, scope UI, composes charts |
| `PatrolActivityChart.tsx` | Bar chart by day/week |
| `TrailCoverageList.tsx` | Sortable coverage table; row click opens patrol detail |
| `TrailCoveragePatrolDetail.tsx` | Trail header + patrol rows (same **time range** and **member** scope as the dashboard) |
| `ViolationsChart.tsx` | Horizontal bars by category |
| `TreesClearedChart.tsx` | Size-class chart, aggregate vs by trail |
| `MembersByAgeChart.tsx` | Age histogram |

## Callback props

| Callback | When |
|----------|------|
| `onTimeRangeChange` | User picks a time preset |
| `onMemberChange` | User changes member scope |
| `onTrailSelect` | User opens a trail from coverage (navigates to patrol list) |
| `onTrailCoverageBack` | User returns from patrol list to the dashboard |
| `onTrailCoverageSortChange` | User changes sort column/direction |

## Data

See `types.ts` and `sample-data.json`.
