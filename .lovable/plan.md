

## Calendar & Active Alert System Enhancements

### 1. Calendar Modifications

#### 1A. Collapsible Project Legend
The calendar currently has no visible legend showing which projects are displayed. Add a collapsible legend panel below the calendar header showing colored dots + project names. Default collapsed when >6 projects, expanded otherwise. Toggle via a small "Legend" button.

**File:** `src/components/dashboard/PMCalendar.tsx`
- Add state `showLegend` 
- Render a collapsible section with project color dots + names
- All labels in English

#### 1B. Hover Tooltip on Calendar Bars/Milestones
When hovering over project bars (spans) or milestone pills in the calendar grid, show a tooltip with: project name, current milestone in progress, and (in admin mode) the assigned PM name.

**File:** `src/components/dashboard/PMCalendar.tsx` (MonthGrid component)
- Wrap span ribbons and milestone pills with `<Tooltip>` from the existing tooltip component
- Pass `adminMode` and `pmNames` context to MonthGrid
- Tooltip content: Project name, active milestone, PM name (admin only)

#### 1C. Rename "Milestone di Progetto" → Escalation Request
In the Sheet for creating tasks/milestones, rename the radio option "Milestone di Progetto" to something like **"Escalation Request"** with description: "Critical issue requiring Admin review. This will be flagged in the Admin's Tasks & Alerts dashboard."

**File:** `src/components/dashboard/PMCalendar.tsx` (lines 378-384)

#### 1D. Translate All Calendar UI to English
Replace all Italian strings: "Lun/Mar/Mer...", "Oggi", "Filtra per Stato", "Da Configurare", "In Corso", "Certificati", "Mese", "Nuova Task o Milestone", "Progetto di riferimento", "Titolo Task / Milestone", "Tipologia Evento", "Task Operativa", "Annulla", "Crea ed Assegna", etc.

**File:** `src/components/dashboard/PMCalendar.tsx`

---

### 2. Active Alert System — Automated Alerts

#### 2A. "Extra-Fee" Alert (Construction End Extension)
When the "Construction end (Handover)" milestone date is moved forward (actual > planned), auto-generate a `task_alert` with `alert_type = "other_critical"` and title: "Extension detected — Verify GC support offer" for the Admin.

**Implementation:** In the milestone update logic inside `PMProjectConfigModal.tsx`, when saving a date change for "Construction end (Handover)" that extends beyond `planned_handover_date`, insert a task_alert.

**File:** `src/components/projects/PMProjectConfigModal.tsx`

#### 2B. 7-Day Confirmation Alert
7 days before the planned construction end date, generate a `task_alert` for the PM: "Confirm construction end for [Date]? If delayed, indicate issues."

**Implementation:** Computed client-side in the dashboard hooks (`usePMDashboard.ts`, `useAdminPlannerData.ts`). When `Construction end (Handover)` due_date minus today <= 7 days AND milestone status != "achieved", create/surface an alert. This will be a computed alert inserted on detection.

**Files:** `src/hooks/usePMDashboard.ts`, `src/hooks/useAdminPlannerData.ts`

#### 2C. Deadline Red Highlighting (<15 Days)
For deadline milestones (Submission, Certification Attainment), if less than 15 days remain and the PM hasn't flagged "Completed" (status != "achieved"), color the entire project row RED in the planner.

**Implementation:**
- In `useAdminPlannerData.ts` and `usePMDashboard.ts`: check if any deadline milestone has `due_date - today < 15 days` AND `status != "achieved"` → set a flag `is_deadline_critical = true`
- In `FGBPlanner.tsx`: if `is_deadline_critical`, apply red row styling (same as on_hold)
- The deadline days come from the timeline template's `offset_days` per cert type (already defined in certificationTemplates.ts)

**Files:** 
- `src/hooks/useAdminPlannerData.ts` — add `is_deadline_critical` computation
- `src/hooks/usePMDashboard.ts` — same
- `src/components/dashboard/FGBPlanner.tsx` — add `isDeadlineCritical` to `GanttRowData`, apply red styling

---

### Files Modified

| File | Changes |
|------|---------|
| `src/components/dashboard/PMCalendar.tsx` | Collapsible legend, hover tooltips, rename escalation, translate to English |
| `src/components/projects/PMProjectConfigModal.tsx` | Extra-fee alert on handover date extension |
| `src/hooks/usePMDashboard.ts` | 7-day confirmation alert, deadline critical flag |
| `src/hooks/useAdminPlannerData.ts` | 7-day confirmation alert, deadline critical flag |
| `src/components/dashboard/FGBPlanner.tsx` | Add `isDeadlineCritical` prop, red row styling for critical deadlines |

### No DB migration needed
All alerts use the existing `task_alerts` table. Deadline criticality is computed client-side.

