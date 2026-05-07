# Monitor Energy Table — Full Spec Implementation

## Goal
Render `src/pages/Monitor.tsx` as the canonical Energy operations table per the spec. Hide internal columns, expose all editable fields, compute totals from live joins (`products`, `hardwares`, `ops_purchase_orders`, `ops_shipments`), and persist edits to `site_energy_records`.

## Column layout (in order)

Always-visible (filterable where noted):
1. **Project Name** — `project_name` (filter)
2. **Status** — enum badge: Upcoming · Deleted · Installed · Postponed · Completed · On-hold (filter, editable)
3. **Frequency** — 50 / 60 badge (filter, editable)
4. **Free Software year** — number, default 3 (filter, editable)
5. **Installation Date** — date (editable)
6. **Contracted** — yes by default once quote accepted (editable)
7. **PM** — join `profiles.display_name` via `pm_id` (filter, read-only)
8. **Handover date** — `handover_date` formatted "12 May 2026" (editable)
9. **Category** — dropdown badge (filter, editable). Options: Fendi Energy Project 2024, Armani, Bouc. Energy Project, LEED Platinum, Fendi Energy Project, Schneider Reconfiguration, LEED Gold, LEED, Energy Monitoring Project
10. **PO** — comma-separated badges from `ops_purchase_orders.po_number` joined via `hardwares.purchase_order_id` filtered by `site_id`
11. **Installer** — text (editable)
12. **Package** — *merged* column (filter: A · B · Customized).
    - If `category = "Fendi Energy Project 2024"` → dropdown A / B
    - Else → fixed badge "Customized"
    - Stored in new column `package_type` (enum)
13. **Additional Sensors** — computed from CT Builder snapshot vs package capacity
14. **Additional Bridge** — computed similarly
15. **No of Pan-10 / Pan-12 / Pan-14** — from snapshot
16. **No of CT** — equals No of Pan-14
17. **No of Mango** — from snapshot
18. **Total Sensors** — sum Pan-10/12/14
19. **Total Bridge** — `1 + additional_bridge`

Costs (admin only):
20. **Bridge Total Cost** — `products.unit_price` × bridge qty (match name "FGB Bridge LAN/LTE")
21. **Sensor Total Cost** — `products.unit_price` × sensor qty (match "FGB-10/12/14")
22. **Total Package cost ($)** — bridge + sensor + (mango unit price × qty)
23. **Total Package cost (€)** — × `fx_rate_usd_eur` (0.86)
24. **Duty customs fee (inbound)** — `ops_shipments.customs_cost` where `shipment_type='inbound'` and PO matches
25. **VAT fee** — `ops_shipments.vat` (inbound)
26. **Pick-up Cost** — `ops_shipments.total_shipping_cost` (inbound) *— spec says `shipment_cost`; the column in DB is `total_shipping_cost`. Will use that.*
27. **Shipment cost** — `ops_shipments.total_shipping_cost` (outbound)
28. **Outbound Custom cost** — `ops_shipments.customs_cost` (outbound)
29. **Installation Cost** — editable, `installation_cost`
30. **Quotation Value** — editable, `quotation_value`
31. **Company cost 20%** — `0.2 × installation_cost`
32. **FGB resource** — `50 × Σ activity hours` (constant 6.0833 → €304.17 default; editable override `fgb_resource`)
33. **Total Cost** — `Pkg€ + Duty + VAT + Pickup + Shipment + Installation + Company + FGB`
34. **Planned Remaining Value** — `Quotation − Total Cost`
35. **Taxes** — `Planned Remaining × 0.27`
36. **Profit** — `Planned Remaining − Taxes`
37. **ROI** — `Profit / Quotation`

Network section — collapsed, toggled by single button "Show Configuration Specifications":
38. Tracking Number (from `ops_shipments` outbound)
39–44. IP configuration / Assigned Port / IP address / Subnet Mask / Gateway / DNS 1 / DNS 2 (all editable on `site_energy_records`)
45. **Online Status** — always visible, editable

Hidden by default but filterable: Brand, Region, Country, City (exposed in filter bar only).
Removed: Address, Reference Contact, Additional PAN-42.

## Database changes

Migration adds to `site_energy_records`:
- `package_type text` (check in 'A','B','Customized')
- `additional_sensors int default 0`, `additional_bridge int default 0`
- `installation_date date`, `contracted boolean default true`
- `frequency int` already present
- `online_status text` already present
- `fgb_resource numeric` already present (override)

No data migration; defaults handled in code.

## Data fetching

New hook `useMonitorRows()` in `src/hooks/useMonitorRows.ts`:
1. `site_energy_records` rows (with `profiles!pm_id(display_name)`)
2. For each `site_id`, fetch `hardwares(purchase_order_id, ops_purchase_orders(po_number))` → group POs per site
3. For each PO id, fetch `ops_shipments` → group inbound/outbound aggregates per record
4. `useEnergyProductPrices()` for live unit prices
5. Compose into `MonitorRow[]` with all derived fields via a `deriveFinance(row, prices, shipments)` helper extracted from `energyFinance.ts`

## UI

`src/pages/Monitor.tsx`:
- Top filter bar: Project, Brand, Region, Country, City, Status, Frequency, Free SW year, PM, Category, Package
- Single horizontally scrollable table, sticky first 3 columns (Project, Status, PM)
- Section group headers in the header row: Site · Hardware · Costs · Network
- "Show Configuration Specifications" toggle reveals network columns
- Costs section visible only when `isAdmin`
- Inline editing: click a cell → input/select → blur saves via `updateRecord(id, patch)`
- PM cell shows display name; click navigates to `/projects/:certification_id`
- PO cell renders small badges, comma-joined fallback

Components extracted:
- `MonitorFilters.tsx`
- `MonitorTable.tsx`
- `MonitorEditableCell.tsx` (text/number/date/select variants)
- `MonitorPackageCell.tsx` (category-aware A/B vs Customized)

## Files touched
- migration (new) — add columns above
- `src/types/site-energy.ts` — extend interface
- `src/hooks/useMonitorRows.ts` (new)
- `src/lib/energyFinance.ts` — add `deriveFinance(row, ctx)` for table rows
- `src/pages/Monitor.tsx` — rewritten around new hook
- `src/components/monitor/*` (new files above)

## Open question
Spec mentions `shipment_cost` and `customs_fee` on `ops_shipments`; DB has `total_shipping_cost` and `customs_cost`. I'll use the DB columns. Pickup vs shipment for inbound is the same field — both spec lines map to inbound `total_shipping_cost` (Pickup) and outbound `total_shipping_cost` (Shipment). Confirm OK.
