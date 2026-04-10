

## Project Detail Enhancements: Schedule Alerts + Overview Tab

### Summary
Two changes to `ProjectDetail.tsx`:
1. **Schedule tab**: Show project-specific `task_alerts` (filtered by `certification_id`) alongside the existing WBS tasks
2. **New "Overview" tab**: A vertical timeline visualization (inspired by the reference image) showing milestones with dates on alternating sides, plus a certification credits summary from the scorecard

---

### 1. Schedule Tab — Project Alerts

**File:** `src/pages/ProjectDetail.tsx`

- Import and use `useTaskAlerts` from `src/hooks/useTaskAlerts.ts`, filtered by the current `certification_id`
- Add a new query in the Schedule tab content that fetches `task_alerts` where `certification_id = projectId`
- Display them as a list of alert cards above the existing `ProjectWBS` component, showing: alert type badge, title, description/log, created date, and a "Resolve" button
- Visibility rules follow existing logic: PM sees own alerts, Admin sees escalated alerts

**File:** `src/components/projects/ProjectAlerts.tsx` (new)

- A small component that queries `task_alerts` for a given `certification_id`
- Renders each alert as a compact card with type color coding (reusing `ALERT_TYPE_COLORS` from `useTaskAlerts`)
- Includes resolve action via `useResolveAlert`

---

### 2. New "Overview" Tab — Visual Timeline + Credits

**File:** `src/components/projects/ProjectOverview.tsx` (new)

A new component with two sections:

**A. Vertical Timeline (inspired by reference image)**
- A vertical line (teal/primary color) running down the center
- Each milestone is a node on the line with:
  - Date label (month + year) on one side
  - Milestone name + description on the other side
  - Alternating left/right placement
  - Progress indicator (circle with percentage) at key transition points (e.g., 50% at construction start, 90% at construction end)
  - Status-based styling: achieved = filled circle, in_progress = pulsing, pending = hollow, on_hold = red
- Project header at the top: Client name, site name, certification type
- LEED/certification badge at the bottom when certified

**B. Certification Credits Summary**
- If the project has a scorecard, show a compact summary of credit categories with current score vs max score
- Uses data from `certification_milestones` where `milestone_type = 'scorecard'`
- Grouped by category, showing a progress bar per category

**Data source:** Reuses the existing `timelineMilestones` query already in `ProjectDetail.tsx` for the timeline, and `useMilestones` for scorecard data.

---

### Files Modified/Created

| Action | File | What |
|--------|------|------|
| Create | `src/components/projects/ProjectOverview.tsx` | Visual vertical timeline + credits summary |
| Create | `src/components/projects/ProjectAlerts.tsx` | Task alerts list for a specific project |
| Modify | `src/pages/ProjectDetail.tsx` | Add "Overview" tab (first position), embed `ProjectAlerts` in Schedule tab |

