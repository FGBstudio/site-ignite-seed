## Full-Page Project Creation Wizard

### Problem
The current project onboarding uses oversized modals (`SiteProjectOnboardingForm` and `ProjectFormModal`) that cause data loss on accidental clicks, poor mobile UX, and cognitive overload.

### Solution
Create a dedicated full-page wizard at `/projects/new` with 4 steps and localStorage draft persistence.

### Architecture

**New files:**
- `src/pages/ProjectCreateWizard.tsx` — Full-page wizard with 4 steps
- `src/hooks/useWizardDraft.ts` — localStorage persistence hook

**Modified files:**
- `src/App.tsx` — Add `/projects/new` route
- `src/pages/Projects.tsx` — Replace "Site Onboarding" and "New Project" buttons with a single link to `/projects/new`
- `src/components/projects/ProjectFormModal.tsx` — Keep only for **edit mode** (remove creation logic, simplify)

### Wizard Steps

1. **Site** — Brand (from holdings cascade), Site name, City, Country, Region, optional coords/area/timezone, modules toggles
2. **Project** — Project name, Client, PM assignment, Handover date, Status, Project type
3. **Certification** — Cert type, Rating system, Subtype, Cert level, Commissioning toggle (conditional on cert type)
4. **Review & Submit** — Summary of all data, submit button

### Key Features
- **localStorage draft**: Auto-save on every field change with key `project-wizard-draft`. On mount, restore draft with a banner "Draft found — Resume or Discard?"
- **Step validation**: Each step validates before allowing navigation to next
- **Progress bar**: Visual stepper showing current step
- **Back navigation**: Can go back to any previous step without losing data
- **No accidental data loss**: Full page, no click-outside dismiss

### What stays as modal
- `ProjectFormModal` remains as a modal but ONLY for editing existing projects (no creation path)
