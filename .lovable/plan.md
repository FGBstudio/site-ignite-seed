## Goal

Port the `app_ct_builder_1.py` Streamlit script into the **Hardware tab** of the Project Detail page as an **Energy Monitoring** sub-section. Admins see everything (sensors, costs, BOM, totals); PMs see only the technical strategy (no costs, no $ widgets, no BOM cost columns).

The module is shown only when the project requires energy monitoring (we'll surface it via a toggle/flag on the tab — see Q below).  


!only the admins have the botton tu upload the csv and dowload the final output!

&nbsp;

## UX

Inside the existing `Hardware` tab we add a secondary segmented control:

```text
[ Allocated Hardware ]   [ Energy Monitoring (CT Builder) ]
```

The existing allocations table stays as-is. The new view adds:

1. **Settings panel** (collapsible, top-right "Settings" button → Sheet/Drawer):
  - Power Factor slider (0.5–1.0, default 0.8)
  - Impact Threshold slider (5–50%, default 10)
  - Editable Load Profiles table (Use, Kc%, Hours, Days)
  - Bridge Connectivity (LAN / LTE / None)
  - Include Mango Gateway (checkbox)
  - Strategy radio: Individual Load > Threshold | End-Use Group > Threshold
2. **CSV Upload zone** (drag & drop, `.csv` only) — accepts the SLD input.
3. **KPI strip** (4 cards, mirrors `KpiStrip.tsx` from Invoice module):
  - Total Facility Energy (kWh/y) — visible to all
  - No. of Sensors — visible to all
  - **Sensors Cost ($)** — admin only
  - **Total Hardware Cost ($)** — admin only
4. **Detailed Strategy table** with sticky header, horizontal scroll, critical rows highlighted in red. Columns:
  Electrical Panel, To monitor, Load Type, Amps, Power [W], Energy [kWh/y], CT Model, Sensors, Percentage [%], **Hardware Cost [$]** (admin only).
5. **Bill of Materials** card (admin only — full hidden for PM):
  - Aggregated CT models + Bridges + Mango with quantities and unit/total cost.
  - "Download BOM CSV" + "Download Full Strategy CSV" buttons.

PM view: items 4 keeps cost column hidden; item 5 entirely hidden; KPI strip shows only the 2 non-cost cards.

## Visual identity

- Use existing tokens: `Card`, `Badge`, `Button`, `Tabs`, `Slider`, `Switch`, `RadioGroup`, `Input`, `Table` (shadcn).
- Match Apple-aesthetic minimal style already in the project (frosted glass cards, rounded-lg, `text-foreground`/`text-muted-foreground`).
- Reuse `KpiStrip` pattern from `src/pages/Invoice/components/KpiStrip.tsx` for consistency.
- Critical row: `bg-destructive/10` (matches existing `is_deadline_critical` styling on PM cards).

## Technical plan

### 1. New folder: `src/components/projects/EnergyMonitoring/`

- `EnergyMonitoringPanel.tsx` — entry component, takes `{ certificationId, isAdmin }`.
- `CTBuilderSettings.tsx` — settings drawer (Sheet) with sliders + load profile editor.
- `CTBuilderUpload.tsx` — CSV dropzone using native `<input type="file">` + drag handlers.
- `CTBuilderResults.tsx` — KPI strip + results table + BOM (conditionally rendered by role).
- `lib/ctBuilder.ts` — pure TS port of the Python logic:
  - `PRICES`, `LOAD_PROFILES` defaults
  - `getSensorCountAndType(phase)`
  - `parseWireDimension(wire)` — regex `/[-+]?\d*\.\d+|\d+/g`
  - `determineCtModel(amps, wireSqmm)`
  - `processRows(rows, settings)` → `{ rows: ProcessedRow[], totalEnergy, sensorCost, totalSensors, bridgesNeeded, infraCost, totalProject, bom }`
- `lib/csvParser.ts` — small CSV parser (no new dep; handles `,` delim, quoted fields, header trimming). Required headers: `Electrical Panel`, `To monitor`, `Load Type`, `Phase Configuration`, `Current [A]`, `Wire Dimensions`, optional `Contemporary Power`.
- `lib/csvExport.ts` — toCSV + download helper.
- `types.ts` — `RawRow`, `ProcessedRow`, `Settings`, `BomItem`.

### 2. Settings persistence (per-certification)

Use Zustand with `localStorage` (same pattern as Invoice module): `useCTBuilderStore.ts` keyed by `certificationId` so each project keeps its own settings + last uploaded dataset. **No DB changes** — strictly client-side, consistent with the user's "we'll align DB later" preference for the Invoice module.

### 3. Wire into ProjectDetail

In `src/pages/ProjectDetail.tsx`, replace the current `<TabsContent value="hardware">` block with a new `<HardwareTab>` component that renders:

```tsx
<Tabs defaultValue="allocated">
  <TabsList>
    <TabsTrigger value="allocated">Allocated Hardware</TabsTrigger>
    <TabsTrigger value="energy">Energy Monitoring</TabsTrigger>
  </TabsList>
  <TabsContent value="allocated">{/* current table */}</TabsContent>
  <TabsContent value="energy">
    <EnergyMonitoringPanel certificationId={projectId} isAdmin={role === "ADMIN"} />
  </TabsContent>
</Tabs>
```

### 4. Role gating

- `isAdmin = role === "ADMIN"` from `useAuth()`.
- All cost-bearing UI is conditionally rendered (`{isAdmin && ...}`) — never relies on CSS hiding.
- KPI strip receives a filtered items array based on role.

### 5. Sample CSV template

Add `public/templates/ct-builder-sample.csv` with the expected columns + one example row, exposed via a "Download template" link next to the upload zone (uses `asset()` helper).

## Files to create/modify

**Create:**

- `src/components/projects/EnergyMonitoring/EnergyMonitoringPanel.tsx`
- `src/components/projects/EnergyMonitoring/CTBuilderSettings.tsx`
- `src/components/projects/EnergyMonitoring/CTBuilderUpload.tsx`
- `src/components/projects/EnergyMonitoring/CTBuilderResults.tsx`
- `src/components/projects/EnergyMonitoring/types.ts`
- `src/components/projects/EnergyMonitoring/lib/ctBuilder.ts`
- `src/components/projects/EnergyMonitoring/lib/csvParser.ts`
- `src/components/projects/EnergyMonitoring/lib/csvExport.ts`
- `src/components/projects/EnergyMonitoring/store/useCTBuilderStore.ts`
- `public/templates/ct-builder-sample.csv`

**Modify:**

- `src/pages/ProjectDetail.tsx` — replace Hardware tab content with sub-tabs.

## Out of scope (confirm to defer)

- DB persistence of strategies / BOM — **client-side only for now** (per existing pattern with Invoice module).
- Auto-creating `project_allocations` rows from BOM — left as a future "Push to Allocations" admin-only button.

## One small clarification

The user said *"per i siti per cui è previsto un monitoraggio dell'energia"*. There isn't yet a flag on `certifications`/`sites` for this. Two options:

- **A.** Always show the "Energy Monitoring" sub-tab on every project (simplest, no schema change).
- **B.** Add a client-side toggle (admin only, persisted in localStorage) "This site requires energy monitoring" that gates visibility for everyone.

I'll proceed with **A** unless you prefer B — it's the lowest-friction option and matches how the rest of the Hardware tab behaves today.