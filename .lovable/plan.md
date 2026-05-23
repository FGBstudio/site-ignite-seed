# Reports tab — Projects section

Add a fourth tab **Reports** to `src/pages/Projects.tsx` (next to Projects / Timeline / Device Demand Analysis) that gives Admin a large, detailed operational analysis of project health: who's late, why they're on hold, and the breakdown of statuses.

## Layout

Single scrollable view, full width, Apple-minimal cards (`rounded-3xl`, `border-border/60`, `shadow-sm`).

```text
┌────────────────────────────────────────────────────────────────┐
│  KPI strip:  Total  ·  In Progress  ·  Late  ·  On Hold  ·  Certified │
├──────────────────────────────────┬─────────────────────────────┤
│  Status Breakdown (donut + list) │  Macro-phase distribution    │
│  setup_status counts             │  Design / Construction /     │
│                                  │  Certification / Certified   │
├──────────────────────────────────┴─────────────────────────────┤
│  LATE PROJECTS — detailed table                                 │
│  Project · Client · PM · Handover · Days late · Late milestone │
│  · Macro phase                                                  │
├────────────────────────────────────────────────────────────────┤
│  ON-HOLD PROJECTS — detailed list                               │
│  Project · PM · On-hold since · Reason (note from task_alert)   │
│  · Affected milestone                                           │
├────────────────────────────────────────────────────────────────┤
│  CRITICAL DEADLINES (<15d) — quick list                         │
└────────────────────────────────────────────────────────────────┘
```

## Data sources (no new queries on existing tables logic)

- `useAdminPlannerData()` — already provides per cert: `setup_status`, `macro_phase`, `handover_date`, `is_deadline_critical`, `plannerData.status` (incl. `on_hold`), `pm_name`, `client`.
- New lightweight hook `useProjectsReportData()` (in `src/hooks/`) extending what's available:
  - For **late milestones**: query `certification_milestones` where `due_date < today` and `status != 'achieved'`, grouped by `certification_id` → pick worst (most overdue) per cert.
  - For **on-hold reasons**: query `task_alerts` where `alert_type = 'project_on_hold'`, latest per `certification_id`, take `note` and `created_at`.
- Combine with the planner data already in cache via `queryClient.getQueryData(["admin-planner-all-certifications"])` to avoid double fetching.

## Components

New file `src/components/projects/ProjectsReports.tsx` containing all the sections above. Pure presentation + the new hook. Uses existing semantic tokens (`destructive`, `warning`, `success`, `primary`, `muted-foreground`) — no hardcoded colors. Donut is the same custom SVG style already used in PMPortal for consistency.

## Wiring

In `src/pages/Projects.tsx`:
- Add `<TabsTrigger value="reports">` with a `FileText` icon.
- Add `<TabsContent value="reports"><ProjectsReports/></TabsContent>`.

## Out of scope

- No DB schema changes.
- No edits to PM view (`PMProjectsBoard`).
- No changes to existing tabs.
