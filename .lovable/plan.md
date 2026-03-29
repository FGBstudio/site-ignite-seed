

# Fix: Auto-create `certifications` record when missing

## Problem
When the Admin creates a project via the Onboarding Form, only a `projects` row is created with `cert_type` and `cert_rating` populated. However, no corresponding row is inserted into the `certifications` table. The PM config modal (`PMProjectConfigModal`) requires `project.certifications[0].id` to initialize Timeline and Scorecard milestones — since it's missing, the PM sees "Nessuna certificazione associata".

## Root Cause
`SiteProjectOnboardingForm.tsx` never inserts into the `certifications` table after creating the project+site.

## Solution
Two complementary fixes:

### 1. Fix the Onboarding Form (prevents future occurrences)
In `SiteProjectOnboardingForm.tsx`, after successfully creating the project, automatically insert a `certifications` row:

```typescript
// After project insert succeeds and we have site_id + cert_type:
await supabase.from("certifications").insert({
  site_id: siteId,
  cert_type: values.cert_type,    // e.g. "LEED"
  level: values.cert_rating,       // e.g. "BD+C"
  status: "in_progress",
  score: 0,
});
```

### 2. Auto-create in PM Config Modal (fixes existing projects)
In `PMProjectConfigModal.tsx`, when `certId` is null but the project has `cert_type` and `site_id`, show a button "Crea Certificazione" that auto-creates the missing `certifications` record. This handles all projects already created without the certification row.

The button will:
- Insert into `certifications` with `site_id`, `cert_type` from the project, `status: "in_progress"`
- Refresh the PM dashboard query
- The Timeline/Scorecard tabs will then work normally

### Files to modify
1. **`src/components/projects/SiteProjectOnboardingForm.tsx`** — Add certification insert after project creation
2. **`src/components/projects/PMProjectConfigModal.tsx`** — Add fallback auto-creation when `certId` is null but project has `cert_type` + `site_id`

