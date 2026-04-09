# UI Data Shapes

Types define the **props-shaped data** the React components expect. They are a **frontend contract**, not a database schema.

## Entities (conceptual)

- **Member**, **PatrolReport**, **Trail**, **Area**, **TreeDown**, **Violation**, **ParkingLot**, **TrailWork**, **Schedule** — see product `data-shape.md` for relationships.

## Per-section TypeScript

| Section | File |
|---------|------|
| Activity Dashboard | `sections/activity-dashboard/types.ts` |
| Trails | `sections/trails/types.ts` |
| Leaderboards + Trends | `sections/leaderboards-trends/types.ts` |

## Combined reference

`overview.ts` aggregates data shapes (no component `*Props` interfaces). **Note:** `ViolationCategory` exists in both Activity Dashboard (includes `color`) and Trails (category + count only) — the combined file aliases the trails shape as `TrailViolationCategory`.
