# Trails (Trail Health)

## Overview

Browse all district trails with filters and efficiency scoring; open a **detail** view for patrol history, trees, violations, and maintenance.

## User Flows

- Filter by area, difficulty, wilderness, under-patrolled
- Sort by efficiency score or patrol count / last patrol
- Click row → detail; **Back** returns to filtered list

## Auth

- **Public:** List + basic stats; in detail, **violations** and **patrol notes** blurred with “Sign in to view”
- **Logged in:** Full detail

## Components

| File | Role |
|------|------|
| `TrailHealth.tsx` | List/detail state, gating |
| `TrailList.tsx` | Filter bar + table |
| `TrailDetail.tsx` | Header, stats, history, gated blocks |

## Callback props

| Callback | When |
|----------|------|
| `onSelectTrail` | User opens a trail |
| `onBackToList` | User leaves detail |
| `onSignInPrompt` | User clicks sign-in on gated overlay |

## Data

See `types.ts` and `sample-data.json`.
