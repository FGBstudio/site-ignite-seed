

## Timeline Setup Wizard

### Summary
Replace the current Excel-style grid in the Timeline tab with a full-screen step-by-step wizard that guides PMs through one milestone at a time, reducing cognitive load and improving data quality.

### Architecture

**New component**: `src/components/projects/TimelineSetupWizard.tsx`

A full-screen overlay (split-screen layout) that replaces the current `TimelineTab` grid when milestones have unset dates.

### Data Layer

1. **Add `description` field to `TimelineStep` interface** in `certificationTemplates.ts` -- this provides the educational/help text shown in the wizard's left panel. Each timeline step gets a human-readable description explaining what the PM needs to do (e.g., "Inserisci la data in cui prevedi di fare la prima call ufficiale con il cliente per validare i crediti").

2. **No database migration needed** -- the help text lives in the static template file (`certificationTemplates.ts`), not in `certification_milestones`. The existing `certification_milestones` table already has `start_date`, `due_date`, `order_index`, and `status` which is all we need.

### Component Design

**TimelineSetupWizard.tsx** -- Split-screen wizard:

- **State**: `currentIndex` (0-based), `milestones[]` (from DB query), `templateSteps[]` (from template).
- **Header**: Progress bar (`Step {n} di {total}`) + project name.
- **Left column (60%)**: Large card with:
  - Milestone name as title
  - Educational panel (light blue bg) with `description` from template
  - Role badge (PM/GC/Client/Assessor)
  - Two date pickers (Start Date, End Date) -- disabled if `calculated_deadline` (auto-computed, shown as read-only with explanation)
- **Right column (40%)**: Next milestone card preview, greyed out (`opacity-40`, `pointer-events-none`).
- **Footer (sticky)**:
  - Left: "Indietro" button (disabled on step 0)
  - Right: "Salta per ora" ghost button + "Salva e Continua" primary button (disabled until dates are filled for `manual_input` steps; always enabled for `calculated_deadline` steps since dates are auto-computed)

**Save logic**:
- "Salva e Continua": calls `supabase.from("certification_milestones").update({start_date, due_date}).eq("id", milestone.id)`, then increments `currentIndex`. For `calculated_deadline` steps, auto-computes dates from the previous manual step using existing `computeCalculatedDate` logic.
- "Salta per ora": just increments `currentIndex`, no DB call.
- **Completion screen**: when `currentIndex === milestones.length`, show celebration card with "Pianificazione Completata!" and a button to close the wizard / return to dashboard.

### Integration Points

1. **PMProjectConfigModal.tsx** -- In the `TimelineTab`, after milestones are initialized (line ~237-256), check if most dates are still `null`. If so, render `<TimelineSetupWizard>` instead of the grid. Add a toggle/button to switch between wizard and grid view for PMs who prefer the table.

2. **certificationTemplates.ts** -- Add optional `description?: string` to `TimelineStep` interface and populate it for all timeline definitions (LEED_BDC, LEED_IDC, BREEAM, WELL, GENERIC). The `toTimeline` helper gets an optional `description` field.

### Steps

1. Update `TimelineStep` interface and all timeline definitions in `certificationTemplates.ts` with `description` field
2. Create `TimelineSetupWizard.tsx` component with split-screen layout, progress bar, date pickers, navigation, and incremental save logic
3. Integrate wizard into `TimelineTab` in `PMProjectConfigModal.tsx` -- show wizard when dates are mostly empty, with option to switch to grid view

