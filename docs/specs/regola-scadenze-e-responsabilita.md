# Regola delle scadenze contrattuali e della responsabilità

**Stato:** frammento pronto da innestare nella specifica in redazione. Non implementato.
**Dipende da:** il modello delle finestre (`natura_durata ∈ istante | lavoro | attesa`) discusso prima di questo documento.
**Verificato sul database il 2026-09-16.** Ogni numero citato qui viene da una query, non da una stima.

---

## R.0 Il problema in una frase

Una finestra di lavoro ha due estremi, e **quando la scadenza salta bisogna sapere quale dei due si è mosso**, perché da questo dipende chi ne risponde. Se non si distingue, il primo PM a cui il GC consegna i documenti con tre settimane di ritardo riceve un allarme di violazione per una cosa che non ha fatto — e da quel momento gli allarmi non li guarda più nessuno. La regola esiste per proteggere il segnale, non per assegnare colpe.

---

## R.1 Cosa c'è già (da non rifare)

| Pezzo | Stato | Dove |
|---|---|---|
| Tipo di allarme `milestone_deadline` | **esiste** | `task_alerts.alert_type` |
| Escalation e recapito agli admin | **esiste e funziona** | `trg_task_alerts_notify_admins_insert/update` → `notify_admins_on_escalation` → edge function `dispatch-admin-escalation` → email |
| Scheda automatica dall'allarme | **esiste** | `trg_canvas_from_alert` → `auto_canvas_from_alert` |
| Registrazione dello spostamento handover + allarme `extra_canone` | **esiste, ma su un caso solo** | `fn_detect_construction_end_shift` su `certification_milestones` |
| Vista in sola lettura delle milestone scadute | **esiste** | `useLateCertMilestones` → ProjectsReports, PortfolioFollowUp |
| **Generatore automatico di `milestone_deadline`** | **NON esiste** | — |

`milestone_deadline` ha **una riga sola** in tutto il database, dell'8 maggio 2026, con `created_by` valorizzato: creata a mano da una persona. Dei 16 job `cron` attivi **nessuno tocca `certification_milestones`**: sono tutti sensori (`evaluate_sustained_alerts`, `detect_offline_sensors`, `detect_flatlines`), code email, cambi valuta, telemetria.

**Conclusione:** la categoria e il tubo ci sono. Manca il rubinetto.

Nota su `fn_detect_construction_end_shift`: riconosce il passo **per nome** (`requirement IN ('construction end (handover)', 'construction end', 'handover')`). Su una scaletta che chiama quel passo diversamente non scatta. Quando si tocca, va riportata a puntare per identità (`ancora = 'handover'`), che è il dato che il motore usa già ovunque.

---

## R.2 Le due date di una finestra, e quale comanda

Per un passo con `natura_durata = lavoro`:

```
apertura  = data del passo di ancoraggio          (anchor_order)
scadenza  = apertura + offset_days                (= due_date, già calcolata oggi)
chiusura  = completed_date                         (scritta dal trigger a 100%)
```

**`scadenza` è contrattuale.** Non si modifica a mano: si muove **solo** perché si è mossa `apertura`. Questo è già il comportamento di `fn_refresh_timeline_dates` e non va cambiato — va soltanto reso visibile e responsabilizzato.

---

## R.3 La regola (R.3.1 → R.3.4)

### R.3.1 Violazione nostra — `milestone_deadline`

**Condizione:** `scadenza` è passata **e** `apertura` non si è mai mossa dopo la materializzazione della timeline.

La finestra è stata aperta puntuale e disponibile per tutti i giorni previsti. Se non è stata chiusa, la responsabilità è interna.

Due momenti distinti in cui scatta, e servono entrambi:

| # | Evento | Meccanismo | Perché serve |
|---|---|---|---|
| **a** | La scadenza passa e il passo non è al 100% | **Job giornaliero** | Nessuno agisce, quindi nessun trigger può accorgersene: è l'unico pezzo di infrastruttura nuova |
| **b** | Il PM porta il passo a 100% **dopo** la scadenza | **Trigger** su `certification_milestones` | `trg_milestone_avanzamento` scrive già `completed_date`: basta confrontarla con `due_date` nello stesso punto |

`escalate_to_admin = true`. Un solo allarme per passo: (b) non ne crea un secondo se (a) l'ha già aperto, lo **chiude** registrando i giorni effettivi di ritardo.

### R.3.2 Ritardo di terzi — `extra_canone`

**Condizione:** `apertura` si è spostata in avanti perché si è spostato il passo di ancoraggio.

La finestra slitta con la sua ancora e **conserva la propria durata**: se erano 30 giorni restano 30 giorni. Nessuna violazione nostra — ma un fatto contrattuale che qualcuno deve vedere, perché sposta la consegna finale al cliente.

`escalate_to_admin = true`, **tipo diverso**: è una rinegoziazione, non un richiamo. È lo stesso trattamento che `fn_detect_construction_end_shift` riserva già allo slittamento dell'handover, esteso a tutte le finestre invece che a un passo solo.

### R.3.3 Attesa — nessun allarme al PM

Per `natura_durata = attesa` (revisione dell'ente certificatore, esiti di laboratorio) **non si genera mai una violazione**: non è tempo nostro. Se la finestra sfora si segnala come **informazione** sul progetto, senza destinatario responsabile e senza escalation.

Motivazione, con i numeri: in WELL Core *Project Submission* è `+60` dal passo 14 e *Certification Attainment* è `+180`. I 120 giorni fra le due sono IWBI che revisiona. Mandare a un PM un allarme di violazione per la coda di IWBI è il modo più rapido per insegnargli a ignorare gli allarmi.

### R.3.4 Caso misto — vince l'ultima apertura

Se `apertura` si è mossa **e** la nuova scadenza è comunque passata, valgono **entrambe** ma in ordine: prima `extra_canone` al momento dello slittamento (R.3.2), poi, se la nuova finestra scade a vuoto, `milestone_deadline` (R.3.1). Il conteggio del ritardo riparte dalla **nuova** apertura, mai dalla vecchia.

---

## R.4 Cosa deve dire l'allarme

Un allarme che dice «milestone scaduta» non fa agire nessuno. Servono quattro cose, tutte già disponibili senza dati nuovi:

1. **quale finestra** — passo, certificazione, sito;
2. **quanti giorni aveva** — `offset_days`, cioè il termine pattuito;
3. **da quando era aperta** — la data dell'ancora, e **il nome del passo di ancoraggio** (è la risposta a «perché dovevo saperlo?»);
4. **di quanto ha sforato** — `completed_date − due_date`, oppure `oggi − due_date` se ancora aperta.

Per `extra_canone` si aggiunge il quinto: **di quanto è slittata l'ancora e chi l'ha mossa** (`auth.uid()`, già disponibile nel trigger).

---

## R.5 Confini espliciti

- **Il PM non può spostare `due_date` di un passo `lavoro`.** È contrattuale e si ricalcola. Se lo ritiene sbagliato, sposta l'ancora — e allora scatta R.3.2, che è un fatto registrato e non una modifica silenziosa. Questo chiude la scorciatoia più ovvia per far sparire un allarme.
- **Nessun allarme retroattivo al primo avvio.** Il job di R.3.1a deve partire dalla data della sua prima esecuzione. Sui dati attuali ci sono milestone scadute da mesi: generarle tutte insieme significa mandare qualche centinaio di mail e bruciare il canale il giorno uno.
- **`optional` e `not_applicable` non generano mai allarmi.** Sono 50 passi su 238: un passo che si può saltare non ha una scadenza contrattuale.
- **Finestra negativa = errore, non violazione.** Se l'ancora finisce dopo il passo, la finestra è malformata: si segnala come dato da correggere, non come ritardo. Serve un guardrail al momento in cui si cambia ancoraggio.

---

## R.6 Dove tocca

| Sezione | Impatto |
|---|---|
| `certification_milestones` | nessuna colonna nuova per questa regola: `due_date`, `completed_date`, `anchor_order`, `offset_days` bastano |
| Trigger avanzamento | `trg_milestone_avanzamento` confronta anche `completed_date` con `due_date` (R.3.1b) |
| Nuovo job giornaliero | l'unico pezzo di infrastruttura nuova (R.3.1a) |
| `fn_detect_construction_end_shift` | generalizzata a tutte le finestre e riportata a puntare per identità |
| `AncoratoA` / `SelettoreAncora` | cambiare ancora a un passo `lavoro` sposta l'apertura della finestra: la frase di conseguenza deve dirlo, e il guardrail di R.5 va qui |
| `TabellaPassi` | la finestra si legge come intervallo, e lo sforamento si vede sulla riga |
| `AnelloAvanzamento` | per `lavoro` la tacca dell'atteso si calcola sulla finestra vera; per `attesa` nessun comando |
| Rollup avanzamento | escludere le `attesa`, pesare le `lavoro` sui giorni |
| **Non toccati** | wizard di import, `SezioneProjectTimeline`, creazione progetto, `fn_refresh_timeline_dates` |

---

## R.7 Le due domande aperte

Non le decido io.

1. **Destinatario di `milestone_deadline`.** Solo admin, o anche il PM stesso? (R.3.1 dice `escalate_to_admin = true` e non si pronuncia sul PM.)
2. **Soglia di preavviso.** Oggi l'allarme scatta a scadenza superata. Serve anche un avviso *prima* — «restano 5 giorni» — e con che anticipo?
