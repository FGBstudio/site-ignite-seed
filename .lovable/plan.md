# Piano: stato "potential", Canceled con note+resume, generatore Invoice in Payments

## 1. Nuovo stato `potential` (Quotations)

### DB

Nessuna nuova colonna: `certifications.status` è un `text` libero. Basta accettare il valore `potential` nell'app.

### Wizard "New Quotation" (`src/components/projects/NewQuotationWizard.tsx`)

- Aggiungere un flag `isPotential: boolean` in `ServicesState` con un toggle Switch/Checkbox in cima allo Step 1 ("Save as *Potential* (Site & Project only, complete the quote later)").
- Se `isPotential = true`:
  - Lo Step 2 (Services & Quote) e lo Step 3 (Review) diventano opzionali: la barra mostra un pulsante "Save as Potential" già in Step 1 dopo aver validato solo i campi Site & Project.
  - Non è richiesta almeno una certification, né fees, né payment scheme, né quotation_sent_date.
  - Nell'`insert` su `certifications`:
    - `status = 'potential'`
    - Viene creata **una sola** riga con il solo `project_subtype/cert_type = null` (oppure con la prima cert selezionata se l'utente ne ha scelta una).
    - Nessuna insert su `quotation_budget_history`.

### Sezione Quotations (`src/pages/Quotations.tsx`)

- Aggiungere un quarto tab **Potential** come primo, con `status === 'potential'`.
- Ordine tab: Potential · Pending · Approved · Canceled.
- Sulle righe Potential mostrare i due pulsanti:
  - **"Go on with Services & Quote"** → apre lo stesso wizard in modalità "resume" precompilato con Site & Project, forzando lo Step 2. Al salvataggio esegue un `UPDATE certifications SET status='quotation', … WHERE id=<id>`.
  - **Cancel** (come esistente).

### Filtri Operations e Planner

- `src/hooks/useAdminPlannerData.ts` e `useAdminCalendarData.ts`: aggiungere `potential` all'early-exit accanto a `quotation/quotation_approved/canceled` (setup_status = "potential", non entra in Operations).
- `src/pages/Projects.tsx` (baseFiltered): escludere anche `setup_status === "potential"` dal tab All di Operations.

## 2. Ripristino sezione Canceled con note + pulsante Resume

### `src/pages/Quotations.tsx` — tab Canceled

- Ripristinare la card di dettaglio precedente:
  - Mostra `quotation_notes` come area di testo editabile ("Reason / notes for cancellation").
  - Il salvataggio fa `UPDATE certifications SET quotation_notes=… WHERE id=<id>`.
  - Storico visibile: `quotation_sent_date`, `total_fees`, importi originali.
- Aggiungere pulsante **Resume** che apre un `AlertDialog` con due opzioni:
  - **Restore to Pending** → `status = 'quotation'`
  - **Restore as Approved** → `status = 'quotation_approved'`, `quotation_approved_at = now()`, `quotation_approved_by = auth.uid()`
- Invalida `quotations-list` e `admin-planner-all-certifications`.

## 3. Payments — Generatore Invoice da tranche

Contesto: `cert_payment_milestones` contiene già `payment_scheme`, `tranche_pct`, `tranche_order`, `trigger_event`, `name`, `amount`, `status`, `invoice_sent_date`, `payment_received_date`. Le tranche vengono create dal wizard alla firma. Al momento non esistono ancora quando la quotation è `quotation_approved` senza tranche già generate.

### Nuova UI in Payments (`src/pages/Invoice/InvoicePage.tsx` + nuova tab / pannello)

- Aggiungere un pannello **Quotations Approved** che elenca le certifications con `status = 'quotation_approved', 'da_configurare', 'in_corso', 'completato', 'certificato'` **senza** tranche in `cert_payment_milestones`.
  - Ogni riga ha pulsante **"Invoice"**: legge lo scheme salvato sulla cert (o presenta i 3 preset di `PAYMENT_SCHEMES`) e chiama `generateTranches()` per creare le righe in `cert_payment_milestones`.
- Dopo la generazione, la cert compare in un secondo pannello **Active tranches**:
  - Una colonna per tranche (Tranche 1/N, importo, trigger, status).
  - Pulsante **"Create Invoice"** per ogni tranche non ancora emessa: aggiorna `cert_payment_milestones.invoice_sent_date = today`, `status = 'Invoiced'`, e apre l'`InvoiceModal` esistente precompilato con importo/cliente/certification.

### Nessuna modifica DB

Le colonne esistono già; nessuna migration necessaria.

## File toccati

- `src/components/projects/NewQuotationWizard.tsx` — flag Potential, salvataggio ridotto, modalità resume via prop opzionale `resumeCertificationId`.
- `src/pages/Quotations.tsx` — nuovo tab Potential, dettaglio Canceled con note, pulsante Resume, integrazione resume del wizard.
- `src/hooks/useAdminPlannerData.ts`, `src/hooks/useAdminCalendarData.ts` — early-exit anche per `potential`.
- `src/pages/Invoice/InvoicePage.tsx` — nuova tab "Quotations & Tranches" (nome da confermare).
- `src/pages/Invoice/components/QuotationsToInvoicePanel.tsx` (nuovo) — lista quotazioni approvate + genera tranche + crea invoice.

## Fuori scope

- Nessuna modifica ai ruoli/RLS.
- Nessuna nuova colonna DB.
- La logica di stato Operations resta identica per gli status esistenti.