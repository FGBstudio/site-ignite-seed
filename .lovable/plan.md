# Home, RBAC & Quotations Flow

Per la nota dell'utente ("per ora solo admin con accesso a tutto, PM come adesso"), implemento UI + backend del nuovo flusso, **senza** ancora introdurre i sotto-ruoli `admin_quotations / admin_payments / admin_operations`. Predispongo però il codice in modo che aggiungerli dopo richieda solo nuove righe nell'enum dei ruoli e nei filtri.

---

## 1. Rinominazioni UI (rotte invariate)

**`src/lib/hubSections.ts`**
- Sezione `projects`: label dinamica. Aggiungo `getDisplayName(role)` o calcolo in Home/Sidebar:
  - `admin` → "Operations"
  - `pm` → "Projects"
- Sezione `invoice` → label statica "Payments" (route resta `/invoice`).
- Nuova sezione `quotations`:
  - `name: "Quotations"`, `route: "/quotations"`, `color: "#a0d5d6"`, `allowedRoles: ['admin']` (per ora).

**`src/pages/Home.tsx`** + **`src/components/home/PittoCard.tsx`**
- PittoCard accetta `displayName` opzionale, altrimenti usa `section.name`.
- In Home calcolo la label per `projects` in base a `role`.

**`src/components/layout/AppSidebar.tsx`** e **`src/components/layout/TopNavbar.tsx`**
- Stesso rename condizionale per "Projects/Operations" e statico per "Payments".
- Nuova voce "Quotations".

**`src/pages/Invoice/InvoicePage.tsx`**
- Titoli/breadcrumb interni: "Payments".

---

## 2. Nuova pagina `/quotations`

**`src/pages/Quotations.tsx`** (nuovo)
- Layout standard (TopNavbar + container).
- `Tabs` shadcn con due tab: **Pending** | **Approved**.
- Pulsante "+ New Quotation" che apre `NewQuotationWizard` (riusato as-is).
- Liste alimentate da `certifications` filtrate per nuovo campo `quotation_status`:
  - Pending: `quotation_status in ('draft','pending_approval')`
  - Approved: `quotation_status = 'approved'`
- Ogni riga Pending ha bottone **"Mark as Approved"** → chiama edge function `approve-quotation`.

**Route in `src/App.tsx`**: `/quotations` protetto per `admin`.

**Rimozione bottone in Operations**
- `src/pages/Projects.tsx`: rimuovo il pulsante "New Project/Site/Quotation" e relativo modale di apertura wizard (il componente `NewQuotationWizard` resta, ma viene aperto solo da `/quotations`).

---

## 3. Backend: stato quotazione + handover

**Migration** `add_quotation_workflow.sql`:
- `ALTER TABLE certifications ADD COLUMN quotation_status text NOT NULL DEFAULT 'draft'` con check `in ('draft','pending_approval','approved','rejected')`.
- `ALTER TABLE certifications ADD COLUMN quotation_approved_at timestamptz, quotation_approved_by uuid`.
- Backfill: certifications esistenti → `'approved'` (sono già operative).
- Index su `quotation_status`.

**Edge function `approve-quotation`** (nuova, `verify_jwt=false`, valida JWT internamente):
- Input: `{ certification_id }`.
- Verifica ruolo admin del caller.
- Update `quotation_status='approved'`, `quotation_approved_at=now()`, `quotation_approved_by=auth.uid()`.
- Inserisce 2 record in `task_alerts` (tabella già usata da `useTaskAlerts`/`AdminTasks`):
  1. **Operations handover**: `category='operations_handover'`, title "Assign project to a PM", payload con `certification_id`.
  2. **Payments handover**: `category='payments_handover'`, title "Set payment milestones / issue invoices", payload con `certification_id` e link.
- Nessuna mail.

**`src/hooks/useTaskAlerts.ts`**: aggiungo i nuovi `category` ai filtri esistenti (nessun breaking change).

---

## 4. Payments → Tasks & Alerts tab

**`src/pages/Invoice/InvoicePage.tsx`**
- Aggiungo nuova `TabBar` entry "Tasks & Alerts" che renderizza una versione filtrata della UI di `AdminTasks` limitata a `category='payments_handover'` (estraggo il componente lista in `src/components/tasks/TaskAlertsList.tsx` per riuso, senza toccare la logica esistente di `AdminTasks.tsx`).

---

## 5. RBAC

Per ora, in `ProtectedRoute` / `App.tsx`:
- `/quotations`: `admin` only.
- `/invoice`: invariato.
- `/projects`: invariato (admin vede tutto, PM vede i suoi via RLS — già attivo).
- Predispongo costanti `QUOTATIONS_ROLES`, `PAYMENTS_ROLES`, `OPERATIONS_ROLES` in `hubSections.ts` con valore `['admin']` per ora, così l'aggiunta dei sotto-ruoli sarà una singola modifica.

---

## File toccati

**Nuovi**
- `src/pages/Quotations.tsx`
- `src/components/tasks/TaskAlertsList.tsx` (estratto)
- `supabase/functions/approve-quotation/index.ts`
- migration `add_quotation_workflow.sql`

**Modificati**
- `src/lib/hubSections.ts`
- `src/pages/Home.tsx`, `src/components/home/PittoCard.tsx`
- `src/components/layout/AppSidebar.tsx`, `src/components/layout/TopNavbar.tsx`
- `src/pages/Invoice/InvoicePage.tsx` (rename + nuovo tab)
- `src/pages/Projects.tsx` (rimozione CTA "new")
- `src/App.tsx` (route `/quotations`)
- `src/hooks/useTaskAlerts.ts` (nuove categorie)

---

## Fuori scopo (rinviato)

- Sotto-ruoli `admin_quotations / admin_payments / admin_operations` e relative restrizioni inibitorie: lasciati solo predisposti come costanti.
- Rinomina effettiva della rotta `/invoice → /payments` (rinviata, evita breaking link).
