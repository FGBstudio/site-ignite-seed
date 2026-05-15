# Budget Orario in fase di Conferma Quotazione → PM

## Obiettivo
Quando l'Admin conferma una quotazione e la assegna a un PM, deve essere definito il **Budget Orario** (`certifications.allocated_hours`) della certificazione, che alimenta automaticamente la sezione **Project Burn Rate / HoursAnalytics**, senza dover entrare in HoursAnalytics in un secondo momento.

Due modalità, in linea con la quotazione:
1. **Diretta** — l'Admin digita le ore.
2. **Da FTE Builder** — se in fase di quotazione era stato usato il Budget Builder, il valore viene **pre-calcolato** come `effort_days × 8` e mostrato già compilato (sempre modificabile).

## Flusso utente

1. Admin clicca **Confirmed** su una riga in stato *Quotation* (pagina Projects).
2. Si apre il `ProjectFormModal` in modalità `confirm_project` con i campi attuali (PM, PO Sign Date, coordinate sito).
3. Si aggiunge una nuova sezione **"Hourly Budget"** con:
   - Campo numerico `allocated_hours` (h).
   - Se esiste uno snapshot Builder per la cert (`quotation_budget_history`), badge "Suggerito da FTE Builder: N h" + bottone **Use suggested**.
   - Pre-fill automatico: se `certifications.allocated_hours` già valorizzato (perché salvato dal wizard quando si è usato il builder), usa quello; altrimenti usa il suggerimento se disponibile; altrimenti vuoto.
4. Al salvataggio, oltre a `pm_id`, `status='in_progress'`, `po_sign_date`, l'update su `certifications` include `allocated_hours`.

## Verifica del wizard esistente
Il wizard `NewQuotationWizard` salva già `allocated_hours = round(effort_days × 8, 2)` quando la cert usa il Builder applicato. Nessuna modifica al wizard.

## Sezione tecnica

**File modificati**
- `src/components/projects/ProjectFormModal.tsx`
  - Estendere lo Zod `formSchema` con `allocated_hours: z.number().nonnegative().optional()`.
  - In `confirm_project` mode, dopo il caricamento del project, fetch dell'ultima riga di `quotation_budget_history` per `certification_id = project.id` (order by created_at desc, limit 1) per ricavare `total_effort_days`. Calcolare `suggested = total_effort_days × 8`.
  - Pre-fill di `allocated_hours` con: `project.allocated_hours ?? suggested ?? undefined`.
  - Nuovo blocco UI "Hourly Budget" sotto PM / PO Sign Date con input number + (se suggested) chip "Suggested: Xh — Use".
  - In `onSubmit` confirm branch: aggiungere `allocated_hours: data.allocated_hours ?? null` all'`updatePayload`.

**Nessuna migrazione DB**: la colonna `certifications.allocated_hours` esiste già ed è quella consumata dalle view `view_cert_hours_burn` / `view_milestone_hours_burn` usate da `HoursAnalytics` e `ProjectBurnRate`.

**Nessun impatto su PMConfirmationDialog** (flusso PM-side separato).

## Out of scope
- Modifiche alla UI di `HoursAnalytics` / `ProjectBurnRate` (continueranno a leggere `allocated_hours` come oggi, ma troveranno il valore già popolato).
- Per-milestone allocation (resta come oggi, editabile in HoursAnalytics).
