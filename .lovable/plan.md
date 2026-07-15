## Multi-Certification & Split Quotation — Implementation Plan

### Current state (already partially in place)
- `NewQuotationWizard.tsx` already accepts multi-cert selection via checkboxes (`services.certifications: CertConfig[]`), and already inserts **one row per certification** into the `certifications` table on submit. When >1 cert is selected the row `name` is auto-suffixed with `– <cert_type>`.
- There is **no concept of "unified quotation"** today: N rows always end up as N independent items in the Quotations list, even when the user meant "one quote covering all services".
- Taxonomy dropdowns are driven by `src/data/ratingSubtypes.ts` + a hardcoded `CERT_LEVELS` map in the wizard. Neither matches the new hierarchy (BREEAM/WELL/ESG subtypes are missing; LEED subtypes are outdated).

### What we'll build

**1 · New wizard step "Quotation Strategy" (Step 3 → new Step 3, Review becomes Step 4)**
- Adds a mandatory decision step that appears **only when `certifications.length > 1`** after the "Services & Quote" step. If only one cert is selected the step is auto-skipped.
- UI: a compact recap of the selected certs, each with an ✕ to deselect (updates the same `certifications` array — the "scrematura" the user described).
- Two radio cards:
  - **A · Unified Quotation** — single quotation covering all certifications (grouped).
  - **B · Split Quotations** — one independent quotation per certification.
- New state: `quotationStrategy: 'single' | 'split' | null`. When only one cert remains after deselection the strategy is forced to `'single'` and the step is skipped forward.
- `STEPS` becomes: `1 Site & Project`, `2 Services & Quote`, `3 Strategy` (conditional), `4 Review`.

**2 · Submit handler split-logic (`handleSave` in `NewQuotationWizard.tsx`)**
- Generate a `quotationGroupId = crypto.randomUUID()` **only when `strategy === 'single'` AND certs.length > 1**.
- For every cert row insert, add `quotation_group_id: quotationGroupId | null`.
- Naming rule updated:
  - `single` → all rows share the same `name = services.projectName` (no `– CERT` suffix) so the Quotations list can display them as one card.
  - `split` → keep today's behaviour (`{projectName} – {cert_type}`), no group id.
- Duplicate-check loop already exists — extended to use the new naming rule.

**3 · Database migration**
- Add column `certifications.quotation_group_id UUID NULL` + index. No FK needed (self-grouping identifier). Nullable so all legacy rows stay valid.
- No RLS changes required (column is metadata on an already-secured table).

**4 · Quotations list (`src/pages/Quotations.tsx`) — group-aware rendering**
- Select `quotation_group_id` alongside existing fields.
- Client-side reducer: rows with the same non-null `quotation_group_id` collapse into a **single card** showing:
  - project name, client, region, handover
  - a stack of cert badges (one per row in the group)
  - `total_fees` = sum of the group's rows
  - approving / cancelling the card fans the action out to every row in the group (loop the existing mutation).
- Rows with `quotation_group_id = null` render exactly as today (fully backward compatible).

**5 · Taxonomy alignment (`src/data/ratingSubtypes.ts` + wizard `CERT_LEVELS`)**
Rewrite the taxonomy to the 3-level hierarchy the user specified. Storage columns stay unchanged (`cert_type` / `cert_rating` / `project_subtype`).

```text
LEED  (cert_type)
  ID+C            → Retail | Commercial Interior | Hospitality
  BD+C            → New Construction | Core & Shell | Hospitality | Warehouses | Healthcare | School
  O+M             → Existing Buildings | Interiors
  ND              → (no subtype)
BREEAM
  New Construction → (no subtype)
  In Use           → Part 1 | Part 2
  Refurbishment    → (no subtype)
WELL
  Standard | Core | HSR   (no subtypes)
Taxonomy ESG
  7.1 | 7.2 | 7.5         (no subtypes)
```

Concrete edits:
- Extend `RatingSystem` typing so it covers BREEAM / WELL / ESG ratings, keyed per `cert_type`. Cleanest shape: replace the flat `RATING_SUBTYPES` with a nested `TAXONOMY: Record<CertType, Record<Rating, string[]>>`, plus helpers `getRatings(certType)` and `getSubtypes(certType, rating)`. Update the wizard subtype dropdown to use those helpers.
- Add `ESG` to `AVAILABLE_CERTS` label mapping already exists ("ESG - Taxonomy"); just make sure ratings show up.
- Remove hardcoded `RATING_SYSTEMS` (LEED-only) constant everywhere it's used — search & fix. Currently only `NewQuotationWizard.tsx` imports it.

**6 · Level (Certified/Silver/…) mapping**
- Keep `CERT_LEVELS` per `cert_type` as today. WELL/BREEAM already exist; ESG stays empty (no achievement level).

### Files touched

- `src/components/projects/NewQuotationWizard.tsx` — new step, `quotationStrategy` state, updated submit, uses new taxonomy helpers.
- `src/data/ratingSubtypes.ts` — replace with hierarchical `TAXONOMY` + helpers, keep back-compat named exports.
- `src/pages/Quotations.tsx` — read `quotation_group_id`, collapse groups in `pending` / `approved` / `canceled` tabs, fan-out approve/cancel actions.
- Migration: `ALTER TABLE public.certifications ADD COLUMN quotation_group_id uuid; CREATE INDEX ...`.

### Out of scope (unchanged)
- Site onboarding wizard (`useWizardDraft`) — different flow, not touched.
- `certifications` remains the root entity; no new `quotations` table.
- Payment schemes, budget builder, monitoring flags — unchanged.
