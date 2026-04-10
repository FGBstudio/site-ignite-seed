

## Alerts/Tasks Widget System for Admin & PM Dashboards

### Summary
Add a new task/alert classification system that feeds an "Alerts/Tasks" widget on both the CEO Dashboard (Admin) and PM Dashboard. Tasks are categorized by type and visibility — some are PM-only (private to-do), others escalate to Admin. A new DB table stores these alerts. The MyTasks page becomes the PM's task hub, and a new Admin Tasks section is added to the sidebar.

### DB Migration — New `task_alerts` Table

```sql
CREATE TYPE public.task_alert_type AS ENUM (
  'timeline_to_configure',
  'milestone_deadline',
  'project_on_hold',
  'pm_operational',
  'other_critical'
);

CREATE TABLE public.task_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  certification_id uuid NOT NULL,
  created_by uuid NOT NULL,
  alert_type task_alert_type NOT NULL,
  title text NOT NULL,
  description text,
  is_resolved boolean NOT NULL DEFAULT false,
  escalate_to_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE public.task_alerts ENABLE ROW LEVEL SECURITY;

-- Admin sees all escalated alerts
CREATE POLICY "Admin full access" ON public.task_alerts
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'ADMIN'::app_role))
  WITH CHECK (has_role(auth.uid(), 'ADMIN'::app_role));

-- PM sees own alerts
CREATE POLICY "PM sees own alerts" ON public.task_alerts
  FOR ALL TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());
```

**Alert type visibility rules:**
- `pm_operational` → `escalate_to_admin = false` (PM-only, private to-do)
- `timeline_to_configure`, `milestone_deadline`, `project_on_hold`, `other_critical` → `escalate_to_admin = true` (visible to Admin)

### New Hook: `useTaskAlerts`

File: `src/hooks/useTaskAlerts.ts`

- `useTaskAlerts(role, userId)` — fetches unresolved alerts; Admin gets all escalated, PM gets own
- `useCreateAlert(certificationId)` — insert mutation
- `useResolveAlert()` — sets `is_resolved = true, resolved_at = now()`
- Auto-generate synthetic alerts from:
  - Certifications with `setup_status = 'da_configurare'` → type `timeline_to_configure`
  - Certifications with status `on_hold` → type `project_on_hold`
  - Overdue milestone deadlines → type `milestone_deadline`

### Changes to CEO Dashboard (`CeoDashboard.tsx`)

Add a 4th KPI widget in the `KpiStrip` grid (change from `grid-cols-3` to `grid-cols-4`):

- **"Alerts/Tasks" card**: Shows count of unresolved escalated alerts, broken down by type with colored badges
- Clicking navigates to the new Admin Tasks page

### Changes to PM Dashboard (`PMPortal.tsx`)

Add a 4th KPI widget in the charts grid:

- **"My Alerts/Tasks" card**: Shows count of all unresolved alerts (both private and escalated) for this PM
- Compact list of top 3-5 alerts with resolve/dismiss actions
- "View All" links to MyTasks page

### New Admin Tasks Page

File: `src/pages/AdminTasks.tsx`
Route: `/admin-tasks`

- Filterable list of all escalated alerts from all PMs
- Grouped by certification/project with PM name
- Actions: mark resolved, navigate to certification detail
- Filter by alert type, PM, certification

### Sidebar Update (`AppSidebar.tsx`)

- Admin: Add "Tasks" entry after "All Projects" → `/admin-tasks` with `Inbox` icon
- PM sidebar stays the same (MyTasks already exists)

### MyTasks Enhancement (`MyTasks.tsx`)

- Add alert cards alongside existing task cards
- PM can create new alerts from here (e.g. "Flag issue on project X")
- Alerts show type badge, certification name, and resolve/cancel buttons
- Separate sections: "Alerts" (from `task_alerts`) and "Operational Tasks" (from `project_tasks`)

### PMCalendar Integration

- When PM creates a calendar event of type "Milestone" or "On Hold", auto-create a `task_alert` with `escalate_to_admin = true`
- When PM creates "Operational" type event, create alert with `escalate_to_admin = false`

### Execution Order

1. DB migration (create table + RLS)
2. Create `useTaskAlerts` hook
3. Build `AdminTasks.tsx` page + route + sidebar entry
4. Add Alerts widget to CEO Dashboard KpiStrip
5. Add Alerts widget to PM Dashboard
6. Enhance MyTasks with alert cards + create/resolve actions
7. Wire PMCalendar event creation to auto-generate alerts

### Files Modified/Created

| Action | File |
|--------|------|
| Create | `supabase/migrations/..._task_alerts.sql` |
| Create | `src/hooks/useTaskAlerts.ts` |
| Create | `src/pages/AdminTasks.tsx` |
| Modify | `src/pages/CeoDashboard.tsx` — add 4th KPI widget |
| Modify | `src/pages/PMPortal.tsx` — add alerts widget |
| Modify | `src/pages/MyTasks.tsx` — add alert section |
| Modify | `src/components/layout/AppSidebar.tsx` — add admin Tasks nav |
| Modify | `src/App.tsx` — add `/admin-tasks` route |
| Modify | `src/components/dashboard/PMCalendar.tsx` — auto-create alerts on event add |

