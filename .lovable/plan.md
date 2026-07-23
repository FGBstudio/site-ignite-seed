## Saturation Matrix — 3 UI improvements

Scope: `src/components/capacity/SaturationMatrix.tsx` + light changes to `src/hooks/useSaturationMatrix.ts` and the two consumers (`CapacityDashboard.tsx`, `PMPlanner.tsx`). No DB or business-logic changes.

### 1. Horizontal calendar navigation
- Add an internal `weekOffset` state (in weeks) inside `SaturationMatrix`.
- Compute `effectiveAnchor = addWeeks(anchorDate, weekOffset)` and feed it to `buildWeekRange`.
- Add a small toolbar above the table with:
  - `‹ Prev` button → `weekOffset -= weekCount` (page back a full window)
  - `Today` button → resets offset to 0
  - `Next ›` button → `weekOffset += weekCount`
  - Label showing the current visible range, e.g. `13 Oct → 2 Feb`.
- Keep the existing `overflow-x-auto` wrapper so the user can still scroll within the visible window; the buttons page the window forward/back in the calendar.

### 2. Composite project label (this section only)
- In the project sub-rows, replace the current `c.name` display with a concatenation:
  `CLIENT · CITY · PROJECT` (all uppercase, matching the app-wide caps rule for client/city).
- To get client and city, extend `useAllSaturationCerts` and `useMySaturationCerts` in `useSaturationMatrix.ts` to also select `client` plus `sites(city, brand_id, brands(name))`, then resolve `client` with the same fallback used in `useAdminPlannerData` (certifications.client → brand name).
- Add `client` and `city` fields to the `SaturationCert` interface; keep `name` untouched (used nowhere else after this change in this component).
- Change is confined to `SaturationMatrix.tsx`; other tables keep their existing layout.

### 3. Collapse all / Expand all
- Add a toggle button in the same toolbar: label flips between `Expand all` and `Collapse all` based on current state.
- Implementation: when clicked, set `expanded` to an object mapping every `users[].id` to `true` (expand) or `false` (collapse). Default remains expanded (current behaviour).

### Out of scope
- No changes to allocations, HR off-days, 40h cap logic, styling tokens, or other tables.
