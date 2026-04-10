

## Enhanced Timeline Management System — Full Specification

### Summary

Seven interconnected changes: (A) DB migration for new columns, (B) milestone macro-phase mapping, (C) auto-fill end date from start date in wizard, (D) role-based edit permissions on milestones, (E) dual handover tracking for construction projects, (F) internal 30-day PM deadline from "GC Provides Documentation", (G) macro-phase strategic filter as an additional filter alongside the existing status filter.

---

### A. DB Migration

Add columns to `certification_milestones`:

```sql
ALTER TABLE certification_milestones
  ADD COLUMN edit_locked_for_pm boolean NOT NULL DEFAULT false,
  ADD COLUMN actual_date date;
```

Add columns to `certifications` for dual handover tracking:

```sql
ALTER TABLE certifications
  ADD COLUMN planned_handover_date date,
  ADD COLUMN actual_handover_date date;
```

---

### B. Milestone Macro-Phase Mapping

Add to `src/data/certificationTemplates.ts`:

```typescript
export const MILESTONE_MACRO_PHASE: Record<string, string> = {
  "Pre-assessment": "Design",
  "FGB Design guidelines": "Design",
  "FGB tendering requirement": "Design",
  "Construction phase": "Construction",
  "LEED GC training": "Construction",
  "Construction end (Handover)": "Construction",
  "GC Provides Documentation": "Certification",
  "LEED Project Submission": "Certification",
  "LEED Certification Attainment": "Certification",
};

export function computeMacroPhase(certStatus: string, milestones: any[]): string {
  if (certStatus === "certificato") return "Certified";
  const achieved = milestones
    .filter(m => m.status === "achieved" && m.milestone_type === "timeline")
    .sort((a, b) => (b.order_index ?? 0) - (a.order_index ?? 0));
  if (achieved.length === 0) return "Design";
  return MILESTONE_MACRO_PHASE[achieved[0].requirement] || "Design";
}
```

Also add `is_single_date` and `pm_locked_after_setup` flags to relevant `TimelineStep` entries:
- `"Construction end (Handover)"` → `is_single_date: true`
- `"Construction phase"` → `pm_locked_after_setup: true` (end date only)
- `"LEED Project Submission"` and `"LEED Certification Attainment"` → `pm_locked_after_setup: true` (all dates)

---

### C. TimelineSetupWizard — Auto-Fill End Date

In `TimelineSetupWizard.tsx`:

1. When PM sets `start_date`, auto-set `due_date` to the same value if `due_date` is still null or unchanged.
2. For "Construction end (Handover)": show only one date picker; save both `start_date` and `due_date` as the same value.
3. When "Construction Phase" end date is set, auto-sync:
   - "Construction end (Handover)" milestone start/due dates
   - `certifications.planned_handover_date` and `certifications.actual_handover_date`

---

### D. Role-Based Edit Permissions

| Milestone | PM can edit | Admin can edit |
|-----------|-------------|----------------|
| Construction Phase (end date) | Only during initial setup | Always |
| LEED Project Submission (dates) | Cannot edit dates; can only flag "Completed" (writes `actual_date`) | Always ("Priorita Direzionale") |
| LEED Certification Attainment (dates) | Cannot edit dates; can only flag "Completed" | Always |
| Construction end (Handover) | Always (single date) | Always |
| All others | Always | Always |

Implementation: check `edit_locked_for_pm` flag + user `role` from `useAuth()`. "Completed" status toggle always available to PM, which writes `actual_date = today` and sets `status = 'achieved'`.

---

### E. Dual Handover Tracking (Construction Projects)

- `planned_handover_date` = set when Construction Phase end date is first configured (frozen unless Admin edits)
- `actual_handover_date` = "Construction end (Handover)" milestone date, continuously editable by PM
- Delta (actual - planned) in months = extra-effort indicator

**Planner visualization** (`FGBPlanner.tsx`): For construction projects, the Construction Phase Gantt segment extends to `actual_handover_date`, with the original planned end shown as a vertical marker/line.

---

### F. Internal 30-Day PM Deadline Tracking

Logic: When "GC Provides Documentation" milestone has `status = 'achieved'` (or `actual_date` is set), start a 30-day countdown. If today > GC_doc_date + 30 days AND "LEED Project Submission" status != 'achieved', the project is flagged as "late" and generates a `task_alert` of type `milestone_deadline`.

Implemented in `usePMDashboard.ts`, `useAdminPlannerData.ts`, and `useCeoDashboardData.ts`.

---

### G. Macro-Phase Strategic Filter (Additional, Not Replacing)

The existing `filterStatus` (da_configurare / in_corso / certificato) stays untouched — it tracks activity setup status. A **new** filter is added for certification lifecycle phase.

Add `macro_phase` property to `AdminPlannerProject` and `PMProject` interfaces, computed via `computeMacroPhase()`.

In `AdminTimeline.tsx` and `PMPortal.tsx`: add a new `<Select>` dropdown with options: All Phases | Design | Construction | Certification | Certified. Applied as an additional filter condition alongside the existing ones.

---

### Files Modified/Created

| Action | File | What |
|--------|------|------|
| Migrate | `supabase/migrations/` | Add `edit_locked_for_pm`, `actual_date` to milestones; `planned_handover_date`, `actual_handover_date` to certifications |
| Modify | `src/data/certificationTemplates.ts` | Add `MILESTONE_MACRO_PHASE`, `computeMacroPhase()`, `is_single_date`, `pm_locked_after_setup` flags |
| Modify | `src/components/projects/TimelineSetupWizard.tsx` | Auto-fill end date, single-date mode for Handover, sync Construction Phase → Handover, lock rules |
| Modify | `src/pages/ProjectDetail.tsx` | Dual handover dates display, delta indicator, respect edit locks |
| Modify | `src/hooks/usePMDashboard.ts` | Compute `macro_phase`, 30-day deadline check |
| Modify | `src/hooks/useAdminPlannerData.ts` | Compute `macro_phase`, 30-day deadline check |
| Modify | `src/hooks/useCeoDashboardData.ts` | 30-day deadline in late projects computation |
| Modify | `src/components/admin/AdminTimeline.tsx` | Add macro-phase filter dropdown (alongside existing status filter) |
| Modify | `src/pages/PMPortal.tsx` | Add macro-phase filter to PM planner view |
| Modify | `src/components/dashboard/FGBPlanner.tsx` | Add planned handover marker on Gantt for construction projects |

### Execution Order

1. DB migration (new columns)
2. Template updates (macro_phase map, flags)
3. Wizard auto-fill + single-date + sync logic
4. Role-based edit locks
5. Dual handover tracking + planner visualization
6. 30-day deadline logic + alerts
7. Macro-phase strategic filters

