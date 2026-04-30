# Monitor / Energy — End-to-end flow

The goal is a Monitor section whose first view is a filterable **Energy** table with KPIs on top, fed automatically by the existing project flow. Air will get its own table later (same pattern). This plan covers the full chain that produces each row.

## 1. Database changes (new migration)

Two small additions, no destructive changes:

- `**project_allocations**` — add columns (all nullable, no default behavior change):
  - `category` text — `"AIR"` | `"ENERGY"` (used to drive the Air/Energy slider in the assign form and the Monitor split).
  - `requested_quantity` integer — what the PM (Air) or Monitoring Team (Energy) asked for. Existing `quantity` keeps meaning "assigned".
  - `source` text — `"pm_request"` | `"ct_builder"` (so we know if the row came from the project config form or the CT Builder quote).
- `**site_energy_records**` — new table feeding the Monitor → Energy view. One row per (certification_id, site_id) once the quote is accepted; subsequently editable inline by Admin. Columns mirror the spreadsheet headers the user shared:
  ```text
  id, certification_id, site_id, brand_id, region, country, city,
  status, frequency, free_software_year,
  installation_date, contracted, pm_id, handover_date,
  category, po_number, installer, reference_contact,
  package_a, package_b, customized_package,
  additional_sensors, additional_bridge, additional_pan42,
  total_sensors, total_bridges, no_pan10, no_pan12, no_pan14, no_ct,
  bridge_total_cost, sensor_total_cost,
  total_package_cost_usd, total_package_cost_eur,
  duty_customs_inbound, vat_fee, pickup_cost, shipment_cost,
  outbound_custom_cost, installation_cost,
  quotation_value, company_cost_pct, fgb_resource, total_cost,
  planned_remaining_value, taxes, profit, roi_pct,
  tracking_number,
  ip_configuration, assigned_port, ip_address, subnet_mask, gateway, dns1, dns2,
  online_status, notes,
  locked boolean default true, created_at, updated_at
  ```
  RLS: ADMIN full access; PM read-only on rows whose certification they manage (via `is_cert_pm`).
- `**task_alerts**` — no schema change, we just emit a new alert kind `"quote_accepted"` from the CT Builder confirm action so it appears in the existing site history feed (same pattern as other alerts).

## 2. Admin: "Quote accepted" button on the Energy Monitoring panel

In `src/components/projects/EnergyMonitoring/EnergyMonitoringPanel.tsx` (admin only, after CSV upload + computed result):

- Add a primary **"Confirm quote accepted"** button next to the existing Settings/Export controls.
- On click:
  1. Insert one `project_allocations` row per BOM line (`category="ENERGY"`, `source="ct_builder"`, `requested_quantity=qty`, `quantity=0`, `status="Requested"`, `product_id` resolved by mapping CT model / Bridge / Mango → existing `products.name` (PAN-10/12/14, Bridge LAN/LTE, MANGO Gateway). If a product is missing, show a toast listing the missing SKUs and abort.
  2. Insert a `task_alerts` entry of kind `quote_accepted` tied to the certification (visible to Admin + assigned PM, same surface as existing site-history alerts).
  3. Insert/upsert a `site_energy_records` row prefilled from the certification + BOM aggregates (sensors, bridges, costs from `CTResult`). Status defaults to `"Upcoming"`.
- Once accepted, the panel shows a small "Quote accepted on …" banner and disables the button (idempotent — re-clicking does nothing). An admin-only "Re-run / Replace quote" link allows re-confirming, which deletes prior `ct_builder`-source allocations for this cert and replaces them.

## 3. Project Detail → Hardware tab → "Allocated Hardware"

The existing list already reads `project_allocations`. We add:

- A **category badge** (Air / Energy) on each row, using the new `category` column.
- A small "Requested by" sub-label: `PM` for `pm_request`, `Monitoring Team` for `ct_builder`.
- No other change — the rows just appear automatically because they're standard allocations.

## 4. PM project configuration form — backfill `category`

`PMProjectConfigModal` and `ProjectFormModal` already create allocations from PM's air-monitor request. Set `category="AIR"`, `source="pm_request"`, `requested_quantity = quantity` on insert. Existing rows are left unchanged (treated as Air by default in queries via `coalesce(category,'AIR')`).

## 5. Hardwares page → "Assign to Site" form rewrite

Replace the current dialog body in `src/pages/Hardwares.tsx` (lines ~340–393) with a richer form:

```text
[ Air | Energy ]   ← segmented slider at the top (controls the rest)

Project (filterable by PM)        [select]
  PM filter: [all PMs ▾]          [project select ▾]

Hint card (appears once project picked):
  Air    → "For this project {PM name} asked for {n} {monitor type} monitors."
  Energy → "For this project Monitoring Team asked for {n} Bridge,
            {n} PAN-10, {n} PAN-12, {n} PAN-14, {n} MANGO."

Per requested unit, render N assignment rows:
  [ type filter ▾ ]  [ available device id ▾ ]
  (default type = requested type, but admin can pick any other available device)

Energy only — collapsible "Bridge configuration" section:
  IP configuration | Assigned Port | IP address | Subnet Mask
  Gateway | DNS 1 | DNS 2

[ Confirm Allocation ]
```

Submit logic:

1. For each filled assignment row, `update hardwares set site_id, status='Assigned'` and bump the matching `project_allocations.quantity` (the assigned counter) by 1, keeping `requested_quantity` as the requested target.
2. If Energy and bridge config is filled, write those fields onto the bridge `hardwares` row(s) (we add nullable columns `ip_configuration`, `assigned_port`, `ip_address`, `subnet_mask`, `gateway`, `dns1`, `dns2` to `hardwares`).
3. Upsert the `site_energy_records` row for this certification with the resulting totals (sensors, bridges, models breakdown, plus the bridge config). This is the trigger that **populates the Monitor → Energy table**.

## 6. Monitor section: route + Energy table

- Flip `monitor` in `src/lib/hubSections.ts` to `comingSoon: false`.
- New route `/monitor` (default) → `MonitorEnergy` page (Energy is the landing tab; an "Air" tab is stubbed `ComingSoon`).
- Page layout:
  ```text
  [ Energy | Air ]   (tabs)

  KPI strip (recomputed live from current filtered rows):
    Sites · Total Sensors · Total Bridges · Total Cost (€) · Avg ROI %

  Filter bar: brand, region, country, city, status, PM, frequency,
              installation year, online status, free-text search

  Table: all columns from `site_energy_records`, sticky header,
         horizontal scroll, sortable, column visibility menu.
         Each row: leading [pencil] button → unlocks inline editing
         for that row only (admin only). PM sees read-only.
         Save / Cancel inline buttons commit via UPDATE on the row.
  ```
- Export CSV button reuses the same util as the Invoice/CT Builder modules.

## 7. Roles & visibility

- ADMIN: full create/edit on `site_energy_records`, sees costs, can run "Confirm quote".
- PM: sees the Energy row only for their certifications, all cost columns hidden (same gate already used in `EnergyMonitoringPanel`).

## Files

**New**

- `supabase/migrations/<ts>_monitor_energy.sql` — schema additions + RLS.
- `src/pages/Monitor/MonitorPage.tsx` — tabs shell.
- `src/pages/Monitor/Energy/EnergyTable.tsx`, `EnergyKpiStrip.tsx`, `EnergyFilters.tsx`, `EnergyRow.tsx` (inline edit), `useEnergyRecords.ts`.
- `src/pages/Monitor/Air/ComingSoon.tsx`.
- `src/components/hardwares/AssignToSiteDialog.tsx` — extracted, with Air/Energy slider, requested-vs-available logic, bridge config block.
- `src/lib/productMap.ts` — CT model / Bridge / Mango → `products.id` resolver.

**Modified**

- `src/lib/hubSections.ts` — `monitor.comingSoon = false`.
- `src/App.tsx` — `/monitor` route (admin + PM read-only).
- `src/pages/Hardwares.tsx` — replace inline assign dialog with the new component.
- `src/components/projects/EnergyMonitoring/EnergyMonitoringPanel.tsx` — "Confirm quote accepted" button + state.
- `src/components/projects/PMProjectConfigModal.tsx`, `ProjectFormModal.tsx` — set `category="AIR"`, `source="pm_request"`, `requested_quantity`.
- `src/integrations/supabase/types.ts` — regenerated types.
- `src/types/custom-tables.ts` — `SiteEnergyRecord` interface.

## Open question (one)

For the `site_energy_records` rows that already exist conceptually (the ~600 sites in the spreadsheet you pasted), do you want me to:

- **A.** Leave the table empty and let new quote-accepted projects populate it organically, or
- **B.** Add an admin-only "Import CSV" button on the Monitor → Energy page so you can paste/import that historical dataset in one shot?

I'll proceed with **A** by default (cleanest, no DB import noise) unless you prefer B. -> PROCEED WITH **A**  
  
