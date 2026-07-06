## Obiettivo

Uniformare TUTTE le viste tabellari elencate al formato rigido **CLIENT | CITY | PROJECT NAME** come prime tre colonne (sticky left), con dati letti via join relazionale `certifications → sites` in un'unica query.

**Nota schema (verificato)**: le colonne reali sono `certifications.client`, `certifications.name` (NON `project_name`), `sites.city`. Manterremo la spec dell'utente mappandola correttamente allo schema.

---

## 1. Tipo base condiviso

`src/types/index.ts` — aggiungere:

```ts
export interface ProjectContextBase {
  certifications?: {
    client: string | null;
    name: string | null;          // project name
    sites?: { city: string | null } | null;
  } | null;
}
```

Componente helper `src/components/projects/ProjectContextCells.tsx` che esporta `<ClientCell/>`, `<CityCell/>`, `<ProjectNameCell/>` con formattazione standard (bold primary / muted / normal) + fallback `'—'`. Le tre celle sono `sticky left-0` opzionalmente attivabili.

---

## 2. Query da estendere (join `certifications(client, name, sites(city))`)

Per ogni tabella target, la query che la alimenta viene estesa con il nested select. Dove la fonte è già `certifications` direttamente, si aggiunge `sites(city)`.

| Vista | File/hook query da aggiornare |
|---|---|
| Projects | `src/pages/Projects.tsx` (usa `useAdminPlannerData`) — già ha `sites(name,city,country)` ✓, solo UI |
| PM Portal | `src/pages/PMPortal.tsx` / `src/hooks/usePMPortalData.ts` |
| PM Board | `src/components/projects/PMProjectsBoard.tsx` / `useMyCertifications` |
| Reports | `src/components/projects/ProjectsReports.tsx` |
| Project Payments | `src/components/projects/ProjectPayments.tsx` / `usePaymentMilestones` |
| Invoices Emesse | `src/pages/Invoice/tabs/InvoicesEmesse.tsx` (+ `useInvoiceStore`) |
| Invoices Da Emettere | `src/pages/Invoice/tabs/InvoicesDaEmettere.tsx` |
| Invoices Insoluti | `src/pages/Invoice/tabs/InvoicesInsoluti.tsx` |
| Quotations to Invoice | `src/pages/Invoice/components/QuotationsToInvoicePanel.tsx` |
| Quotations | `src/pages/Quotations.tsx` — già join ✓, solo ordinamento colonne |
| Quotation Budget Builder | `src/components/projects/QuotationBudgetBuilder.tsx` (se lista multi-progetto) |
| Supplier Orders | `src/pages/SupplierOrders.tsx` |
| Procurement Forecasting | `src/components/dashboard/ProcurementForecasting.tsx` (già ha client + name via cert, aggiungere city via `sites`) |

Pattern query standard (dove l'entità principale ha `certification_id`):
```ts
.select(`*, certifications ( client, name, sites ( city ) )`)
```
Dove la principale è già `certifications`:
```ts
.select(`*, sites ( city )`)
```

---

## 3. Ristrutturazione UI colonne

In ciascun componente elencato, le prime tre `<TableHead>`/colonne diventano nell'ordine:

1. **CLIENT** — `row.certifications?.client ?? '—'` — bold, text-foreground
2. **CITY** — `row.certifications?.sites?.city ?? '—'` — text-muted-foreground
3. **PROJECT** — `row.certifications?.name ?? '—'` — normale

Colonne successive: invariate (importi, stati, date, PM, ecc.), solo riordinate dopo le tre fisse. Nessuna rimozione di colonne esistenti — solo riordino + eventuale eliminazione di duplicati "Client/Project" che finivano più a destra.

Sticky-left applicato con classi tailwind (`sticky left-0 bg-background z-10`) sulle prime tre celle nelle tabelle con scroll orizzontale (Invoice tabs, SupplierOrders, ProcurementForecasting).

---

## 4. Fuori scope

- Nessuna modifica DB / schema / migration.
- Nessuna modifica ai flussi di scrittura (wizard, form di creazione).
- Nessuna modifica al calcolo di stato certificato (già gestito nel turno precedente).
- Nessun redesign visuale oltre riordino e sticky.

---

## 5. Ordine di esecuzione

1. Tipo `ProjectContextBase` + componente celle condivise.
2. Aggiornamento query hook-per-hook (parallelo dove indipendenti).
3. Riordino colonne UI file-per-file (parallelo).
4. Verifica tsgo + build.

Confermi e procedo con l'implementazione su tutti i 13 file?