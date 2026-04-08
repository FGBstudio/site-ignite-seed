

## Merge Kanban Board into Projects Table & Simplify Timeline

### Problem
Three places show nearly identical project data:
1. **CEO Dashboard > Projects tab** — simple table with progress bars
2. **Projects page > Timeline > Kanban Board** — cards grouped by setup_status (To Configure / In Progress / Certified)
3. **Projects page > Projects tab** — flat table with filters

The Kanban Board in AdminTimeline is redundant with the Projects table. The CEO Dashboard Projects tab also overlaps.

### Plan

#### 1. Remove Kanban Board from AdminTimeline
`src/components/admin/AdminTimeline.tsx` — Remove the Kanban/Planner tab toggle. The component becomes **only** the Global Planner (Gantt view) with its existing filters (PM, Status, Cert, Brand). No more Kanban cards.

#### 2. Evolve the Projects tab with status grouping
`src/pages/Projects.tsx` — The existing Projects table gets status-category tabs (like the Kanban had), showing:
- **To Configure (n)** / **In Progress (n)** / **Certified (n)**

This requires the Projects page to know each project's `setup_status`. Currently it fetches raw `projects` with a simple query. Two options:

**Chosen approach**: Reuse `useAdminPlannerData` (already computes `setup_status`, `missing`, `pm_name`, `brand_name`, `plannerData`) instead of the manual `fetchProjects` in Projects.tsx. This eliminates the duplicate fetch and gives us all enriched data in one place.

The table keeps all its current columns (Project, Client, Region, Certification, Rating, Subtype, PM, Handover, Hardware) plus adds a **Status** column showing the computed setup_status badge. Rows are filtered by the active status tab.

#### 3. Simplify CEO Dashboard Projects tab
`src/pages/CeoDashboard.tsx` — The `TabProgetti` component stays as-is (it shows WBS task progress, which is different from setup_status). No changes needed here since it serves a different purpose (operational task tracking vs. configuration status).

### Files Changed

| File | Change |
|------|--------|
| `src/components/admin/AdminTimeline.tsx` | Remove Kanban tab, render only Global Planner with filters |
| `src/pages/Projects.tsx` | Replace manual fetch with `useAdminPlannerData`; add status-category sub-tabs above the table; keep filters and "New Project" button |
| `src/hooks/useAdminPlannerData.ts` | No changes needed (already provides all required data) |

### Technical Details

**AdminTimeline.tsx simplification:**
- Remove `AdminProjectCard` component entirely
- Remove Kanban `<Tabs>` wrapper, keep only the Planner `<div>` with `<FGBPlanner>`
- Keep all 4 filter dropdowns (they apply to the Gantt)

**Projects.tsx evolution:**
- Replace `useState` + `fetchProjects` with `useAdminPlannerData()` hook
- Add inner `<Tabs>` with 3 triggers: "To Configure (n)", "In Progress (n)", "Certified (n)" + an "All" option
- Each tab filters the table rows by `setup_status`
- Table columns adapted to use enriched data (`pm_name` from hook, `setup_status` badge, `missing` badges)
- Keep existing search, region, PM filters (they stack with the status tab)

