

## Multi-Certification Wizard: Support Multiple Certifications Per Site

### Summary
Replace the single certification selector in Step 3 of the Project Create Wizard with a multi-select system. The admin toggles which certifications apply (e.g. LEED + WELL), then configures each one independently. On submit, one project row is created per certification, all linked to the same site, each with its own milestones.

### Architecture Change

**Current**: `WizardDraft` has single `cert_type`, `cert_rating`, `cert_level`, `project_subtype`, `is_commissioning` fields. One project + one certification row are created.

**New**: `WizardDraft` gets a `certifications` array replacing the single cert fields. Each entry holds `{ cert_type, cert_rating, cert_level, project_subtype, is_commissioning, pm_id }` -- note the per-certification PM assignment, since different certifications can have different PMs.

### Data Model Impact

No DB changes needed. The wizard simply creates **N projects** (one per certification) all pointing to the same `site_id`. Each project gets its own `certifications` + `certification_milestones` rows. This is already how the PM portal works -- it shows projects individually, so the PM sees separate timeline/scorecard workflows per certification.

### Files Changed

| File | Change |
|------|--------|
| `src/hooks/useWizardDraft.ts` | Replace single cert fields with `certifications: CertEntry[]` array. Keep backward compat for draft loading. |
| `src/pages/ProjectCreateWizard.tsx` | **Step 2**: Remove single PM selector -- PM assignment moves to Step 3 (per-certification). **Step 3**: Checkbox toggles for cert types; dynamic config cards per selected cert (rating, level, subtype, commissioning, PM). **Step 4 (Review)**: Show each certification as a separate review card. **Submit**: Loop over `certifications[]`, create one project per cert with `Promise.all`. |
| `src/data/certificationTemplates.ts` | No changes (already exports `CERT_TYPES`, `CERT_RATINGS`, `CERT_LEVELS`). |

### Step 3 UX (Certification)

```text
┌──────────────────────────────────────────────┐
│  Select Certifications                       │
│  [x] LEED   [x] WELL   [ ] BREEAM   [ ] CO2 │
├──────────────────────────────────────────────┤
│  ┌─ LEED ──────────────────────────────────┐ │
│  │  Rating: [BD+C v]  Level: [Gold v]      │ │
│  │  Subtype: [New Construction v]          │ │
│  │  PM: [Mario Rossi v]                   │ │
│  │  [x] Commissioning required             │ │
│  └─────────────────────────────────────────┘ │
│  ┌─ WELL ──────────────────────────────────┐ │
│  │  Rating: [New & Existing v]  Level: ... │ │
│  │  PM: [Giulia Bianchi v]                │ │
│  │  [ ] Commissioning required             │ │
│  └─────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

### Submit Logic (per certification)

For each entry in `certifications[]`:
1. Insert `projects` row with `{ site_id, cert_type, cert_rating, cert_level, project_subtype, is_commissioning, pm_id, name: "${project_name} – ${cert_type}" }`
2. Insert `certifications` row linked to `site_id`
3. Resolve template via `getCertificationTemplate()` and bulk-insert `certification_milestones`

All wrapped in `Promise.all` for atomicity.

### Step 2 Adjustment

The PM field moves from Step 2 to Step 3 (inside each certification card), since different certs can have different PMs. Step 2 keeps: Project Name, Client, Region, Handover Date, Status, Project Type. The project name becomes a base name -- each created project appends the cert type suffix.

### Draft Migration

When loading an old draft that has `cert_type` as a string (not array), auto-migrate it to `certifications: [{ cert_type, cert_rating, ... }]` so existing drafts are not lost.

