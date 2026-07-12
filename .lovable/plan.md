
# Excel-style portfolio view for Reports

Goal: replicate the Excel "HIG | FGB FOLLOW UP" logic and layout on the **Reports** page only (`/reports` → `ProjectsReports.tsx`). Operations (`/ceo-dashboard`) stays untouched.

## 1. New component: `PortfolioFollowUp`

`src/components/projects/PortfolioFollowUp.tsx`, fed by the existing `useAdminPlannerData()` hook (root entity = `certifications`).

Three stacked blocks matching the Excel screenshot:

### a) Header strip
- Left: **Status legend** (4 rows, same wording as Excel)
  - ✓ dark green = Certified / Completed
  - ● green = No action required from HIG — project proceeding
  - ● amber = Waiting for HIG feedback
  - ● red = HIG urgent attention required
- Right: **Tracker** with 3 counters — `Ongoing`, `Completed`, `Total` — computed from the *filtered* dataset (so the KPIs react to the filters).

### b) Filter bar
Four `ExcelFilterButton` popovers (reusing the component already built for Monitor), so the filter modality is consistent across the app:

- **Holding** — resolved via `sites.brand_id → brands.holding_id → holdings.name`
- **Brand / Client** — `brands.name` (fallback to `certifications.client`)
- **Region** — `certifications.region` / `sites.region`
- **Country** — `sites.country`

Multi-select + A→Z / Z→A sort + search inside the popover, identical to Monitor.

An extra free-text `Search` input on the left filters across Project, Deal and City (mirrors the Excel "find" habit).

### c) Portfolio table
Exact column set from the Excel, in this order:

| # | Column                 | Source                                                                  |
|---|------------------------|-------------------------------------------------------------------------|
| 1 | STATUS (dot / tick)    | Derived — see traffic-light rules below                                 |
| 2 | TYPE                   | `sites.typology` (Logistic, Resort, Self-storage, Shopping center, …)   |
| 3 | COUNTRY                | `sites.country`                                                         |
| 4 | DEAL                   | `brands.name` (the "deal" grouping inside a holding)                    |
| 5 | PROJECT                | `certifications.name` (fallback: `sites.name` / `sites.city`)           |
| 6 | CERTIFICATION STANDARD | `certifications.cert_type` (LEED, BREEAM, WELL, …)                      |
| 7 | CERTIFICATION LEVEL    | `certifications.cert_rating` ?? `cert_level`                            |
| 8 | CERTIFICATION YEAR     | year of `issued_date` if certified, else `handover_date`; `TBD` if null |

Visual behavior matching the Excel:
- Certified rows: soft green tint + ✓ icon.
- Late/critical rows: soft rose tint + red dot.
- On-hold rows: amber dot; row stays neutral.
- Table header sticky, tabular-nums, rounded card wrapper, same Apple aesthetic already used elsewhere.
- Click a row → navigate to `/projects/{certification_id}` (already the app pattern).

### Traffic-light rules
Applied per certification row:

```text
if setup_status == "certificato" || issued_date != null   → GREEN CHECK (Certified)
else if is_deadline_critical || has late milestone         → RED       (HIG urgent attention)
else if on_hold || open task_alert "waiting_for_client"    → AMBER     (Waiting for HIG feedback)
else                                                       → GREEN DOT (No action required)
```

Late detection reuses the same query already inside `ProjectsReports.tsx` (`certification_milestones` overdue + not achieved), extracted into a small hook so it can be shared.

## 2. Wire into Reports only

- **Reports (`/reports`)**: replace the current KPI donut + macro-phase block with `PortfolioFollowUp` at the top; keep the existing "Late Projects", "On Hold — Reasons", "Critical Deadlines" cards below (they add drilldown value the Excel doesn't have).
- **Operations (`/ceo-dashboard`)**: **no changes**.

## 3. Data plumbing

`useAdminPlannerData()` already returns everything except `sites.typology` and `holdings.name`. Two small additions:

- Extend the `certifications` query select to include `typology` on the `sites` join.
- Add a `holdings` map fetched from `brands.holding_id → holdings.name`, exposed on each `AdminPlannerProject` as `holding_name` and `typology`.

No DB migration needed — all columns already exist (`sites.typology`, `brands.holding_id`, `holdings.name` confirmed in the schema).

## 4. Out of scope (unless you confirm)

- Editing rows inline from this table (Excel is read-only for the boss; edits stay in the existing PM/Admin flows).
- Exporting to `.xlsx` — easy to add later with the xlsx skill once the on-screen version is approved.

## Technical notes

- New file: `src/components/projects/PortfolioFollowUp.tsx`
- New hook: `src/hooks/useLateCertMilestones.ts` (extracted from `ProjectsReports.tsx`)
- Edits: `src/hooks/useAdminPlannerData.ts` (join typology + holding), `ProjectsReports.tsx` renders `<PortfolioFollowUp />` at top.
- Filters use existing `ExcelFilterButton` for full consistency with Monitor.
- No changes to Supabase schema, RLS, or auth. No changes to `CeoDashboard.tsx`.
