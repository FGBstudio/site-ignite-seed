## Goal

1. Replace the `/invoice` "Coming Soon" placeholder with a fully working **Invoice / Fatturazione** module that mirrors the structure, UX and calculations of the `Gestionale_v8.html` mockup. No DB integration yet — data is held client-side (per user: "vedremo in futuro come allineare il db").
2. Fix the **green_pittogramma.png** images that fail to render in production.

---

## 1) Image rendering fix (small but blocking)

**Cause** — `vite.config.ts` sets `base: '/site-ignite-seed/'` in production, but the pittogramma images are loaded with absolute paths (`src="/green_pittogramma.png"`). In production the browser requests `/green_pittogramma.png` instead of `/site-ignite-seed/green_pittogramma.png`, so the asset 404s.

**Fix** — replace every hard-coded `/...png` with a `BASE_URL`-aware path. Introduce a tiny helper:

```ts
// src/lib/assetUrl.ts
export const asset = (p: string) =>
  `${import.meta.env.BASE_URL.replace(/\/$/, "")}/${p.replace(/^\//, "")}`;
```

Apply to:
- `src/pages/Login.tsx` → `src={asset("green_pittogramma.png")}`
- `src/components/home/PittoCard.tsx` → idem
- `src/pages/ComingSoon.tsx` → `asset("green.png")`
- `src/components/layout/TopNavbar.tsx` (if/when it gains a logo image)

This is the only change needed — favicon and the `dev` mode `/` path stay correct because `BASE_URL` is `/` in dev.

---

## 2) Invoice / Fatturazione module

The mockup has 6 tabs under one section. We will build the same architecture, kept entirely inside `src/pages/Invoice/`, accessible from the Hub via the existing **INVOICE** card (currently routed to `/invoice` → `ComingSoon`).

### Structure

```text
src/pages/Invoice/
  InvoicePage.tsx            ← top-level: header, KPI strip, tab switcher
  tabs/
    InvoicesEmesse.tsx       ← main invoices table (27 cols, scroll-x)
    InvoicesDaEmettere.tsx   ← steps ready for invoicing
    InvoicesSolleciti.tsx    ← recall list
    InvoicesBloccati.tsx     ← blocked recalls (cards)
    InvoicesInsoluti.tsx     ← unpaid archive
    InvoicesNoteCredito.tsx  ← credit notes
  components/
    InvoiceTable.tsx         ← shared sticky-header table shell
    KpiStrip.tsx
    TabBar.tsx
    InvoiceModal.tsx         ← "Nuova fattura" / edit (same fields as mockup)
    DaEmettereModal.tsx
    SollecitoModal.tsx
    BloccatoModal.tsx
    InsolutoModal.tsx
    NoteCreditoModal.tsx
    IvaFab.tsx               ← floating "?" button + IVA cheat-sheet panel
  store/
    useInvoiceStore.ts       ← zustand store, persisted in localStorage
  types.ts                   ← Invoice, DaEmettere, Sollecito, Bloccato, Insoluto, NotaCredito
  utils.ts                   ← fEur, fD, calcDPO, exportCSV, sortBy
```

### Data layer (no DB yet)

A single `useInvoiceStore` (zustand + `persist` middleware → `localStorage` key `fgb-invoices-v1`) holds:

```ts
{ invoices: Invoice[]; daEmettere: DaEmettere[]; solleciti: Sollecito[];
  bloccati: Bloccato[]; insoluti: Insoluto[]; nc: NotaCredito[]; }
```

Each entity matches the mockup field-for-field (see `saveInv()` in the HTML for the canonical Invoice shape: `date, clientEntity, invoiceNumber, projectActivity, activity, currency, exchangeRate, totPaid, vat, paymentMethod, dueDate, notPaid, notPaidVat, dateOfPayment, paymentDay, state, refOrderPO, totCommessa, percFatturato, percProgressivo, entrateVere, emailRef, decurtBancarie, recall, statementOfAccount, entity, dpo`). DPO is auto-computed.

CSV export and inline editing keep the mockup behavior. Empty state on first load (no seed data).

### UI parity with the mockup

- **Header**: "Fatturazione" title, KPI strip (5 cards: Tot. Insoluto, Solleciti, Bloccati, Da emettere, Note credito) clickable to jump to the relevant tab.
- **Tab bar**: Fatture Emesse · Da Emettere · Solleciti · Recall Bloccati · Insoluti · Note di Credito, each with a colored count badge.
- **Main invoice table**: horizontal scroll, sticky header, sortable columns, per-currency formatting, overdue row tint, group-total + grand-total rows.
- **Modals**: same field grouping as the mockup (`f2/f3/f4` grids → tailwind `grid-cols-{2,3,4}`), cancel/save with toast.
- **IVA cheat-sheet FAB** (bottom-right), only visible on `/invoice`.
- All copy stays in **Italian** for this module (mockup is in Italian and matches FGB's accounting jargon).

### Styling

Reuse existing design tokens (Futura, teal `#009193`, ivory bg, 0.5px borders, `border-radius: 12/8px`). All components will use existing shadcn `Card`, `Button`, `Input`, `Select`, `Dialog`, `Badge`, `Table` primitives where possible to keep the look consistent with the rest of the app, while replicating the dense layout from the mockup.

### Routing changes (`src/App.tsx`)

```diff
- <Route path="/invoice" element={<ProtectedRoute allowedRoles={R("ADMIN")}><ComingSoon section={section("invoice")} /></ProtectedRoute>} />
+ <Route path="/invoice" element={<ProtectedRoute allowedRoles={R("ADMIN")}><InvoicePage /></ProtectedRoute>} />
```

`hubSections.ts` → flip `comingSoon: false` for the `invoice` entry so the Hub card no longer shows the "Coming soon" pill.

### Navigation

`src/lib/hubSections.ts` already declares `/invoice`; the Hub `PittoCard` will navigate there. The `TopNavbar` breadcrumb becomes `Home / Invoice`. No "Projects" sub-tabs are shown (Invoice lives outside the PROJECTS section).

---

## Out of scope

- DB schema, RLS, Supabase tables for invoices (will be addressed in a future iteration as the user requested).
- Import of legacy invoice data.
- Email/PDF generation for "Sollecito" (the modal records the message but does not send it).
- Other Hub sections (Office, HR, Monitor) remain "Coming Soon".

---

## Files touched (summary)

**Created**
- `src/lib/assetUrl.ts`
- `src/pages/Invoice/InvoicePage.tsx`
- `src/pages/Invoice/tabs/*.tsx` (6 files)
- `src/pages/Invoice/components/*.tsx` (modals, KpiStrip, TabBar, InvoiceTable, IvaFab)
- `src/pages/Invoice/store/useInvoiceStore.ts`
- `src/pages/Invoice/types.ts`
- `src/pages/Invoice/utils.ts`

**Edited**
- `src/App.tsx` (route swap)
- `src/lib/hubSections.ts` (invoice `comingSoon: false`)
- `src/pages/Login.tsx`, `src/pages/ComingSoon.tsx`, `src/components/home/PittoCard.tsx` (asset URL fix)
- `package.json` (+ `zustand` if not already present)

After approval I will implement the above end-to-end and verify the build.
