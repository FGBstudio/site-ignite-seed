# Plan — accept ESG variants in `certifications.cert_type`

## Context
- The label "ESG – Taxonomy" in the New Quotation wizard maps to `cert_type = "ESG"` (see `AVAILABLE_CERTS` in `NewQuotationWizard.tsx`).
- The DB CHECK constraint `certifications_chk_cert_type` currently allows: `LEED, BREEAM, WELL, Energy, ESG, GRESB, Energy_Audit`.
- "ESG" already passes, but you also want `TAXONOMY` and `ESG-TAXONOMY` (any casing) to be valid — so imports/manual inserts/external integrations don't fail.

## Change
Single migration on `public.certifications`:

1. Drop `certifications_chk_cert_type`.
2. Recreate it to accept the existing values **plus** `TAXONOMY` and `ESG-TAXONOMY`, matched case-insensitively so `esg`, `Esg-Taxonomy`, `taxonomy` all pass:

```sql
ALTER TABLE public.certifications
  DROP CONSTRAINT certifications_chk_cert_type;

ALTER TABLE public.certifications
  ADD CONSTRAINT certifications_chk_cert_type
  CHECK (upper(cert_type) = ANY (ARRAY[
    'LEED','BREEAM','WELL','ENERGY','ESG','GRESB','ENERGY_AUDIT',
    'TAXONOMY','ESG-TAXONOMY'
  ]));
```

## Out of scope
- No frontend changes. The wizard keeps sending `"ESG"` (already valid); the label "ESG – Taxonomy" is unchanged.
- No data backfill: existing rows already satisfy the new constraint.
- `cert_level_by_type_chk` is untouched (ESG has no level requirement).

## Verification
- Run migration; existing rows keep validating.
- `INSERT ... cert_type='TAXONOMY'` and `'ESG-TAXONOMY'` succeed.
- Creating a quotation with ESG – Taxonomy from the wizard still works.
