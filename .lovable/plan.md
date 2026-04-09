

## Migration: Deprecate `projects` Table, Make `certifications` the Root Entity

### Current State

The DB child tables (`project_tasks`, `project_allocations`, `payment_milestones`, `cert_tasks`, `cert_wbs_phases`, `cert_payment_milestones`) already use `certification_id` — no `project_id` column exists on them. The `projects` table has `certification_id` as a FK to `certifications`. However, the **entire frontend** still queries `projects` as the root entity and passes `project_id` to child tables (which silently fails or returns empty results).

### Gap Analysis

**DB Schema Gap**: `certifications` is missing business fields that currently live on `projects`:

| Field | On `projects` | On `certifications` |
|-------|--------------|---------------------|
| name | YES | NO |
| client | YES | NO |
| region | YES | NO |
| handover_date | YES | NO |
| cert_rating | YES | NO (uses `level`) |
| project_subtype | YES | NO |
| is_commissioning | YES | NO |
| cert_level | YES | NO |

**Frontend Files Affected** (10 files query `projects`, 15+ use `projectId`):

| File | Impact |
|------|--------|
| `useAdminPlannerData.ts` | Queries `projects`, builds planner from it |
| `usePMDashboard.ts` | Queries `projects`, builds PM board |
| `useAdminCalendarData.ts` | Queries `projects` for calendar |
| `useCeoDashboardData.ts` | Queries `projects` for CEO KPIs |
| `usePMPortalData.ts` | Queries `projects` for PM portal, passes `project_id` to `cert_wbs_phases`/`cert_tasks` |
| `useProjectDetails.ts` | Queries `projects` for detail page |
| `useProjectTasks.ts` | Passes `project_id` to `project_tasks` (column is now `certification_id`) |
| `usePaymentMilestones.ts` | Passes `project_id` to `payment_milestones` (column is now `certification_id`) |
| `ProjectCreateWizard.tsx` | Inserts into `projects` |
| `ProjectFormModal.tsx` | Updates `projects` |
| `SiteProjectOnboardingForm.tsx` | Inserts/updates `projects` |
| `PMProjectConfigModal.tsx` | Updates `projects.status` |
| `ProjectDetail.tsx` | Uses `projectId` param, queries `projects` |
| `Projects.tsx` | Lists from `useAdminPlannerData` (which queries `projects`) |
| `MyTasks.tsx` | Queries `project_tasks` with stale field refs |
| `types/custom-tables.ts` | Has `Project` interface, `CertWbsPhase.project_id`, etc. |

### Plan

#### Phase 1: DB Migration — Add Missing Columns to `certifications`

Add columns to `certifications` to hold the business data currently on `projects`:

```sql
ALTER TABLE certifications
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS client text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'Europe',
  ADD COLUMN IF NOT EXISTS handover_date date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS cert_rating text,
  ADD COLUMN IF NOT EXISTS project_subtype text,
  ADD COLUMN IF NOT EXISTS is_commissioning boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS cert_level text;
```

Then backfill from existing `projects` data:

```sql
UPDATE certifications c
SET
  name = p.name,
  client = p.client,
  region = p.region,
  handover_date = p.handover_date,
  cert_rating = p.cert_rating,
  project_subtype = p.project_subtype,
  is_commissioning = p.is_commissioning,
  cert_level = p.cert_level
FROM projects p
WHERE p.certification_id = c.id;
```

#### Phase 2: Data Access Layer — Replace All `projects` Queries

Every hook that queries `.from("projects")` will be rewritten to query `.from("certifications")` with a join to `sites`.

**Core pattern change**:
```text
BEFORE: .from("projects").select("*, sites!projects_site_id_fkey(...)")
AFTER:  .from("certifications").select("*, sites!certifications_site_id_fkey(...)")
```

Files rewritten:
- `useAdminPlannerData.ts` — query `certifications` with sites join, remove fallback cert-matching logic (no longer needed since cert IS the entity)
- `usePMDashboard.ts` — same transformation, filter by `pm_id` on certifications directly
- `useAdminCalendarData.ts` — same
- `useCeoDashboardData.ts` — `useActiveProjects` → `useActiveCertifications`, `useCertTasks`/`useCertPayments` join on `certifications` instead of `projects`
- `usePMPortalData.ts` — `usePMProjects` → query certifications; `useCertPhases`/`useCertTasksByProject` use `certification_id` param (rename param from `projectId`)
- `useProjectDetails.ts` — `useProjectDetails` → `useCertificationDetails`, query certifications; remove `useCertification` (redundant)
- `useProjectTasks.ts` — change `.eq("project_id", ...)` to `.eq("certification_id", ...)`
- `usePaymentMilestones.ts` — change `.eq("project_id", ...)` to `.eq("certification_id", ...)`

#### Phase 3: Types — Update Interfaces

- `types/custom-tables.ts`: Remove `Project` interface, update `CertWbsPhase.project_id` → `certification_id`, `CertTask.project_id` → `certification_id`
- `types/index.ts`: Update `Project` → `Certification` as needed
- All hook return types updated (`PMProject` → `PMCertification` or similar)

#### Phase 4: UI Components & Routing

**Routing**: Keep `/projects` and `/projects/:projectId` URLs for now (renaming URLs is a separate concern and would break bookmarks). The `:projectId` param semantically becomes `certificationId` internally.

- `ProjectDetail.tsx` — use `useCertificationDetails(certificationId)`, remove separate `useCertification` call
- `ProjectCreateWizard.tsx` — insert into `certifications` instead of `projects`; the wizard creates certification rows directly with all business fields
- `ProjectFormModal.tsx` — update/insert to `certifications` instead of `projects`
- `SiteProjectOnboardingForm.tsx` — same
- `PMProjectConfigModal.tsx` — update `certifications.status` instead of `projects.status`
- `Projects.tsx` — already uses `useAdminPlannerData` (which will be updated in Phase 2)
- `MyTasks.tsx` — update task field references
- `ProjectWBS.tsx` / `ProjectPayments.tsx` — rename `projectId` prop to `certificationId` internally, pass to updated hooks
- `PMProjectsBoard.tsx` — update links from `/projects/${p.id}` (this ID will now be cert ID)
- `AppSidebar.tsx` / `TopNavbar.tsx` — keep "Projects" labels (semantic naming for users)

#### Phase 5: Query Keys & Cache

Rename all query keys:
- `"admin-planner-all-projects"` → `"admin-planner-all-certifications"`
- `"pm-dashboard"` stays (it's a feature name)
- `"project-tasks"` → `"certification-tasks"`
- `"payment-milestones"` stays
- `"project"` → `"certification"`
- `"project-allocations"` → `"certification-allocations"`
- `"ceo-all-projects-v4"` → `"ceo-all-certifications"`

#### Phase 6: Permissions

- `is_project_pm()` DB function already checks via certification → no change needed
- Frontend ownership checks: use `certifications.pm_id` (already present in schema)

### Execution Order

1. DB migration (add columns + backfill)
2. Update types (`custom-tables.ts`)
3. Update hooks (data layer) — all 8 hooks
4. Update components (UI layer) — all 10+ components
5. Update wizard (creation flow)
6. Smoke test all routes

### Risk & Mitigation

- **Data integrity**: Backfill ensures all certifications have business data before frontend switches
- **No breaking URLs**: Routes stay as `/projects/*`
- **Rollback**: `projects` table remains untouched; only frontend queries change target

### Estimated Scope

~18 files modified, 1 DB migration. This is a full-stack refactor affecting every data access path in the application.

