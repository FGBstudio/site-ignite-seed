## Problem

In the **New Quotation** wizard (Site & Project step), the `Client *` field is left empty and its placeholder suggests the **Holding** name (`e.g. Prada Group`). This encourages users to type the holding as client, but the correct value must be the **Brand** (e.g. `Miu Miu`), as shown in the second reference screenshot.

The Client field is a free-text input backed by `services.client`, saved to `certifications.client`. It is not linked to the Brand selector above it.

## Fix (scoped to `src/components/projects/NewQuotationWizard.tsx`)

1. **Auto-fill Client from the selected Brand**, mirroring the existing pattern used for Project Name ↔ Site Name:
   - Add a `clientTouched` state flag (default `false`).
   - Add a `useEffect` that, while `!clientTouched` and `brandName` is set, keeps `services.client === brandName`.
   - Set `clientTouched = true` inside the `onChange` of the Client input so manual edits are preserved.
   - Reset `clientTouched` on wizard close/reset alongside the other state resets.

2. **Update placeholder** of the Client input from `e.g. Prada Group` to `e.g. Miu Miu (auto-filled from Brand)` to reflect the new semantics.

3. **No DB migration, no changes to save logic** — `services.client` still flows through unchanged into `certifications.client`. Existing rows are untouched.

4. **Resume mode**: when the wizard is opened via `resumeCertId`, the cert already carries a `client` value; set `clientTouched = true` after prefill so we do NOT overwrite a stored client with the brand name.

## Out of scope

- Backfilling wrong `client` values already saved in the DB (holdings written as clients on past quotations). Can be addressed separately if the user wants a one-shot data cleanup.
- Changes to the `resolveClient` fallback in `useAdminPlannerData` (already brand-based).