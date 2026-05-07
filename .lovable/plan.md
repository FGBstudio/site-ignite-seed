# Energy Monitoring — Cost Pipeline & Monitor Table Refactor

## Problemi rilevati

1. **Prezzi disallineati**: la CT Builder usa `DEFAULT_PRICES` hardcoded in `types.ts` (PAN-10/12/14 = 104.30, Bridge LAN = 237.30, ecc.) invece di leggere da `products.unit_price` (single source of truth, già allineata sui valori giusti). Il MANGO è già a $38 nel DB.
2. **Mango assente nella riconciliazione DB**: in `EnergyMonitoringPanel.handleConfirmQuote`, il counter `no_pan*` viene salvato ma NON viene salvato `no_mango` (colonna mancante) né `additional_*`.
3. **Allocation con quantity 0**: gli `project_allocations` vengono inseriti con `quantity: 0` e `requested_quantity: b.quantity` — corretto a livello logico, ma le card Hardware Request Log mostravano lo zero. Verificheremo che il fix del `requested_quantity` (in `ProjectDetail.tsx`) copra anche eventuali altri consumer.
4. **`site_energy_records` mancante di `no_mango`** come colonna dedicata. Va aggiunta.
5. **Monitor table** (`src/pages/Monitor.tsx`) mostra solo ~10 colonne su 55+ richieste; nessuna sezione finanziaria/network. Va riprogettata a tab.
6. **FX, VAT, customs, profit, ROI** non sono calcolati: nessuna pipeline esiste.

## Decisioni confermate
- Prezzi: **sempre da `products.unit_price`** (warning admin se 0 o prodotto mancante).
- FX: **0.86 EUR/USD fisso** all'acquisto. VAT/customs/company-cost % configurabili. Taxes/Profit/ROI auto-calcolati ed editabili da admin.
- UI Monitor: **tabella unica + riga espandibile a tab** (Site info, Hardware, Costs, Network).

---

## Piano di implementazione

### 1. Migrazione DB
- Aggiungere `no_mango integer` a `site_energy_records`.
- Aggiungere `fx_rate_usd_eur numeric default 0.86` a `site_energy_records` (storicizza il tasso usato).
- Creare tabella `energy_finance_settings` (singleton) con: `vat_pct`, `customs_inbound_pct`, `customs_outbound_pct`, `pickup_default_usd`, `shipment_default_usd`, `installation_default_usd`, `company_cost_pct` (default 20). RLS: SELECT authenticated, ALL admin. Seed con valori di default.

### 2. Pipeline prezzi unificata (`src/lib/productPricing.ts` — nuovo)
- Hook `useProductPrices()` che fa `SELECT id, sku, name, unit_price FROM products WHERE category='Energy'` e ritorna mappa `{ "PAN-10": 104.30, ... , "MANGO Gateway": 38, "LAN Bridge": 237.30, "LTE Bridge": 307.30 }`.
- Refactor `processRows` in `lib/ctBuilder.ts`: accettare un parametro opzionale `prices: Record<string, number>` che sostituisce `DEFAULT_PRICES`. Se non fornito, fallback ai valori attuali (sicurezza).
- `EnergyMonitoringPanel`: caricare prezzi via hook; passarli a `processRows`. Se un prezzo è 0/mancante mostrare warning con `<Alert>` ma permettere comunque il calcolo.

### 3. Confirm quote — completare il payload
- Aggiungere `no_mango: settings.useMango ? 1 : 0` al payload `recordPayload`.
- Calcolare e salvare:
  - `bridge_total_cost`, `sensor_total_cost` (già OK)
  - `total_package_cost_usd` = sensorCost + infraCost (già OK)
  - `total_package_cost_eur` = USD × `fx_rate_usd_eur` (0.86)
  - `fx_rate_usd_eur: 0.86`
  - `company_cost_pct` da settings finance (default 20)
  - Default per `duty_customs_inbound`, `vat_fee`, `pickup_cost`, `shipment_cost`, `outbound_custom_cost`, `installation_cost` calcolati dai % di `energy_finance_settings`
  - `total_cost` = somma di tutti i cost components
  - `quotation_value`, `planned_remaining_value`, `taxes`, `profit`, `roi_pct` calcolati con la formula admin (esposta in helper `computeFinance()`).
- Inserire anche un `MANGO Gateway` allocation row (anche se BOM già lo include — verificato in `ctBuilder.ts` riga 132-138).

### 4. Helper finanziario `src/lib/energyFinance.ts`
```text
totalHardwareUsd  = sensor + bridge + mango
totalHardwareEur  = totalHardwareUsd × fx
duties            = totalHardwareEur × customs_inbound_pct
vat               = (totalHardwareEur + duties) × vat_pct
shippingTotal     = pickup + shipment + outboundCustom
installation      = installation_default
companyCost       = (totalHardwareEur + duties + vat + shipping + installation) × company_cost_pct
totalCost         = sum of all above + fgb_resource
quotationValue    = (provided by admin or default = totalCost × 1.3)
profit            = quotationValue − totalCost − taxes
roi               = profit / totalCost × 100
```
Tutti i campi restano editabili manualmente nella Monitor table.

### 5. Monitor table — refactor (`src/pages/Monitor.tsx`)
Layout:
```text
┌─ KPI strip (Sites, Sensors, Bridges, Mango, Total Cost €, Avg ROI) ─┐
├─ Filters: search, status, region, country ─────────────────────────┤
├─ Tabella principale (colonne pinned: Project, Brand, Country, City,│
│   Status) + Total Cost €, ROI%, Online, ▸ Expand                   │
└─ Riga espansa = Tabs:                                               │
    • Site info     (Region/Country/City/Frequency/Free SW year/      │
                     Installation/Contracted/PM/Handover/Category/    │
                     PO/Installer/Reference Contact)                  │
    • Hardware      (Package A/B/Custom, Add. Sensors/Bridge/PAN-42, │
                     Total Sensors/Bridges, PAN-10/12/14, CT, Mango) │
    • Costs (admin) (Bridge/Sensor cost, Total $/€, Duty, VAT,       │
                     Pickup, Shipment, Outbound, Installation,       │
                     Quotation, Company 20%, FGB resource, Total,    │
                     Planned remaining, Taxes, Profit, ROI)           │
    • Network       (Tracking#, IP cfg, Port, IP, Subnet, Gateway,   │
                     DNS1, DNS2, Online status)
```
- Edit inline per campo (admin-only su sezione Costs).
- PM: tabs Site/Hardware/Network visibili; tab Costs nascosta.

### 6. Tipi TS
- Aggiornare `src/types/site-energy.ts` con `no_mango`, `fx_rate_usd_eur`.
- Aggiungere `EnergyFinanceSettings` in `src/types/custom-tables.ts`.

### 7. Verifiche post-merge
- Confermare quote su un progetto test → check `site_energy_records` ha tutti i campi numerici popolati correttamente.
- Monitor table: verificare KPI Total Cost ≠ $0.
- PM view: tab Costs nascosta; nessun prezzo visibile.

---

## File toccati
- **DB migration**: `site_energy_records` + nuova `energy_finance_settings`
- `src/components/projects/EnergyMonitoring/types.ts` — rimuovere DEFAULT_PRICES (o tenerlo come fallback con commento)
- `src/components/projects/EnergyMonitoring/lib/ctBuilder.ts` — `processRows(rows, settings, prices?)`
- `src/components/projects/EnergyMonitoring/EnergyMonitoringPanel.tsx` — fetch prezzi, payload completo, alert prodotti mancanti
- `src/lib/productPricing.ts` — **nuovo** hook
- `src/lib/energyFinance.ts` — **nuovo** helper calcoli
- `src/pages/Monitor.tsx` — refactor tabella + tabs espandibili
- `src/types/site-energy.ts`, `src/types/custom-tables.ts`
