# Piano: switch alert email a dominio root + segreto dedicato

Refactoring chirurgico per disaccoppiare il sistema di alert (transactional/Resend) dal sistema Auth esistente, usando il dominio root `fgb-studio.com` e un API key Resend separato.

## Modifiche richieste

### 1. `supabase/functions/process-email-queue/index.ts`

Sostituire il riferimento all'environment variable Resend:

- **Prima**: `Deno.env.get('RESEND_API_KEY')`
- **Dopo**: `Deno.env.get('RESEND_ALERTS_API_KEY')`

Aggiornare anche il messaggio di errore "Email provider not configured" per riflettere il nuovo nome della variabile, e l'header `X-Connection-Api-Key` userà la nuova costante.

### 2. `supabase/functions/send-transactional-email/index.ts`

Aggiornare le costanti di dominio (riga ~10-18):

- **Prima**: `SENDER_DOMAIN = "notify.fgb-studio.com"`, `FROM_DOMAIN = "notify.fgb-studio.com"`
- **Dopo**: `SENDER_DOMAIN = "fgb-studio.com"`, `FROM_DOMAIN = "fgb-studio.com"`

Aggiornare il `from` header generato nell'enqueue payload da:

- **Prima**: `${SITE_NAME} <noreply@${FROM_DOMAIN}>` → `"site-ignite-seed <noreply@notify.fgb-studio.com>"`
- **Dopo**: `"FGB Studio Alerts <noreply@fgb-studio.com>"`

Modificherò anche la costante `SITE_NAME` a `"FGB Studio Alerts"` per coerenza nel branding del mittente.

## Deploy

Dopo le modifiche, deploy immediato di entrambe le Edge Function:

- `process-email-queue`
- `send-transactional-email`

## Cosa NON viene toccato

- Sistema Auth (`auth-email-hook`) e relativo `RESEND_API_KEY` esistente — restano invariati per non interferire
- Infrastruttura DB (queue, tabelle, cron)
- Template React Email
- Configurazione DNS / dominio Lovable Emails (`notify.fgb-studio.com` resta attivo per Auth) - questo è un errore non credo che [notify.fgb-studio.com](http://notify.fgb-studio.com) serva più a nulla, se è più usato può essere rimosso
- Logica di coda, retry, DLQ, suppression, unsubscribe

## Note tecniche

- Il segreto `RESEND_ALERTS_API_KEY` è già configurato (visibile nello screenshot Supabase Edge Function secrets)
- Il dominio root `fgb-studio.com` deve essere verificato lato Resend (responsabilità utente — DNS non viene toccato come richiesto)
- Le due Edge Function continueranno a usare `LOVABLE_API_KEY` come bearer per il connector gateway Resend