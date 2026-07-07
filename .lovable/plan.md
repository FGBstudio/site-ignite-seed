# Plan — Stato "On Hold" gestito dall'admin

## Obiettivo

Un admin può sospendere/riprendere una certificazione con un click. Quando è on-hold:

- riga rossa in ogni tabella Operations e del PM a cui è assegnato il progetto,
- PM assegnato non può più editare né avanzare task/milestone/scorecard,
- allo sblocco lo stato torna esattamente a quello precedente.

Il valore `project_on_hold` esiste già come `task_alert_type` (usato in `AdminTasks`), ma **non** esiste come stato del progetto: oggi c'è solo un alert rosso, non un vero blocco. Questo piano introduce lo stato reale.

---

## 1. Modifiche DB (una sola migration)

Su `public.certifications`:

- `on_hold boolean NOT NULL DEFAULT false`
- `on_hold_previous_status text NULL` — memorizza `status` al momento del blocco per il ripristino
- `on_hold_reason text NULL` — motivazione admin (obbligatoria in UI)
- `on_hold_at timestamptz NULL`
- `on_hold_by uuid NULL` (admin che ha bloccato, ref `profiles.id`)

Non tocco l'enum `status` — evito di aggiungere un nono valore che si sovrapporrebbe alla macchina a stati esistente (`potential → quotation → quotation_approved → da_configurare → in_corso → completato → certificato`). `on_hold` è **ortogonale** allo stato: un progetto `in_corso` bloccato è ancora `in_corso`, semplicemente congelato.

### RPC atomiche (SECURITY DEFINER, solo admin via `is_admin(auth.uid())`)

- `admin_hold_certification(cert_id uuid, reason text)` — imposta `on_hold=true`, salva `status` corrente in `on_hold_previous_status`, popola reason/at/by. Inserisce anche una riga in `audit_logs` e un `task_alerts` di tipo `project_on_hold` (allineandosi al pattern esistente in memoria "Project On Hold — requires log note, generates alert, row turns red").
- `admin_release_certification(cert_id uuid)` — imposta `on_hold=false`, azzera reason/at/by, e (facoltativo) ripristina `status` se era stato modificato mentre on-hold. Chiude l'alert.

### RLS — blocco effettivo delle scritture PM

Aggiorno le policy di UPDATE/INSERT/DELETE sulle tabelle su cui il PM opera, aggiungendo la condizione **"la certification collegata non è on_hold"**:

- `certifications` (update): PM può UPDATE solo se `on_hold = false`
- `cert_tasks`, `project_tasks`, `cert_task_checklists`, `cert_payment_milestones`, `certification_milestones`, `certification_stakeholders`, `project_canvas_entries`, `project_allocations`, `quotation_budget_history`, `weekly_reports`

Le policy admin restano invariate: gli admin lavorano sempre. Le SELECT restano invariate: on-hold non nasconde nulla.

Helper riusabile:

```sql
create or replace function public.is_cert_on_hold(_cert_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((select on_hold from public.certifications where id = _cert_id), false)
$$;
```

---

## 2. Frontend

### Bottone "Hold / Release" — dove

- **Operations › Projects** (`src/pages/Projects.tsx`): un'icona pausa/play nell'ultima colonna azioni di ogni riga, visibile solo agli admin. Click → dialog con textarea motivazione (obbligatoria per hold) → conferma.
- **Project Detail** (`src/pages/ProjectDetail.tsx` / `ProjectOverview`): stesso pulsante in alto a destra dell'header progetto, insieme al badge di stato. Quando `on_hold=true` mostra un pill rosso "ON HOLD — &nbsp;" e cambia il testo del bottone in "Release".
- **CeoDashboard › Projects tab**: azione contestuale row-level analoga.

Tutte le chiamate passano per le RPC, non UPDATE diretti.

### Rendering visuale

- Riga rossa (`bg-destructive/10 text-destructive-foreground` o utility esistente per "critical") in tutte le tabelle multi-progetto: `Projects`, `CeoDashboard.TabProgetti`, `Inventory`, `Monitor`, `HoursAnalytics`, `ProjectsReports` (sezione Critical). Il tab di appartenenza NON cambia: un `in_corso` on-hold resta sotto "In Progress" ma rosso, così l'admin lo vede in contesto.
- Sui componenti PM (`PMPortal`, `PMProjectsBoard`, WBS/Gantt, `ProjectPayments`, `ProjectCanvas`): banner rosso sticky "This project is On Hold — contact an admin". Tutti i controlli di edit vanno in `disabled`. Il fetch dello stato on-hold arriva già dai hook esistenti (`useProjectDetails`, `useCeoDashboardData`, `usePMDashboard`) — estendo i select.

### Where PM edits vengono disabilitati (client-side, backup a RLS)

Aggiungo un hook `useIsProjectOnHold(certId)` che restituisce `boolean`. Ogni componente PM di scrittura (WBS drag, task status change, checklist tick, milestone edit, payment mark-paid, scorecard update, stakeholder add) usa lo stesso flag per disabilitare bottoni e mostrare tooltip "Project on hold".

### Alert dedicato

Riuso il tipo `project_on_hold` già presente in `task_alerts` e in `AdminTasks.tsx`: la RPC di hold ne crea uno assegnato all'admin, quella di release lo chiude. Nessuna nuova entità.

---

## 3. Cosa NON cambia

- Nessuna nuova voce nell'enum `status`.
- Nessuna modifica ai tab di Quotations/Operations: la classificazione per `setup_status` resta identica.
- Nessuna modifica al flusso di certificazione.
- Nessuna migrazione dati: default `on_hold=false` copre tutte le righe esistenti.

---

## 4. Ordine di esecuzione

1. **Migration**: colonne, helper `is_cert_on_hold`, RPC `admin_hold_certification` / `admin_release_certification`, aggiornamento RLS PM su tabelle sopra.
2. Frontend: hook `useHoldCertification`, dialog `HoldProjectDialog`, hook `useIsProjectOnHold`, bottone in `Projects`, `ProjectDetail`, `CeoDashboard`.
3. Applicazione riga rossa + banner sticky nei punti elencati.
4. Applicazione `disabled` sui controlli PM di scrittura.
5. Verifica in Playwright: hold da admin → PM apre stesso progetto → tutti i bottoni di edit disabled → banner rosso → admin release → tutto torna operativo.

---

## Domanda per te (prima di procedere)

1. La **reason** dell'hold deve essere obbligatoria o facoltativa?
2. Quando l'admin sblocca, se nel frattempo il progetto ha avanzato milestone/tasks (via admin), lascio lo stato attuale o forzo il ripristino a `on_hold_previous_status`? Suggerimento: lascio lo stato attuale — `on_hold_previous_status` serve solo se l'hold ha alterato lo `status` (nel mio design non lo altera), quindi in pratica non serve mai ripristinarlo. Lo tengo come safety net.
3. Vuoi che l'hold generi anche una **notifica email al PM** (via `send-transactional-email` esistente) oltre all'alert in-app?