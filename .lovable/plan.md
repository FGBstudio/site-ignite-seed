# Saturation Matrix — Capacity (Admin) & PM Planner (PM)

Rebuild the two existing tabs (`CapacityDashboard` + `PMPlanner`) around a single "Weekly Saturation Matrix" model: PMs as rows, ISO weeks as columns, hours-per-project as cells, HR availability as vertical blockers, 40h hard cap.

## 1. Data model (Supabase)

Reuse what exists, add what's missing.

- **Resources** → `profiles` (PMs via `user_roles`). Weekly max = **40h** (constant, no schema change).
- **Unavailability** → existing `hr_availability` (`user_id`, `start_date`, `end_date`, `status`). Statuses treated as "off": `vacation`, `sick`, `off`, `unavailable`. Feeds violet vertical blockers.
- **Projects** → `certifications` (`id`, `name`, `allocated_hours` = total budget, `handover_date` / issued date = irrevocable deadline, `pm_id`). Milestones from `certification_milestones` (per-milestone `allocated_hours`).
- **Allocations (weekly)** → **new table `pm_weekly_allocations`**:
  - `user_id` (PM), `certification_id`, `milestone_id` nullable, `week_start` (ISO Monday, `date`), `planned_hours` numeric(5,2), `note`, timestamps.
  - Unique `(user_id, certification_id, milestone_id, week_start)`.
  - RLS: PM can CRUD own rows; Admin full; guest collaborators read-only.
- **DB validation trigger** on `pm_weekly_allocations` (INSERT/UPDATE):
  1. Compute `Σ planned_hours` for `(user_id, week_start)` including NEW row.
  2. If sum > 40 → `RAISE EXCEPTION 'WEEKLY_CAP_EXCEEDED'` (hard-stop).
  3. If overlaps an `hr_availability` off-period → mark row `has_conflict = true` (surface, don't block on insert; block only for the 40h rule).
  4. If `Σ planned_hours` per certification > `certifications.allocated_hours` → `has_overbudget = true` (soft flag; strategic red).
- **Views**:
  - `view_pm_week_load`: `(user_id, week_start, total_planned, off_days, cap_effective, saturation_pct)`.
  - `view_cert_allocation_status`: `(certification_id, remaining_budget, weeks_to_deadline, unallocated_hours, is_red)` — red if `unallocated_hours > 0` and no weeks left before handover.

Existing `pm_calendar_slots` (30-min slots) stays for the tactical view; the new weekly table is the source of truth for the matrix.

## 2. Math & validation rules

- Weekly load `C_s = Σ planned_hours` per PM per ISO week.
- **Hard-stop**: `C_s ≤ 40`, enforced in DB trigger + client-side pre-check.
- **Vacation override**: if any day of the week is in an "off" `hr_availability` period → effective cap for that week = `40 × (workable_days / 5)`. Existing allocations flagged `has_conflict`.
- **Strategic red** (Admin only): certification's `Σ planned_hours < allocated_hours` AND no free weekly capacity remains before `handover_date`.

## 3. PM Planner (PM side) — write surface

Replace current `PMPlanner.tsx` weekly scheduler with a **Weekly Saturation Grid**:

- Row 1: total saturation (`C_s / 40`) with color band (grey <30, green 32–40, amber 30–32, red never — impossible by trigger).
- One row per assigned certification (`pm_id = me` OR guest via `cert_collaborations`).
- Columns: rolling 16 weeks (configurable), grouped header by month.
- Cell: numeric input (hours 0–40, step 0.5). On blur → upsert `pm_weekly_allocations`. On trigger error → toast "Week Wxx already full (40h)".
- Cell visual: **heatmap** (light→dark blue by hours) — simpler and consistent across rows than variable-height bars.
- Deadline marker: red diamond glyph on the cert row at the week containing `handover_date`.
- Vacation: violet vertical band across ALL rows for that PM's off-weeks; input disabled there.
- Left side kept: Contract Overview + Milestone budget mapping (already present). Add "Unallocated hours" counter per cert (`budget − Σ planned`).

## 4. Capacity Dashboard (Admin side) — read/oversight surface

Replace current tactical/operational/strategic toggle with one **PM × Week matrix** (Gantt-inverted):

- Y axis: expandable tree — Level 1 = PM; expand ("+") to show one row per certification assigned to that PM.
- X axis: weeks (configurable range 8–26 weeks), month grouping header.
- PM row cell shows aggregate `C_s` with status color:
  - **Grey/Yellow** `< 30h` (under-saturation),
  - **Green** `32–40h`,
  - **Red** never on the PM row (blocked by trigger).
- Cert child row cell shows hours for that cert (heatmap intensity).
- **Red marker on cert row**: `view_cert_allocation_status.is_red` — unallocated budget cannot fit before deadline.
- Violet vertical band for PM's `hr_availability` off-weeks across all their child rows.
- Filters: PM multi-select, cert status, date range.
- Read-only for Admin (no cell editing here — governance only).

## 5. Permissions

- **Admin**: read all, no cell edit in Capacity. Creating projects / setting budget / handover stays in existing project flows.
- **PM**: read/write own rows in `pm_weekly_allocations`; read own `certifications` + guest via `cert_collaborations`. Cannot edit `allocated_hours` or `handover_date`.
- **HR availability**: consumed read-only from `hr_availability`; edits stay in HR module.

## 6. Files touched

- Migration: `pm_weekly_allocations` + trigger + 2 views + RLS + GRANTs.
- `src/hooks/useSaturationMatrix.ts` (new): fetch matrix, mutations with optimistic + rollback on trigger error.
- `src/components/projects/pm/PMPlanner.tsx`: swap scheduler block for `<SaturationGridEditable>`.
- `src/components/dashboard/capacity/CapacityDashboard.tsx`: replace 3-view toggle with `<SaturationMatrixAdmin>` tree.
- Shared `src/components/capacity/SaturationCell.tsx`, `SaturationLegend.tsx`, `useIsoWeeks.ts`.
- Keep `pm_calendar_slots` + `useCapacityPlanner.ts` untouched (still powers day-level tactical view if reintroduced later).

## 7. Rollout order

1. Migration + trigger + views (approval gate).
2. `useSaturationMatrix` hook + shared cell/legend components.
3. PM Planner editable grid (write path, hard-stop, deadline diamond, vacation band).
4. Admin Capacity tree matrix (read path, red-project detection, filters).
5. QA: exceed-40 rejection, vacation conflict flag, unallocated-budget red, guest cert visibility.

## Open decisions

- Default matrix horizon: 16 weeks rolling — confirm or change.
- Milestone-level allocation in the grid: keep as optional dimension (dropdown on cell) or force cert-level only for v1? Proposal: **cert-level only in v1**, milestone tagging in v2.
