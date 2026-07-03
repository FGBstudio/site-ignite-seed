## Diagnosi

Il problema non è nel click del bottone: l'update arriva al database, ma PostgreSQL lo blocca.

La tabella `certifications` ha un check constraint chiamato `certifications_status_check` che oggi consente solo questi status:

```text
quotation, da_configurare, in_corso, completato, certificato, canceled, active
```

Il frontend invece, quando clicchi **Mark as Approved**, prova a salvare:

```text
status = quotation_approved
```

Poiché `quotation_approved` non è nella lista ammessa dal vincolo DB, Supabase restituisce:

```text
new row for relation "certifications" violates check constraint "certifications_status_check"
```

Ho trovato anche un secondo problema collegato: lo status `potential`, introdotto per le quotazioni potenziali, non è ammesso dallo stesso vincolo. Quindi anche quel flusso può fallire o diventare instabile.

## Piano di correzione

1. **Correggere il vincolo DB su `certifications.status**`
  - Aggiornare `certifications_status_check` per includere tutti gli status realmente usati dall'app:

```text
potential
quotation
quotation_approved
canceled
da_configurare
in_corso
completato
certificato
active
in_progress
```

- Mantengo anche `active` e `in_progress` per compatibilità con dati/flussi legacy e con il default attuale della colonna.

2. **Rendere coerenti i flussi di approvazione già presenti**
  - Il bottone **Mark as Approved** continuerà a scrivere `quotation_approved`.
  - Il bottone **Resume → Move to Approved** nei canceled funzionerà con lo stesso status.
  - I progetti `potential` resteranno esclusi da Operations fino a quando non vengono completati/trasformati in quotazione.
3. **Verificare il risultato dopo la migration**
  - Controllare che il constraint aggiornato contenga `quotation_approved` e `potential`.
  - Verificare che l'approvazione di una quotation non venga più bloccata dal database.

## Cosa succederà quando una quotazione sarà approvata

Quando clicchi **Mark as Approved** su una riga Pending:

1. La riga in `certifications` passerà da:

```text
status = quotation
```

a:

```text
status = quotation_approved
```

2. Verranno valorizzati:

```text
quotation_approved_at = data/ora approvazione
quotation_approved_by = utente che approva
```

3. Nel frontend:
  - sparirà da **Quotations → Pending**;
  - comparirà in **Quotations → Approved**;
  - comparirà in **Operations → Quotations Approved**;
  - non entrerà ancora in **To Configure / In Progress / Completed / Certified** finché non verrà avviata la configurazione operativa/PM.
  - comparirà in **Payments → Quotations & Tranches**;
4. Da lì il progetto rimane una quotazione approvata pronta per essere presa in carico dalle Operations.