## 1. Add "On Hold" Status + Mandatory Log Note + Red Timeline Visual

### What changes

**A. Status dropdown update** (`PMProjectConfigModal.tsx`, lines 380-392)

- Add `"on_hold"` option to the milestone status `<Select>`, displayed as "On Hold" with red styling
- When "on_hold" is selected, show a mandatory `<Textarea>` modal/dialog to collect a log note before saving
- If no note is provided, block the status change

**B. Auto-create task_alert on "On Hold"**

- When status is set to `on_hold`, create a `task_alert` with `alert_type = "project_on_hold"` including the log text
- If the user is a **PM**: set `escalate_to_admin = true` (alert visible to Admin)
- If the user is an **Admin**: set `escalate_to_admin = false` and target the PM (alert visible to PM via existing query) (alert must be visible to Admin too)

**C. Red timeline visual**

- In the grid view (`PMProjectConfigModal.tsx`): if any milestone in the project has `status = "on_hold"`, add a red border/background to the entire timeline container
- In `FGBPlanner.tsx` / `ProjectDetail.tsx`: if any milestone is "on_hold", show the project row with a red highlight
- In `AdminTimeline.tsx`: same red visual for on-hold projects in the planner view

**D. Status display mapping updates**

- Update `ProjectDetail.tsx` planner logic (line 64-71) to handle `on_hold` as a display status with red color
- Update `FGBPlanner.tsx` color dictionary to include `on_hold` with red (#ef4444)

---

## 2. Add/Delete Custom Milestones + Admin Alert

### What changes

**A. Add Milestone button** (`PMProjectConfigModal.tsx`)

- Add a `+ Add Milestone` button below the milestone grid
- On click, show inline form or small dialog: milestone name, start date, end date
- Insert into `certification_milestones` with `milestone_type = "timeline"`, `order_index` set to position after the selected row (or at end)
- After insert, auto-create a `task_alert`: "Project: {name} — PM {pm_name} added milestone '{milestone_name}'" with `escalate_to_admin = true`, `alert_type = "pm_operational"`

**B. Delete Milestone button** (`PMProjectConfigModal.tsx`)

- Add a small trash icon on each milestone row
- Confirm dialog before deleting
- After delete, auto-create a `task_alert`: "Project: {name} — PM {pm_name} removed milestone '{milestone_name}'" with `escalate_to_admin = true`, `alert_type = "pm_operational"`

**C. Reorder `order_index**`

- After add/delete, recalculate `order_index` for all remaining milestones to maintain correct ordering

---

### Files Modified


| File                                               | Change                                                                                                          |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `src/components/projects/PMProjectConfigModal.tsx` | Add "on_hold" status option, mandatory note dialog, add/delete milestone buttons, alert creation on all actions |
| `src/components/dashboard/FGBPlanner.tsx`          | Add "on_hold" color mapping (red)                                                                               |
| `src/pages/ProjectDetail.tsx`                      | Handle "on_hold" display status                                                                                 |
| `src/components/admin/AdminTimeline.tsx`           | Red visual for on-hold projects                                                                                 |


### No DB migration needed

The `certification_milestones.status` is a `text` column (not enum), so "on_hold" can be stored directly. The `task_alerts` table already supports the needed alert types.