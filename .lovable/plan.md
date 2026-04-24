
Obiettivo: ripristinare davvero le email di escalation admin end-to-end.

Diagnosi trovata:
1. Il DNS del sottodominio `notify.fgb-studio.com` ora sembra corretto lato registrar, ma il progetto lo vede ancora come `Pending`, quindi il dominio email non è ancora attivo.
2. Anche ignorando il DNS, l’infrastruttura delle app emails non è stata completata nel database: mancano `email_send_log`, `email_send_state`, `suppressed_emails`, `email_unsubscribe_tokens`, le RPC tipo `enqueue_email` e il cron `process-email-queue`.
3. Il codice di `send-transactional-email` dipende proprio da questi oggetti, quindi oggi fallirebbe comunque.
4. Non risultano invocazioni/log recenti di `dispatch-admin-escalation` o `send-transactional-email`, quindi serve anche riallineare deploy e test del flusso.

Piano di risoluzione:
1. Verificare e riallineare il dominio email in Cloud
   - Forzare il check del dominio email e confermare che passi da `Pending` ad `Active`.
   - Se resta bloccato, rieseguire la verifica dal pannello email senza cambiare DNS, perché dai record caricati il setup sembra corretto.

2. Completare l’infrastruttura email mancante
   - Eseguire il setup ufficiale dell’infrastruttura email del progetto.
   - Creare automaticamente queue, tabelle, funzioni RPC e cron job necessari.
   - Non usare migrazioni SQL manuali per questa parte, perché il flusso richiede provisioning runtime.

3. Riallineare le funzioni Edge già presenti
   - Verificare che `send-transactional-email` punti al dominio mittente corretto (`notify.fgb-studio.com`).
   - Verificare che `dispatch-admin-escalation` usi il percorso atteso e sia deployata.
   - Ridistribuire le funzioni email coinvolte per assicurarsi che il codice effettivamente attivo sia quello corretto.

4. Validare i destinatari admin
   - Controllare che gli admin abbiano ruolo valido in `user_roles`.
   - Controllare che nei `profiles` esistano email valorizzate e che `notify_escalations_email` non sia disattivato.

5. Testare il flusso completo
   - Generare un’escalation di prova.
   - Verificare:
     - trigger su `task_alerts`
     - chiamata a `dispatch-admin-escalation`
     - enqueue tramite `send-transactional-email`
     - consumo coda via `process-email-queue`
     - creazione log in `email_send_log`
     - ricezione dell’email finale

6. Rifinire eventuali ultimi punti
   - Se il trigger SQL risulta troppo fragile, sostituire l’URL hardcoded con una configurazione più sicura/manutenibile.
   - Aggiungere logging migliore solo se serve per evitare future diagnosi “al buio”.

File/aree coinvolte:
- `supabase/functions/send-transactional-email/index.ts`
- `supabase/functions/dispatch-admin-escalation/index.ts`
- `supabase/functions/_shared/transactional-email-templates/escalation-alert.tsx`
- `supabase/config.toml`
- eventuale nuova migrazione solo se serve correggere logica applicativa, non per creare l’infrastruttura email di base

Dettagli tecnici:
- Il problema non è solo DNS.
- Il blocco reale è soprattutto l’assenza dell’infrastruttura email runtime richiesta dal sender asincrono.
- Oggi il progetto contiene il codice delle funzioni, ma nel database non esistono ancora gli oggetti su cui quel codice si appoggia.
- Finché non vengono creati queue/RPC/tabelle/cron, le email di escalation non potranno funzionare in modo affidabile.

Risultato atteso dopo l’intervento:
- ogni nuova escalation admin crea la notifica realtime
- parte la chiamata backend corretta
- l’email viene messa in coda e inviata
- il flusso è tracciabile nei log e stabile anche in caso di retry
