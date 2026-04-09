# Leaderboards & Trends

## Overview

Single page: **leaderboards** (category dropdown: Days / Work / Trails / Hours — defaults to **Work** for first-time visitors; last category **and** metric tab are saved in `localStorage` key `pwv-leaderboards-category-metric-v1` so they stick across visits) and **org-wide trend charts** (This Year / Year over Year dropdown + four chart types: patrol activity, violations, trees by size, seasonal).

## User Flows

- Change time range (applies to boards + trends)
- Switch category (Days / Work / Trails / Hours) and metric tab
- Scroll to trend charts

## Auth

- **Public:** **Trends** fully visible; **Leaderboards** tab **disabled** (omit `currentUserId`)
- **Logged in:** Full leaderboards; highlight/pin `currentUserId`

## Components

| File | Role |
|------|------|
| `LeaderboardsTrends.tsx` | Tabs, filters, layout |
| `Leaderboard.tsx` | Podium + list |
| `TrendCharts.tsx` | Chart grid |

## Callback props

| Callback | When |
|----------|------|
| `onTimeRangeChange` | Time preset changes |
| `onLeaderboardCategoryChange` | Days / Work / Trails / Hours dropdown |
| `onMetricChange` | Leaderboard metric tab changes |

## Data

See `types.ts` and `sample-data.json`.
