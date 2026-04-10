## Fix Alert/Task Creation Flow + Unified Schedule View

### Problems Identified

1. **Calendar "Create & Assign" button is dead** — The Sheet in `PMCalendar.tsx` (line 451) has no `onClick` handler wired to the button. The `Select` for project and `RadioGroup` for event type have no controlled state. Nothing is saved.
2. **Schedule tab only shows WBS tasks** — `ProjectDetail.tsx` Schedule tab renders `ProjectAlerts` (unresolved alerts) + `ProjectWBS` (project_tasks table), but alerts and WBS tasks are displayed as separate sections. The +New Task button have to creates alerts and PM `project_tasks`
3. **No way to create alerts from Schedule** — The +New button in `ProjectWBS` only opens a WBS task creation dialog. There's no option to create PM private notes or escalation requests from the project Schedule page.

---

### Plan

#### A. Fix Calendar Sheet — Wire "Create & Assign" (`PMCalendar.tsx`)

- Add controlled state for: `selectedProject`, `taskTitle`, `eventType` (task vs escalation)
- On "Create & Assign":
  - If **Operational Task**: insert into `task_alerts` with `alert_type = "pm_operational"`, `escalate_to_admin = false`
  - If **Escalation Request**: insert into `task_alerts` with `alert_type = "other_critical"`, `escalate_to_admin = true`
- Use `useCreateAlert` hook from `useTaskAlerts.ts`
- Show toast on success, close sheet, reset form
- Pass `useAuth()` context to get `user.id` for `created_by`

#### B. Unified Schedule View (`ProjectDetail.tsx` Schedule tab)

Replace the current layout (ProjectAlerts above ProjectWBS) with a single unified list that shows:

- **Task alerts** for this project (`task_alerts` where `certification_id = projectId`)
  - Admin sees: escalated alerts only (not PM private operational notes)
  - PM sees: all own alerts (both private and escalated)
- **WBS tasks** for this project (existing `project_tasks`)
- Both types rendered as cards in a single chronological list

Modify `ProjectWBS.tsx` or create a wrapper component that merges both data sources.

#### C. Enhanced +New Button in Schedule (`ProjectWBS.tsx`)

Replace the current "New Task" dialog with a tabbed or radio-group dialog offering:

1. **Operational Task (WBS)** — existing project_tasks creation (keep current form)
2. **PM Private Note** — creates `task_alert` with `alert_type = "pm_operational"`, `escalate_to_admin = false`
3. **Escalation Request** — creates `task_alert` with `alert_type = "other_critical"`, `escalate_to_admin = true`

The dialog auto-fills `certification_id` from the current project context.

#### D. Admin "Tasks" KPI Widget (CEO Dashboard)

The widget already exists in `CeoDashboard.tsx` using `useTaskAlertCounts`. Verify it renders the count correctly — no code change expected here.

---

### Files Modified


| Action | File                                        | Change                                                                                    |
| ------ | ------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Modify | `src/components/dashboard/PMCalendar.tsx`   | Wire Create & Assign button with state + `useCreateAlert` + `useAuth`                     |
| Modify | `src/components/projects/ProjectWBS.tsx`    | Merge task_alerts into the schedule view; enhance +New dialog with alert creation options |
| Remove | `src/components/projects/ProjectAlerts.tsx` | No longer needed as a separate component — alerts are now inline in ProjectWBS            |
| Modify | `src/pages/ProjectDetail.tsx`               | Remove `ProjectAlerts` import; pass `role` context to ProjectWBS                          |


### No DB migration needed

All tables (`task_alerts`, `project_tasks`) and RLS policies already exist and support these operations.