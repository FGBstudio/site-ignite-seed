## Goal
Replace the **Handover** column with **Issue Date** (`certifications.issued_date`) **only** in the Certified view of the Operations projects table.

## Scope
- File: `src/pages/Projects.tsx` (Operations → Projects tab → Certified status tab)
- No changes to Admin Dashboard, PM Dashboard, Quotations, Inventory, or any other table.

## Plan
1. **Add `issued_date` support to the existing column-filter helpers**
   - Update `getUniqueValues` so the `issued_date` key returns formatted issue dates.
   - Update `matchRowValue` so multi-select filtering works on `issued_date`.
   - Update the search branch in the main `filtered` memo so free-text search also covers `issued_date`.

2. **Conditional header**
   - When `statusTab === "certificato"`, render the column header as **Issue Date** with `colKey="issued_date"`.
   - For all other status tabs, keep the existing **Handover** header with `colKey="handover_date"`.

3. **Conditional cell content**
   - In the Certified tab, display `project.issued_date` formatted as `dd MMM yyyy`, falling back to `—` when null.
   - In all other tabs, keep the current Handover rendering (date + days-left badge).

4. **Sorting**
   - The generic sort already reads `sortConfig.key` directly from the row object, so sorting on `issued_date` will work once the header uses that key.

5. **Verification**
   - Run TypeScript check (`tsgo` or `tsc --noEmit`) to ensure `issued_date` is typed correctly.
   - Check the preview on the Certified tab to confirm Handover is replaced by Issue Date and other tabs remain unchanged.

## Notes
- Data source for Issue Date: `certifications.issued_date` (already fetched by `useAdminPlannerData` via `select("*", ...)`).
- The tab switch already resets column filters/sorting, so switching between tabs will not leave stale filter state.