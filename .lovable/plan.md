# Monitoring Services Lifecycle — End-to-End Plan

Replace the legacy `fgb_monitor` flag with 4 granular service flags and build the full operational pipeline from Quotation → PM request → Admin alert → CT Builder → physical assignment.

---

## 1. Database Migration

### 1.1 `certifications` — granular service flags

Add four booleans (default `false`, not null):

- `has_iaq_monitoring` — ClAir IAQ monitor
- `has_energy_monitoring` — Greeny Energy monitor
- `has_water_monitoring` — Water monitor
- `has_hardware_redirection` — third-party systems (Hardware Redirection)

Backfill: `has_energy_monitoring = fgb_monitor` for all existing rows (preserves current Monitor data). `fgb_monitor` kept as deprecated column for one release, then dropped in a follow-up migration.

### 1.2 `site_energy_records` — sync trigger

Currently isolated. Add trigger `trg_cert_sync_ser` on `certifications`:

- AFTER INSERT or UPDATE of `has_energy_monitoring`, `has_hardware_redirection`: if either is TRUE → upsert SER row (defaults from cert + site, hardware/cost columns untouched). If both FALSE → soft-delete (set inactive flag) so historical data is preserved.
- AFTER UPDATE of `pm_id`, `site_id`, `handover_date`, `project_name`: propagate anaglyphic fields to existing SER row.

Backfill: create SER rows for all certs where the new flags are TRUE and SER is missing.

### 1.3 `project_allocations` — generic vs detailed

Add `is_generic_placeholder boolean default false` and `replaced_by_allocation_id uuid null` so the CT Builder confirm step can mark the "FGB Energy System" row as replaced (audit-friendly) instead of hard-deleting.

### 1.4 `task_alerts` — monitoring alert types

Extend `alert_type` enum/check to include:

- `monitoring_iaq_requested`
- `monitoring_energy_requested`
- `monitoring_water_requested`

Add nullable `target_route text` column so the alert click can deep-link (e.g. `/monitor/assign/{cert_id}` vs `/projects/{cert_id}/hardware/energy`).

### 1.5 RLS

- Admins: full access to new flags + alerts (via `is_admin`).
- PMs: read flags on their certs (via `is_cert_pm`), insert into `project_allocations` for their certs (already in place).
- Alert insert: triggered by DB function (security definer) on `project_allocations` insert, so it bypasses PM-side restrictions cleanly.

---

## 2. Frontend — Phase A: Quotation Wizard (Admin)

File: `src/components/projects/NewQuotationWizard.tsx`

- Replace the single `fgbMonitor` boolean with a per-certification flags object inside `CertConfig`:
  ```ts
  flags: {
    iaq: boolean; energy: boolean; water: boolean; hardwareRedirect: boolean;
  }
  ```
- UI: inside each cert card (Services step), render a small "Monitoring services" group:
  - If `cert_type ∈ {LEED, WELL, BREEAM}` → 3 checkboxes: IAQ, Energy, Water.
  - If `cert_type = Energy_Audit` → 2 checkboxes: Energy, Hardware Redirection.
  - Otherwise (ESG, GRESB) → hide group.
- Persist on insert into `certifications` (one row per cert config) using the new columns. Remove the legacy `fgb_monitor: services.fgbMonitor` line.
- Update the global "FGB Monitor" pill in step 2 (the one in the screenshot): repurpose it as a read-only summary chip per cert showing the enabled services.

---

## 3. Frontend — Phase B: PM Hardware Request

File: `src/components/pm/PMProjectConfigModal.tsx` (Hardware tab).

- New hook `useCertificationServiceFlags(certId)` reading the 4 flags.
- Contextual banner component `MonitoringSuggestionBanner` shown above the catalog selector:
  - Energy on → "[AdminName] included Energy monitoring in the quotation. Select 'FGB Energy System' (Qty 1) to proceed."
  - IAQ on → "[AdminName] included IAQ monitoring. Select the appropriate IAQ monitors."
  - Water on → analogous message.
- PM inserts rows in `project_allocations`:
  - Energy → 1 row, `product_id = FGB_ENERGY_SYSTEM`, `is_generic_placeholder = true`, status `Requested`.
  - IAQ / Water → specific products, `is_generic_placeholder = false`.

---

## 4. DB Trigger — Phase C: Auto-generate Admin Alerts

`trg_allocation_create_monitoring_alert` AFTER INSERT on `project_allocations`:

- Resolve cert flags and product category.
- Insert into `task_alerts` with `escalate_to_admin = true`:
  - IAQ product → `monitoring_iaq_requested`, `target_route = /monitor/assign/{cert_id}` (opens AssignToSiteDialog directly).
  - Generic FGB Energy System → `monitoring_energy_requested`, `target_route = /projects/{cert_id}/hardware/energy` (CT Builder).
  - Water → `monitoring_water_requested`, route TBD (assign dialog by default).

Alerts surface in the existing Monitoring section list. Admin click → `useNavigate(alert.target_route)`.

---

## 5. Frontend — Phase D: CT Builder Confirm (Admin, Energy only)

File: `src/components/projects/EnergyMonitoring/EnergyMonitoringPanel.tsx`

- CSV upload + parser stays in-browser (read-only).
- On "Confirm Configuration" call a new RPC `rpc_confirm_energy_ct_build(cert_id, components jsonb)` (SECURITY DEFINER, single transaction):
  1. Mark the generic `FGB_ENERGY_SYSTEM` allocation row → `status = 'Replaced'`, set `replaced_by_allocation_id` after step 2.
  2. Insert one allocation row per component (e.g. PAN-10 ×3, Bridge ×1) with `status = 'Requested'`.
  3. Resolve the related `task_alerts` row (`monitoring_energy_requested`) and optionally insert a follow-up `monitoring_energy_ready_to_assign` alert routing to the Assign dialog.

---

## 6. Frontend — Phase E: Assign to Site

File: `src/components/hardwares/AssignToSiteDialog.tsx`

- The dialog already builds slots from `project_allocations` rows with `status = 'Requested'`. Since Phase D replaced the generic row with specifics, slots will be correct automatically — no logic change required besides filtering out `status = 'Replaced'` rows (verify).
- On Assign click:
  - `hardwares` → mark units `Assigned`, link to `site_id`.
  - `ops_shipments` → insert shipment record.
  - `project_allocations` → status `Confirmed`.
  - `site_energy_records` → upsert exact component counts.
- All four steps wrapped in a Supabase RPC `rpc_finalize_assignment` to guarantee atomicity.

---

## 7. Frontend — Monitor Dashboard (visibility)

File: `src/hooks/useMonitorRows.ts` + `src/pages/Monitor.tsx`

- Source switched from `site_energy_records` standalone to `certifications` left-joined with SER:
  - **Energy table**: `WHERE has_energy_monitoring OR has_hardware_redirection`.
  - **IAQ table**: new tab, `WHERE has_iaq_monitoring`. Reads from existing `iaq_*` aggregates (or shows pending allocations until devices are assigned).
  - **Water table**: new tab, `WHERE has_water_monitoring` (placeholder UI; data source to be defined when sensors land).
- Anaglyphic fields (name, PM, handover, site) come from cert; operational fields (live telemetry, device counts) come from SER.

---

## 8. Types & Hooks Updates

- `src/types/custom-tables.ts`: extend `Certification` interface and SER interface.
- After migration, the Supabase client types regenerate automatically.
- New hook: `useMonitoringAlerts()` filtering `task_alerts` by the 3 new alert types for the Admin Monitoring tab.

---

## 9. Verification Checklist

- Insert quotation with each flag combination → verify cert columns + SER trigger creates row for energy/hardware_redirect only.
- PM request generic FGB Energy System → alert appears with correct deep-link.
- CT Builder Confirm → generic row replaced, specific rows inserted, alert resolved.
- Assign to Site → atomic update across 4 tables.
- Monitor tabs show the right cert subsets.
- Existing `fgb_monitor = true` certs still appear in Energy tab after backfill.

---

## Technical Notes

- All DB structural changes done via `supabase--migration` in one transactional script (granular flags + SER trigger + allocation columns + alert types + RLS + backfill + RPCs).
- No drop of `fgb_monitor` in this iteration — kept for safety, dropped in a follow-up after we verify the new flow in prod.
- Trigger-driven alert creation avoids client-side race conditions and ensures the Monitoring section never misses a PM request.
- All RPCs use `SECURITY DEFINER` with `search_path = public` and validate the caller via `is_admin()` / `is_cert_pm()` where appropriate.