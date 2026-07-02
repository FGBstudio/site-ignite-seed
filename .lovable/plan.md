## Change

Currently, flagging "Potential" in Step 1 of `NewQuotationWizard.tsx` hides Steps 2 and 3 entirely, saving only Site & Project data. The user wants the opposite: **allow** filling Steps 2–3 for a potential quotation, but make all fields there **non-mandatory**.

## Implementation

**File:** `src/components/projects/NewQuotationWizard.tsx`

1. **Remove the skip logic** — Step 2 (Services / Certifications) and Step 3 (Quote / Fees) remain navigable when `isPotential = true`.

2. **Relax validation when `isPotential = true`:**
   - Step 2: don't require selecting a rating system / cert type / subtypes; "Next" button always enabled.
   - Step 3: don't require budget rows, payment scheme, fees, or sent date; "Save" always enabled.
   - Any Zod / manual guard that currently blocks progression must short-circuit when `isPotential`.

3. **Save behavior stays status-driven:**
   - `status = 'potential'` regardless of how much of Steps 2–3 was filled.
   - Persist whatever optional data the user did enter (cert type, subtypes, fees, quotation_budget_history rows, payment scheme) so it's preserved when later resumed via "Go on with Services & Quote".
   - If nothing was entered in Step 2, keep current fallback (skeletal row with nulls).

4. **Resume mode (`resumeCertId`)** already promotes `potential → quotation` on save and re-runs full validation — no change needed there, but confirm the prefilled optional data from the potential draft loads correctly into Steps 2–3.

5. Update the small helper text under the Potential checkbox to reflect the new meaning: *"Site & Project is enough to save. Services and Quote are optional and can be completed later."*

## Out of scope

No changes to `Quotations.tsx`, hooks, or DB schema — status handling and Potential tab already work.
