## Problema

Le richieste di monitoring del PM non generano alert sul Monitor Hub perché il trigger DB `create_monitoring_alert_on_allocation` fallisce silenziosamente.

**Root cause**: la function fa
```sql
SELECT ... FROM public.profiles pr WHERE pr.user_id = v_cert.pm_id
```
ma la tabella `public.profiles` non ha la colonna `user_id` (la chiave è `id`). L'errore viene intercettato dal blocco `EXCEPTION WHEN OTHERS` e la function ritorna `NEW` senza inserire nulla in `task_alerts`. Risultato: zero alert per nessuna allocazione (verificato: `task_alerts` con `alert_type LIKE 'monitoring%'` è vuota, mentre esistono già 3 allocazioni `pm_request` recenti, inclusa quella di "La Tana di FGB").

## Fix

### 1. Migration — correggere il trigger
- Sostituire `pr.user_id = v_cert.pm_id` con `pr.id = v_cert.pm_id` nella function `create_monitoring_alert_on_allocation`.
- Lasciare invariata tutta la restante logica (mapping `is_generic_placeholder`/categoria → `alert_type`, route, `escalate_to_admin = true`).

### 2. Backfill — generare gli alert mancanti
Inserire in `task_alerts` un record per ogni allocazione esistente con `source = 'pm_request'` e `is_resolved = false` priva di alert collegato, con la stessa logica del trigger:
- `SYS-ENERGY` / `is_generic_placeholder = true` → `monitoring_energy_requested` (route `/projects/{id}/hardware/energy`)
- categoria AIR/IAQ → `monitoring_iaq_requested` (route `/monitor/assign/{id}`)
- categoria Water → `monitoring_water_requested` (route `/monitor/assign/{id}`)

Tutti con `escalate_to_admin = true`, `created_by = certifications.pm_id`.

### 3. Verifica
Dopo la migration:
- Query di controllo su `task_alerts` per confermare che i 3 alert pendenti compaiano.
- Conferma visiva sul `MonitoringAlertsWidget` in `/monitor` (badge count > 0, riga "La Tana di FGB" → Energy Monitoring Requested).

Nessuna modifica frontend necessaria: `MonitoringAlertsWidget`, `useTaskAlerts` e `useAdminEscalationNotifications` sono già cablati correttamente — leggevano una tabella vuota perché il trigger non scriveva.

## Dettagli tecnici

File:
- nuova migration in `supabase/migrations/` con `CREATE OR REPLACE FUNCTION public.create_monitoring_alert_on_allocation` corretta + `INSERT INTO public.task_alerts ... SELECT ... FROM public.project_allocations pa LEFT JOIN public.task_alerts ta ON ta.certification_id = pa.certification_id AND ta.alert_type = ... WHERE pa.source = 'pm_request' AND ta.id IS NULL` per il backfill.
