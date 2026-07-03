
# Cascade cancellation: quotation → site freeze

## Goal
When a quotation (certification) is moved to `canceled`, if the linked `site` has no other active (non-canceled) certifications, the site is automatically canceled/frozen and hidden from all frontend lists. If the quotation is later resumed, the site is unfrozen.

## Changes

### 1. Database — add `status` to `sites`
Migration:
- `ALTER TABLE public.sites ADD COLUMN status text NOT NULL DEFAULT 'active'` with a CHECK on (`'active'`, `'canceled'`).
- Add trigger `trg_sites_cascade_from_certifications` on `public.certifications` AFTER UPDATE OF status:
  - When a certification transitions **to** `canceled` and it has a `site_id`: if no sibling certification on the same site has status ≠ `canceled`, set that site's `status = 'canceled'`.
  - When a certification transitions **from** `canceled` to anything else and it has a `site_id`: set the site's `status = 'active'` (unfreeze).
- Trigger runs `SECURITY DEFINER` so it bypasses RLS.

Rationale: putting logic in a DB trigger guarantees consistency across all entry points (Quotations UI, edge functions, admin scripts) — not just the `handleCancel` in `Quotations.tsx`.

### 2. Frontend — hide canceled sites everywhere
A frozen site must disappear from the client-facing frontend and from selectors:
- `useSites` (`src/hooks/useProjectDetails.ts`): add `.neq("status", "canceled")` by default; accept an optional `includeCanceled` flag for admin views.
- Any place listing sites for pickers/onboarding (`SiteProjectOnboardingForm`, `NewQuotationWizard` site selector, Monitor, PMPortal site cards, etc.) — audit and add the same filter. I'll grep for `.from("sites")` and adjust each read path.
- Certification lists already exclude `canceled` where appropriate; no change needed there.

### 3. UX
- `Quotations.tsx` `handleCancel` confirm dialog updated to warn: "If this is the only quotation for the site, the site will also be frozen and hidden."
- `handleResume` in `Quotations.tsx`: no code change needed — the DB trigger will unfreeze the site automatically.

## Out of scope
- No new admin UI to see/restore frozen sites in this pass. If needed later, we add an admin toggle that queries with `includeCanceled: true`.

## Technical notes
```text
certifications (UPDATE status)
        │
        ▼
trg_sites_cascade_from_certifications  (SECURITY DEFINER)
        │
        ├── to 'canceled' + no other active certs on site → site.status = 'canceled'
        └── from 'canceled' → site.status = 'active'
```
