# Tre nuovi alert automatici

Estensione del sistema `task_alerts` con tre allarmi generati dal database (zero click manuali). Tutti gli alert sono di tipo Admin (`escalate_to_admin = true`) e finiscono nella pagina **Admin Tasks** e nelle notifiche realtime già esistenti (`useAdminEscalationNotifications`).

## 1. Erosione Budget Ore — `budget_warning_80` e `budget_overrun`

**Trigger**: dopo INSERT/UPDATE/DELETE su `time_entries`.

Per ogni `certification_id` toccato:
- calcola `consumed_hours = sum(time_entries.hours)` e `allocated_hours` da `certifications`;
- se `allocated_hours > 0`:
  - `pct >= 80%` e `pct < 100%` → crea (se non esiste già aperto) un alert `budget_warning_80`;
  - `pct >= 100%` → crea (se non esiste già aperto) un alert `budget_overrun`.

Idempotenza: prima di insert, controlla `WHERE certification_id = X AND alert_type = Y AND is_resolved = false`. Quando il pct rientra sotto soglia (es. allocated_hours aumentato), gli alert aperti vengono auto-risolti.

Titoli:
- 80%: "Budget ore all'80% — {project}" / desc: "Consumato {consumed}h su {allocated}h. Valutare se il completamento è vicino."
- 100%: "Budget ore superato — {project}" / desc: "Consumato {consumed}h su {allocated}h. Ogni ora aggiuntiva è perdita netta."

## 2. Estensione cronoprogramma non contrattualizzata — `extra_canone` (esistente)

**Baseline**: nuova colonna `certifications.baseline_handover_date date`. Viene popolata UNA VOLTA SOLA dal trigger `BEFORE UPDATE` quando `po_sign_date` passa da NULL a valorizzato (firma contratto) usando `coalesce(planned_handover_date, handover_date)`. Backfill iniziale: per certificazioni già con `po_sign_date` valorizzato, popola la baseline con il valore corrente di `planned_handover_date`/`handover_date`.

**Soglia**: parametro fisso in funzione SQL = **3 mesi** (modificabile via costante centrale `extra_canone_tolerance_months`).

**Trigger**: dopo UPDATE su `certifications` su cambio di `planned_handover_date` o `actual_handover_date`. Se `baseline_handover_date IS NOT NULL` e `coalesce(actual_handover_date, planned_handover_date) > baseline_handover_date + interval '3 months'` → crea alert `extra_canone` se non già aperto per quella cert.

Titolo: "Estensione cronoprogramma oltre tolleranza — {project}" / desc: "Slittamento di {N} giorni rispetto alla baseline ({baseline_date}). Valutare invio quotazione estensione mandato."

Non blocca lo slittamento, è solo notifica.

## 3. Saturazione anomala risorse — `resource_burnout_warning` (nuovo enum)

**Definizione**: una risorsa registra > 40h totali in `time_entries` per **due settimane ISO consecutive**, attribuite per la maggior parte (>50%) allo stesso `certification_id`.

**Trigger**: dopo INSERT/UPDATE su `time_entries`. Per `(user_id, certification_id)` toccato:
- prendi le ultime due settimane chiuse dalla view `view_user_weekly_saturation`;
- se in entrambe `total_hours > 40` e la stessa cert pesa per oltre il 50% delle ore della settimana → crea alert `resource_burnout_warning` (se non già aperto su quella combinazione user+cert nelle ultime 4 settimane).

Titolo: "Saturazione anomala — {user} su {project}" / desc: "Oltre 40h/settimana per 2 settimane consecutive. Possibile burnout o servizio sotto-quotato."

Target route: `/dashboard` (HoursAnalytics).

## Modifiche tecniche

### Database (migrazione unica)

1. `ALTER TYPE task_alert_type ADD VALUE 'budget_warning_80'; ADD VALUE 'budget_overrun'; ADD VALUE 'resource_burnout_warning';`
2. `ALTER TABLE certifications ADD COLUMN baseline_handover_date date;` + backfill descritto sopra.
3. Funzione `fn_check_budget_erosion(cert_id uuid)` + trigger `trg_time_entries_budget_alerts` su `time_entries`.
4. Funzione `fn_freeze_baseline_handover()` + trigger `BEFORE UPDATE` su `certifications`.
5. Funzione `fn_check_handover_drift(cert_id uuid)` + trigger `AFTER UPDATE OF planned_handover_date, actual_handover_date` su `certifications`.
6. Funzione `fn_check_resource_burnout(user_id uuid, cert_id uuid)` + trigger su `time_entries`.
7. Tutte SECURITY DEFINER, `search_path = public`, insert in `task_alerts` con `created_by` = PM della cert (`certifications.pm_id`) fallback a un service uuid riservato, `escalate_to_admin = true`, `target_route = '/admin-tasks'`.

### Frontend (minimo)

- `src/hooks/useTaskAlerts.ts`: estendere `TaskAlertType`, `ALERT_TYPE_LABELS`, `ALERT_TYPE_COLORS` con i tre nuovi tipi.
- `supabase/functions/dispatch-admin-escalation/index.ts`: aggiungere le tre label in `ALERT_TYPE_LABELS`.
- Nessuna nuova UI: gli alert appaiono automaticamente in **Admin Tasks**, calendario PM/Admin, badge realtime.

### Auto-risoluzione

I trigger, oltre a creare, **risolvono** alert quando la condizione rientra (es. `pct < 80%`, drift < 3 mesi, settimane più recenti sotto soglia) settando `is_resolved = true, resolved_at = now()`.

## Out of scope

- Configurabilità via UI delle soglie (80/100, 3 mesi, 40h). Restano costanti SQL modificabili in una sola riga.
- Email digest specifico per i nuovi tipi: viene riusato il template `escalation-alert` esistente.
- Storia dello slittamento (delta history). Si valuta in seguito se serve.
