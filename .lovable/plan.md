## Analysis Results & Fix Plan (Updated)

### What Works

- Alert **creation** works correctly at the database level (alerts exist in DB).
- Calendar "Create & Assign" button correctly inserts data into the `task_alerts` table.
- RLS policies correctly isolate PM views (PMs can see their own operational tasks).

### What Does NOT Work (The Real Gaps)

1. **Calendar Display Failure:** The `buildCalendarData()` function in `PMCalendar.tsx` only iterates over `certification_milestones` to create visual pills. Task alerts (operational tasks, escalation requests) are completely ignored. The data is saved, but the UI never renders it.
2. **Admin Visibility Broken:** The Admin view (`AdminTasks.tsx`) is completely empty even when PMs have active, escalated alerts. This points to a failure in the `useTaskAlerts.ts` fetch logic for the Admin role, a potential RLS (Row Level Security) block on the `profiles` or `task_alerts` table, or a bug in how `escalate_to_admin` flags are being passed and queried.
3. **Missing PM Dashboard Widget:** The main PM Dashboard lacks an entry point. There is no summary widget for "Tasks & Alerts" in the initial dash, forcing the user to navigate blindly to see their operational inbox.
4. **Missing Admin Navigation Tab:** The Admin layout is missing the primary navigation route. The "Tasks & Alerts" tab does not exist in the top header (it should be placed right after "CEO Dashboard" / "Cantieri").

---

### Fix Plan (Root Cause Resolution)

#### 1. Fix Admin Visibility & Data Fetching

- **Audit** `useTaskAlerts.ts`**:** Verify the `role === "ADMIN"` query logic. Ensure that alerts with `escalate_to_admin = true` are correctly fetched.
- **Audit RLS Policies:** Ensure the Admin role has `SELECT` access to all `task_alerts` and the referenced foreign tables (`certifications`, `profiles`) without being blocked by PM-specific `user_id` constraints.
- **AdminTasks UI:** Verify that `AdminTasks.tsx` correctly handles and maps the fetched data without silently failing.

#### 2. Implement Admin Navigation Route

- **Update Navigation:** Inject the "Tasks & Alerts" tab into the Admin navigation component (`TopNavbar.tsx` or `AppSidebar.tsx`).
- **Positioning:** Ensure its exact order is immediately after the "CEO Dashboard" / "Cantieri" tab.
- **Link Widget:** Ensure clicking the dashboard widget correctly pushes the route to this newly exposed tab.

#### 3. Implement PM Dashboard "Tasks & Alerts" Widget

- **Create Summary Widget:** Add a new KPI/Summary widget in the primary dashboard (`Dashboard.tsx` or `PMPortal.tsx`).
- **Data Binding:** Use `useTaskAlertCounts` to display the number of pending operational tasks and alerts.
- **Call to Action:** Add a direct link/button to route the PM to `/my-tasks`.

#### 4. Fetch `task_alerts` in `PMCalendar.tsx` & Render Events

- **Fetch Alerts:** Add a query for unresolved `task_alerts` for the current project scope.
- **Calendar Rendering:** Update `buildCalendarData` to accept an `alerts` array. Convert these into `MilestoneEvent` entries with distinct styling:
  - *PM Operational:* Blue pill with a notepad/inbox icon.
  - *Escalation Request:* Red pill with an alert triangle icon.

#### 5. Add `scheduled_date` column to `task_alerts` (DB Schema Update)

- **Migration:** Create a Supabase migration to add a `scheduled_date` (`date`, nullable) column to `task_alerts`. Parsing text descriptions for dates is fragile and unacceptable for a scalable system.
- **Update Insert Logic:** Update the calendar creation flow to explicitly save the selected date into `scheduled_date`.
- **Update Mapping:** Update `buildCalendarData` to read `scheduled_date` to accurately position the alert on the grid.

---

### Files to Modify


|                |                                                             |                                                                                                |
| -------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Action**     | **File / Component**                                        | **Change Required**                                                                            |
| **Migration**  | `supabase/migrations/xxxx_add_scheduled_date.sql`           | Add `scheduled_date date` column to `task_alerts`.                                             |
| **Verify/Fix** | `supabase/migrations/...` (RLS policies)                    | Ensure Admin has global read access to `task_alerts`.                                          |
| **Modify**     | `src/hooks/useTaskAlerts.ts`                                | Add `scheduled_date` to types. Fix Admin fetch query if broken.                                |
| **Modify**     | `src/components/dashboard/PMCalendar.tsx`                   | Fetch alerts, update `buildCalendarData`, map events to UI, save `scheduled_date` on creation. |
| **Modify**     | `src/components/layout/TopNavbar.tsx` *(or equivalent nav)* | Add "Tasks & Alerts" tab for Admins after "Cantieri/CEO Dashboard".                            |
| **Modify**     | `src/pages/Dashboard.tsx` *(or PM initial view)*            | Build and insert the "Tasks & Alerts" summary widget.                                          |
| **Modify**     | `src/pages/AdminTasks.tsx`                                  | Ensure state correctly maps and renders the escalated alerts.                                  |
