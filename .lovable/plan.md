## Problem

The PM Hardware tab currently exposes the **entire components catalog** (FGB-10, FGB-12, FGB Bridge LAN/LTE, Mango, individual ClAir sensors…). This contradicts the agreed flow:

- **PM** must only request **systems** (Greeny Energy, ClAir (all the possibilities like LEED, CO2, CO-CO2, Black, WELL ...), Water).
- **Admin** is the one who explodes those systems into the actual BOM (via CT Builder for Energy, or by assigning specific ClAir SKUs for IAQ).

Right now the PM can pick a Bridge LTE on its own, which breaks the lifecycle (no alert pipeline, no CT Builder confirmation, allocations never get exploded correctly).

RISCRIVI IL PLAN ASSICURANDOTI CHE IL PLACEHOLDER SIA SOLO PER L'ENERGIA, MENTRE INVECE PER L'ARIA DEVONO ESSERE DISPONIBILI TUTTI GLI SKU

## Goal

Make the PM Hardware tab show **only system-level placeholders**, derived from the certification's `has_*_monitoring` / `has_hardware_redirection` flags. Keep the granular component catalog reserved for the Admin (CT Builder + Assign dialog), where it already lives.

## Changes

### 1. Catalog: introduce system-level placeholder products

Insert (idempotent) energy and water placeholder rows in `products` with a new `is_system_placeholder boolean` column so they can be filtered, while for air all the sku needs to be available:


| name                            | sku        | category |
| ------------------------------- | ---------- | -------- |
| Greeny Energy Monitoring System | SYS-ENERGY | Energy   |
| &nbsp;                          | &nbsp;     | AIR      |
| &nbsp;                          | &nbsp;     | AIR      |
| &nbsp;                          | SYS-WATER  | Water    |


The existing CT Builder logic (`rpc_confirm_energy_ct_build`) already knows how to replace a generic Energy placeholder with the real BOM — we just normalize the placeholder it looks for to `SYS-ENERGY`.

### 2. PM Hardware tab (`PMProjectConfigModal.tsx` → `HardwareTab`)

- Replace the free dropdown over the full catalog with a **list of system cards** built from the cert flags (`has_iaq_monitoring`, `has_energy_monitoring`, `has_water_monitoring`, `has_hardware_redirection`).
- Each card shows the system, current request status, and a single **Request** button that inserts one `project_allocations` row for the matching `SYS-*` product (qty 1, status `Requested`, `source = 'pm_request'`).
- Already-requested systems show status badge + Withdraw button instead of Request.
- Remove the quantity input and the catalog Select entirely from the PM view.
- Keep `MonitoringSuggestionBanner` at the top.

### 3. Admin views — no behavioral change

- CT Builder (`EnergyMonitoringPanel`) keeps using `rpc_confirm_energy_ct_build`, which replaces the `SYS-ENERGY` placeholder allocation with the actual PAN/Bridge/Mango allocations.
- `AssignToSiteDialog` (Admin) is the only place where individual SKUs (FGB-10, ClAir, etc.) can be picked, exactly as today.

### 4. Alert pipeline

No change required. The DB trigger that emits `monitoring_*_requested` alerts already fires on insert into `project_allocations`; with the new placeholder SKUs the alert flow lights up correctly and deep-links the Admin to CT Builder / Assignment.

## Files touched

- **DB migration**: add `products.is_system_placeholder`, seed 4 placeholder rows, update the CT Builder RPC if it currently filters by a different placeholder name.
- `src/components/projects/PMProjectConfigModal.tsx` — rewrite `HardwareTab` UI + insert logic.
- `src/integrations/supabase/types.ts` — regenerated after migration.

## Out of scope

- Admin-side hardware assignment UI (already correct).
- CT Builder upload/confirm flow (already correct).
- The wizard cert flags (`NewQuotationWizard`) — already correct.

## Open question before I implement

Confirm the four system names/SKUs above are what you want shown to PMs (especially: do you want **one** "ClAir IAQ" system covering both LEED and WELL cases, or keep `LEED ClAir` vs `WELL ClAir` as two separate systems exposed to the PM)?