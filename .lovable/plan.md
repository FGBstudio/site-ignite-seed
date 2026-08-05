# Monitor · Report — Naming, Quarters & Monitor Typology

Confirmed: the pivot table is rendered by `src/components/monitor/PivotTableRenderer.tsx`, fed by `src/pages/MonitorReport.tsx` (controller) and `src/lib/monitorPivot.ts` (adapters + tree builder).

## 1. Project naming: CLIENT CITY PROJECT

Today the adapters use only the record's project name. All three domains already carry client (brand), city and project through the shared identity resolver (`src/lib/monitorIdentity.ts`).

Change: in `monitorPivot.ts` build the label as `CLIENT CITY Project` (e.g. `EQT MIRANDOLA Minerva`), with client/city uppercased and missing parts skipped. Applied to Energy, Air Quality and Water. Water rows lack city/brand today in the pivot path — they are added from the same identity maps.

## 2. Time windows by company quarters

Replace the current day-by-day grouping (one row per exact handover date) with a quarter-based hierarchy:

```text
Q3 2026 (Jul–Sep)  — Closing now
  Europe
    EQT MIRANDOLA Minerva      12
Q4 2026 (Oct–Dec)  — Next quarter
Q1/Q2 2027         — Long-range forecast (6-month blocks)
```

- Fixed calendar quarters: Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec.
- Bucket labels derived from today: current quarter = "Closing (in scadenza)", next quarter = "Mid-construction", anything beyond = long-range forecast grouped in 6-month blocks (H1/H2 of the following years).
- Each quarter node shows the correct totals (sensors and hardware breakdown) summed from its projects; region subtotals stay inside each quarter.
- A view switch keeps the option to drill to the exact date list inside a quarter (expand), so no detail is lost.
- A small header strip above the table shows the three headline numbers: current quarter, next quarter, long-range total.

## 3. Monitor typology assignment (why everything looks WELL)

Root cause found: in `adaptAir` the LEED/WELL/CO2 split is guessed from the project *name* string, and when no keyword matches it falls back to `well = total`. Since project names never contain "leed"/"well", nearly every record is counted as WELL.

The real source exists: `site_air_records.air_product_ids` → `products` (LEED ClAir, WELL ClAir, WELL ClAir black, CO2 ClAir, CO2 ClAir black, CO-CO2 ClAir). Current data: 109 LEED, 161 WELL, 22 CO2, plus records with no product assigned.

Change:
- `useAirRows` already returns `air_product_ids`; resolve product id → typology (LEED / WELL / CO2) using the products catalogue, as the Air table already does.
- `adaptAir` splits the sensor count across the typologies actually assigned (even split when several are present on one record) and stops guessing from the name.
- Records with no product assigned go to a new "Unassigned" column instead of being silently counted as WELL, so the gap is visible.
- Energy and Water keep their own breakdowns unchanged.

## Technical notes

- `src/lib/monitorPivot.ts`: new `buildLabel()`, quarter bucketing (`quarterKey`, `bucketOf`), `PivotDate` becomes `PivotPeriod` with `periodKey`/`periodLabel`/`bucket`, `NormalizedRecord` gains `client`, `city`, `typology`, `unassigned`.
- `src/components/monitor/PivotTableRenderer.tsx`: header rows for quarter buckets, new "Unassigned" column for the air domain, totals row recalculated.
- `src/pages/MonitorReport.tsx`: pass products map to the air adapter, add the headline strip, keep the existing Excel-style filters untouched.
- `src/hooks/useWaterRows.ts`: expose city/client already resolved (fields exist, just forwarded to the adapter).
- No database changes required.
