

## Fix: Bidirectional Alert Visibility (Admin ↔ PM)

### Problem
When the Admin creates an alert on a project, the PM assigned to that project cannot see it. Two layers block this:
1. **RLS policy** on `task_alerts`: PM policy is `created_by = auth.uid()` — rejects rows created by others
2. **Frontend query** in `useTaskAlerts.ts`: no explicit filter for PM, but RLS silently drops Admin-created rows

### Solution

#### 1. Database Migration — Update RLS on `task_alerts`

Replace the current PM policy with one that allows reading alerts the PM created **OR** alerts on projects where the PM is assigned:

```sql
DROP POLICY "PM manages own alerts" ON task_alerts;

-- PM can READ alerts they created OR alerts on their projects
CREATE POLICY "PM can read own and project alerts"
  ON task_alerts FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM certifications c
      WHERE c.id = task_alerts.certification_id
        AND c.pm_id = auth.uid()
    )
  );

-- PM can INSERT alerts they create
CREATE POLICY "PM can create alerts"
  ON task_alerts FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- PM can UPDATE (resolve) alerts they created OR on their projects
CREATE POLICY "PM can update own and project alerts"
  ON task_alerts FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM certifications c
      WHERE c.id = task_alerts.certification_id
        AND c.pm_id = auth.uid()
    )
  )
  WITH CHECK (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM certifications c
      WHERE c.id = task_alerts.certification_id
        AND c.pm_id = auth.uid()
    )
  );
```

This splits the old ALL policy into SELECT/INSERT/UPDATE with the correct scope for each.

#### 2. Frontend — `src/hooks/useTaskAlerts.ts`

No changes needed to the query logic itself. Currently the PM path has no `.eq()` filter — it relies on RLS. Once the RLS policy is updated, the PM will automatically receive both their own alerts and Admin-created alerts on their projects. The existing `.limit(200)` and `.order("created_at")` remain untouched.

### Files Modified

| File | Change |
|------|--------|
| DB migration | Replace single PM ALL policy with 3 granular policies (SELECT/INSERT/UPDATE) that include project-based visibility |
| `src/hooks/useTaskAlerts.ts` | No change needed — RLS handles the filtering |

### No frontend code changes required

The hook already fetches without a `created_by` filter for PMs (line 62-64 only adds a filter for Admins). The RLS fix alone restores symmetry.

