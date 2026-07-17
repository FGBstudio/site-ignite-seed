## Obiettivo

Aggiungere due nuove viste specchio in Operations:

- **Admin → Operations → tab "Capacity"** (nuovo, distinto dall'attuale "Resources" che resta come vista task-based). Dashboard di capacità con drill-down Tattico / Operativo / Strategico.
- **PM → My Projects → tab "PM Planner"** (accanto a Kanban Board e Global Planner). Workflow di pianificazione ore: contratto → milestone → schedulazione settimanale drag&drop.

L'attuale tab "Resources" in Admin resta (mostra saturazione da `cert_tasks`). Il nuovo tab "Capacity" è la vera dashboard capacità basata su ore allocate/consumate.

---

## 1. Schema DB (nuove tabelle + aggregazioni)

Sfruttiamo quanto già esiste:
- `certifications.allocated_hours` = budget contrattuale del progetto (già usato in `view_cert_hours_burn`).
- `cert_payment_milestones` / `certification_milestones` = milestone.
- `time_entries (user_id, certification_id, milestone_id, entry_date, hours)` = ore reali (già presente).
- `profiles` = PM.

Nuove tabelle:

**`milestone_hours_budget`** — allocazione ore per milestone (Fase 2 PM).
```
id, certification_id, milestone_id, allocated_hours numeric, notes,
created_at, updated_at, created_by
UNIQUE(certification_id, milestone_id)
```
RLS: admin full; PM può leggere/scrivere se `is_cert_pm(certification_id)`. GRANT come da regole.

Vincolo applicativo: `SUM(milestone_hours_budget.allocated_hours) ≤ certifications.allocated_hours` (validazione via trigger `BEFORE INSERT/UPDATE`).

**`pm_calendar_slots`** — schedulazione micro (Fase 3 PM, blocchi da 30 min).
```
id, user_id (PM), certification_id, milestone_id, slot_start timestamptz,
duration_minutes int check(duration_minutes % 30 = 0),
kind text check(kind in ('project','admin','pto','sick','training')),
note, created_at, updated_at
INDEX (user_id, slot_start), INDEX (certification_id, slot_start)
```
RLS: PM legge/scrive i propri slot; Admin legge tutto. GRANT authenticated/service_role.

**`change_requests`** — richieste variazione (hard-stop budget).
```
id, certification_id, milestone_id, requested_by (user), delta_hours numeric,
reason text, status text default 'pending' ('pending','approved','rejected'),
resolved_by, resolved_at, created_at
```
RLS: PM crea per proprie cert; Admin approva/rifiuta.

**`hr_calendar` (opzionale, se non presente)** — festività e ferie pre-caricate per il calcolo capacità mensile (Livello 3). Riuso `hr_availability` + `hr_requests` esistenti se sufficienti (da verificare in build).

**Aggregazioni pre-calcolate** (per non ricalcolare ore su ogni scroll):
- View materializzata `mv_user_weekly_capacity(user_id, week_start, planned_hours, logged_hours, contract_hours=40, saturation_pct)` — planned = SUM slots della settimana, logged = SUM `time_entries`.
- View materializzata `mv_user_monthly_capacity(user_id, month_start, planned_hours, logged_hours, workable_hours, saturation_pct)`.
- Refresh via `pg_cron` notturno + refresh on-demand su mutate degli slot (trigger che notifica un job leggero; in prima release refresh solo notturno + `REFRESH CONCURRENTLY` triggerabile da Admin).

Refactor esistenti:
- `view_cert_hours_burn` già ok.
- Aggiungere `view_milestone_hours_burn` (già esiste): confermare che punta a `milestone_hours_budget` invece che al vecchio `allocated_hours` su milestone (migration di ripiego se il campo non c'è già).

---

## 2. UI — Admin: tab "Capacity"

Nuovo file `src/pages/CeoDashboard.tsx` — aggiungere `<TabsTrigger value="capacity">Capacity</TabsTrigger>` prima di Resources. Componente `<CapacityDashboard />` in `src/components/dashboard/capacity/`.

Toggle a 3 livelli in alto (segmented control): **Tactical · Operational · Strategic**.

**Livello 1 — Tactical (giornaliera/settimanale)**
- Griglia PM × slot 30min (7 giorni). Rende `pm_calendar_slots`.
- Click su blocco → popover: progetto, milestone corrente, % budget consumato (join `view_cert_hours_burn`).
- Filtri: PM, cliente, città.

**Livello 2 — Operational (mensile/trimestrale)**
- Heatmap PM × settimana. Sorgente: `mv_user_weekly_capacity.saturation_pct`.
- Colori: rosso >100%, verde 80–100%, grigio <80% (semantic tokens da `index.css`, no hex hardcoded).
- Click cella → drill-down a Tactical filtrata su quella settimana.

**Livello 3 — Strategic (annuale)**
- Griglia PM × mese (12 colonne). Sorgente: `mv_user_monthly_capacity`.
- Cella mostra % su ore lavorabili (al netto ferie/festività da `hr_requests` + calendario festività).
- Click → drill-down a Operational sul mese scelto.

Filtri globali: team, holding, brand (riuso `ExcelFilterButton`).

---

## 3. UI — PM: tab "PM Planner"

In `src/components/projects/PMProjectsBoard.tsx` aggiungere terza `TabsTrigger` "PM Planner" accanto a Kanban/Global Planner. Nuovo componente `src/components/projects/pm/PMPlanner.tsx` a 3 step visibili in stack verticale (o tabs interni):

**Step 1 — Contract overview**
- Lista dei progetti assegnati con `allocated_hours` totali e barra consumo (da `view_cert_hours_burn`).

**Step 2 — Milestone mapping**
- Per il progetto selezionato: tabella milestone con input `allocated_hours` (scrive `milestone_hours_budget`).
- Somma live vs budget contratto; blocco save se supera.
- Riepilogo "conto alla rovescia" per milestone attiva.

**Step 3 — Weekly scheduler (drag & drop)**
- Calendario stile Teams: colonne giorni (Mon–Fri), righe slot 30min (08:00–19:00).
- Sidebar chip trascinabili: uno per progetto attivo, più chip fissi per Admin/PTO/Sick/Training.
- Drop → INSERT su `pm_calendar_slots` (0.5h) + decremento visuale budget milestone attiva.
- Se lo slot fa superare `milestone_hours_budget.allocated_hours` → dialog **Change Request** obbligatorio (INSERT `change_requests` con reason).
- Feature "Copy last week": duplica gli slot della settimana precedente dello stesso PM.

Librerie: `@dnd-kit/core` (già in stack shadcn-friendly, da aggiungere se assente).

---

## 4. Integrazione con Time Tracking esistente

- `MyTimesheet.tsx` continua a scrivere `time_entries` (consumo effettivo).
- Nel Planner il "planned" (slots) e il "logged" (time_entries) vivono su tabelle separate: la heatmap Operational mostra `planned` e la barra burn-rate mostra `logged` sopra `allocated`.
- Nessuna modifica alla logica `useCertHoursBurn` / `useResourceUtilization`.

---

## 5. File impattati

Nuovi:
- `supabase/migrations/*_capacity_planner.sql` (tabelle + views + RLS + GRANT + trigger validazione + cron refresh).
- `src/hooks/useMilestoneBudgets.ts`, `useCalendarSlots.ts`, `useChangeRequests.ts`, `useCapacityMatrix.ts`.
- `src/components/dashboard/capacity/CapacityDashboard.tsx` + `TacticalGrid.tsx` + `OperationalHeatmap.tsx` + `StrategicYearGrid.tsx`.
- `src/components/projects/pm/PMPlanner.tsx` + `MilestoneBudgetTable.tsx` + `WeeklyScheduler.tsx` + `ChangeRequestDialog.tsx`.

Modificati:
- `src/pages/CeoDashboard.tsx` — nuova tab "Capacity".
- `src/components/projects/PMProjectsBoard.tsx` — nuovo tab "PM Planner".
- `package.json` — `@dnd-kit/core`.

---

## Note tecniche

- Tutte le mutation invalidano le query keys standard (`hours-burn`, nuovi `capacity-*`).
- Semantic tokens per i colori heatmap (aggiungere `--capacity-over`, `--capacity-ok`, `--capacity-free` in `index.css`).
- Slots sempre in UTC in DB; render locale con `date-fns` / `date-fns-tz`.
- Il refresh delle MV notturno è sufficiente per la Vista Strategica; l'Operational può cadere in una vista SQL semplice (non MV) per essere sempre fresca su settimane vicine — decidere in build in base a performance.

---

## Domanda aperta prima di implementare

Il volume iniziale (numero PM × settimane visualizzate) giustifica le materialized views + cron, oppure preferisci partire con viste SQL live e introdurre l'aggregazione notturna solo se compare un problema di performance? Le MV aggiungono complessità di refresh; le view live sono più semplici ma pagano ogni scroll.
