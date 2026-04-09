

## Fix Remaining `projects` Table References

### Problem
6 files still reference the deprecated `projects` table or use `project_id` where the DB column is now `certification_id`.

### Changes

#### 1. `src/pages/ProjectCreateWizard.tsx`
- **Lines 145-156** (no-cert path): Insert into `certifications` instead of `projects`
- **Lines 165-183** (cert path): Insert into `certifications` instead of `projects`, including all business fields (`name`, `client`, `region`, `handover_date`, `pm_id`, `site_id`, `cert_type`, `cert_rating`, `cert_level`, `project_subtype`, `is_commissioning`). Remove the separate `certifications` insert at lines 187-198 since we're now inserting directly into `certifications` as the root entity.

#### 2. `src/components/projects/ProjectFormModal.tsx`
- **Lines 147-150**: Remove the query to `projects` table. Instead, read `pm_id`, `project_subtype` directly from the `certifications` rows (already fetched at line 141-144).
- **Lines 155-166**: Remove `project_id` mapping. Use `c.id` (certification ID) directly, `c.pm_id`, `c.project_subtype` from certifications.
- **Lines 245-255**: Replace upsert to `projects` with upsert to `certifications`. Update all business fields on certifications directly.
- **Line 320**: `project_id: firstProjectId` → `certification_id: firstCertId` for `project_allocations` insert.

#### 3. `src/components/projects/SiteProjectOnboardingForm.tsx`
- **Lines 192-204**: Remove insert/update to `projects`. Instead, store business fields (`name`, `client`, `region`, `handover_date`, `pm_id`) directly on each certification row.
- **Line 254**: `project_id: projectId` → `certification_id: certificationId` for `project_allocations` insert.

#### 4. `src/pages/MyTasks.tsx`
- **Line 21**: `project_id` → `certification_id` in `TaskRow` interface
- **Line 51**: Fix join: `projects!project_tasks_project_id_fkey(name, client)` → query `certifications` separately or use `certification_id` to fetch cert name/client. Since `project_tasks.certification_id` links to `certifications`, the join becomes: `certifications!project_tasks_certification_id_fkey(name, client)`. If that FK name doesn't work, do a separate fetch.
- **Lines 61-62**: `t.projects?.name` → `t.certifications?.name`, same for client
- **Line 127**: `project_id: project.id` stays (synthetic tasks use cert ID as project ID since PM dashboard returns certifications now)

#### 5. `src/components/projects/ProjectWBS.tsx`
- **Line 83**: `.eq("project_id", projectId)` → `.eq("certification_id", projectId)` for `project_allocations` query

#### 6. `src/pages/Projects.tsx`
- **Line 71**: `.eq("project_id", project.id)` → `.eq("certification_id", project.id)` for `project_allocations` query

#### 7. `src/components/admin/DataImporter.tsx`
- **Lines 206-220**: Replace `projects` upsert with `certifications` upsert
- **Line 242**: `project_id: (projectData as any).id` → `certification_id: (projectData as any).id` for `project_allocations` insert

#### 8. `src/components/dashboard/ProcurementForecasting.tsx`
- **Lines 77, 86**: Remove `(a as any).project_id` fallback — use only `certification_id`

### Execution Order
1. Fix simple field renames first (ProjectWBS, Projects, ProcurementForecasting)
2. Fix MyTasks join
3. Migrate creation flows (ProjectCreateWizard, ProjectFormModal, SiteProjectOnboardingForm, DataImporter)

### No DB changes needed
All target columns already exist on `certifications` and `project_allocations`.

