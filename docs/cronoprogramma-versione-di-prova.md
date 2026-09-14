# Cronoprogramma e timeline di certificazione — versione di prova

Ramo `feat/cronoprogramma-v1`. Realizza il perimetro del §10 della
`specifica-cronoprogramma-v1.md`.

---

## Come avviarla

```bash
npm install
npm run dev          # http://localhost:8080
```

Il frontend gira in locale ma **legge e scrive sul database di produzione**: è
la scelta che hai preso quando hai detto che «locale» voleva dire il frontend.
Le tabelle nuove sono tutte additive e i dati di prova sono isolati sotto la
holding `ZZ TEST — Cronoprogramma`.

Per puntare a un altro database, senza toccare il codice:

```
# .env.local — git lo ignora
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

Senza queste variabili il comportamento è identico a prima: i valori di
produzione restano cablati come ripiego, e in sviluppo la console stampa a
quale database sei attaccato.

### I dati di prova

Già caricati. Per rifarli da zero o toglierli:

```
supabase/seed-test/cronoprogramma.sql          # ricrea (idempotente)
supabase/seed-test/cronoprogramma_pulizia.sql  # rimuove tutto
```

| Sito | Certificazioni | PM |
|---|---|---|
| **ZZ TEST — Palazzo Aurora** · Milano | LEED BD+C | tu (`m.martignoni`) |
| | WELL New Construction | `pmtest@fgb-studio.com` |
| | LEED GC Support | tu |
| **ZZ TEST — Torre Levante** · Milano | WELL Existing Building | `pmtest` |
| **ZZ TEST — Uffici Corso Re** · Torino | — solo un servizio Greeny appeso al sito | tu |

Il cronoprogramma di Palazzo Aurora **non è precompilato**: lo scenario (a) è
proprio trovarlo mancante. In fondo al file del seed c'è un blocco commentato
per riempirlo in un colpo solo se vuoi saltare agli scenari (d)–(f).

### Le due porte d'ingresso

- **Operations → icona gantt** su una riga, oppure `/#/projects/<id>/cronoprogramma`
  — il flusso PM.
- **Cantieri** nella barra in alto, oppure `/#/portafoglio` — il cruscotto
  direzionale.

---

## Gli otto scenari

### (a) Il PM non accede alla certificazione prima del cronoprogramma

Operations → cerca `ZZ TEST` → apri **Palazzo Aurora — LEED BD+C** con l'icona
gantt.

La scheda 2 è smorzata e dice perché: *«Questa certificazione si innesta su un
cantiere. Compila prima il cronoprogramma del sito.»*

Il gate **non è nell'interfaccia, è nel motore**: `fn_materialize_timeline`
restituisce zero. Un blocco solo grafico sarebbe stato aggirato un istante dopo
dal trigger che materializza la timeline all'inserimento della certificazione.

Torre Levante, per contrasto, ha già le sue 11 milestone: l'edificio esistente
non ha bisogno di un cantiere e il gate non lo riguarda.

### (b) La LEED si genera e i calcolati pendono dall'handover

Nella scheda 1 premi **Crea il cronoprogramma del sito**. Nasce con le otto
ancore in riga e l'handover contrattuale già dentro (15 mar 2027, dalla
quotazione), e **aggancia da sé le tre certificazioni del sito**.

Compila `Construction start` = 2 feb 2026, fonte `Gantt GC`. Salva.

Nella scheda 2 premi **Genera la timeline dalla scaletta**. Tredici passi.
Guarda le nature:

- `Construction Start` e `Construction End (Handover)` sono **ereditate**, in
  sola lettura, con scritto *dal cronoprogramma*;
- gli ultimi quattro sono **calcolati**: `+30`, `+60`, `+90`, `+180` giorni
  dall'handover — attainment all'11 set 2027;
- gli altri sono **PM**, con un campo da riempire.

Apri anche il **GC Support**: la stessa scaletta produce **14 report mensili**,
una riga sola nella tabella, quattordici pallini nella corsia.

### (c) Vincolo violato, segnalato inline e sulla timeline

Sempre sulla LEED, metti `FGB Design Guidelines` al **20 dic 2025** e nel
cronoprogramma `Lancio gara d'appalto` al **10 nov 2025**.

Il campo si borda d'ambra, sotto compare *«Va emessa prima del lancio della
gara: dopo, non entra nei documenti d'appalto»*, il pallino sulla timeline
diventa ambra, e a destra compare la stessa frase con i giorni: **40**.

Timeline e modulo sono la stessa verità in due forme — non due verità.

Il vincolo scatta **anche se a muoversi è l'ancora e non il passo**: sposta il
lancio gara indietro e le guidelines diventano in ritardo senza che tu le abbia
toccate. È il caso che a mano non vede nessuno.

### (d) Handover che si sposta: anteprima, conferma, registro, secondo PM

Scheda 3. Nuovo handover **30 apr 2027**, fonte `gantt rev. 8 del GC`, premi
**Anteprima**.

Non ha ancora scritto niente. Vedi:

- cinque milestone che si spostano, vecchia data barrata e nuova in grassetto;
- **+46 giorni** rispetto alla baseline contrattuale;
- *«Fine stimata 27 ott 27: 27 giorni oltre la scadenza del 30 set 27. Proroga
  da negoziare.»*;
- chi verrà avvisato.

Premi **Conferma spostamento**. Le tue due timeline si aggiornano; nel registro
compare la voce **già monetizzata**.

Ora la parte che conta: **la WELL di `pmtest` non si è mossa.** Aprila —
l'handover è ancora al 15 marzo, e in cima c'è una scheda ambra *«1 conferma in
sospeso»*. PM-A non muove le milestone di PM-B: possono avere finestre d'ente o
date d'audit che lui non conosce.

Nota la differenza fra le due cascate: sulla LEED si muovono **cinque**
milestone, sulla WELL **due**. Il resto della coda WELL pende dai risultati
della performance verification, che è un passo deciso dal PM. Non tutto slitta.

### (e) Il ritardo nostro che rientra da solo

Su una milestone PM metti una data nel passato e lasciala non completata. In
**Cantieri** la colonna *Ritardo nostro* si accende.

Ora sposta l'handover in avanti. Se quella milestone dipende dall'handover, la
sua data si sposta con lui e **il ritardo si chiude da solo**.

Non è una regola aggiunta sopra: il ritardo nostro si misura **sempre contro le
date correnti**, mai contro un piano congelato. Un indicatore su baseline fissa
mostrerebbe rosso a un PM il cui problema si è appena risolto, e in poche
settimane nessuno guarderebbe più quel semaforo.

Lo *slittamento*, nella colonna accanto, resta invece misurato sulla baseline
contrattuale: lì la storia serve a negoziare. Sono due colonne e non si fondono
mai in un semaforo unico.

### (f) La serie che cresce, e le occorrenze emesse che restano

Sul **GC Support**, con handover al 15 mar 2027, la serie ha **14** occorrenze.

Sposta l'handover al 30 apr: l'anteprima dice `report 14 → 15 · 1 da fatturare`.

Poi la prova che conta. Marca completati alcuni report, e **arretra** l'handover
al 1 dic 2026. La serie scende a 10, ma:

```
creati: 0    rimossi: 0    emessi in eccesso: 4
```

**Zero cancellazioni.** I report già consegnati restano dove sono e vengono
segnalati. Un ricalcolo che cancella un report consegnato distruggerebbe insieme
l'avanzamento e la base di fatturazione.

La regola sul periodo parziale è **mese iniziato, report dovuto**:
10 mesi e 12 giorni → 11 report. È la decisione aperta §11.1, e vive in un punto
solo — `fn_serie_conteggio`.

### (g) Il cruscotto direzionale

**Cantieri**. In cima quattro numeri, sotto le eccezioni, poi il portafoglio.

Dopo lo scenario (d) trovi:

- *Contratti a rischio: 1* — Palazzo Aurora, con i mesi di proroga stimati;
- *Conferme in sospeso: 1* — la WELL di `pmtest`, cliccabile.

Le eccezioni stanno **sopra** la tabella: la direzione non vuole guardare tutto,
vuole che il sistema dica cosa guardare.

Espandi una riga: le corsie, cronoprogramma sopra e certificazioni sotto, sullo
stesso asse. È lo stesso componente della compilazione, quindi le due viste non
possono disegnare la stessa cosa in due modi.

La soglia del dato stantio è regolabile in testata — il §11.5 è ancora aperto e
volevo poterla provare invece che averla cablata.

### (h) Il progetto senza cantiere, senza dati inventati

**Torre Levante — WELL EB**. Nessun cronoprogramma, nessun gate, timeline
materializzata da subito.

In **Cantieri** la riga esiste con la sua certificazione e le colonne di
cantiere vuote — non a zero, **vuote**. Dove non c'è un dato non compare un
numero. La colonna prossima milestone dice *«timeline da compilare»*, che è vero,
invece di un trattino che non dice niente.

Non è un progetto a cui manca il cantiere: è una casistica sua, con un asse
fatto di performance period e scadenza di ricertificazione.

Stessa cosa per **Uffici Corso Re**: un servizio Greeny appeso al solo sito,
senza certificazione e senza cantiere. Prima di questo ramo era impossibile —
`site_energy_records.certification_id` era `NOT NULL`.

---

## Cosa è stato toccato in produzione

Nove migrazioni, tutte additive tranne dove indicato.

| Migrazione | Cosa fa |
|---|---|
| `20260909100000_cronoprogramma` | 3 tabelle, `certifications.cronoprogramma_id` |
| `20260909110000_motore_ancore_cronoprogramma` | `cert_timeline_steps.ancora`, risoluzione delle date |
| `20260909120000_vincoli_di_precedenza` | `cert_step_constraints` + 29 vincoli |
| `20260909130000_serie_ricorrente` | quarta natura di passo · **converte 3 scalette GC Support** |
| `20260909140000_gate_di_precedenza` | il gate, `certifications.contract_end_date` |
| `20260909150000_monitoraggio_appeso_al_sito` | **allenta `NOT NULL`** su energia e acqua |
| `20260909160000_cascata_proposta_e_conferma` | proposte, anteprima, conferma, registro |
| `20260909170000_portafoglio_direzionale` | `fn_portafoglio_siti` |
| `20260909180000_milestone_dichiara_la_sua_ancora` | `certification_milestones.ancora` |

Le due non puramente additive:

- la conversione GC Support ha rimosso 4 passi enumerati per scaletta,
  **salvati in `_bak_gc_support_report_steps`**;
- l'allentamento del `NOT NULL` non invalida nessuna riga esistente.

Niente backfill, nessuna materializzazione in blocco: le 17 timeline già
materializzate non sono cambiate di un giorno.

---

## Le correzioni del §7

**§7.1 — il match del Gantt.** Cercava la stringa `"construction phase"`, che
esiste in **2 scalette su 23**: le altre 21 dicono `Construction Start`. Le
colonne Con. Start e Con. Fcst erano vuote su 587 progetti ID+C.

Non era un caso isolato. Lo stesso difetto stava in altri due posti:

| Dove | Cercava | Trovava |
|---|---|---|
| Gantt admin | `"construction phase"` | 2 scalette su 23 |
| `usePMDashboard` | idem | idem |
| `TimelineSetupWizard` | `"Construction end (Handover)"` con la **e** minuscola | **niente** — le scalette scrivono `End` |

Il terzo spiega perché `actual_handover_date` aveva 2 righe su 1.135: il ramo
che la scrive non si è mai eseguito.

Ora ogni milestone **dichiara a quale ancora corrisponde** e nessuno confronta
più stringhe.

**§7.2 — le anomalie, verificate.**

- **WELL PTA ha Construction Start ma non Handover**: confermato, è l'unica
  delle 12. Ora è un dato (`ancora`), non un aneddoto.
- **`cert_catalog` ha ogni combinazione in doppia copia**: LEED BD+C, WELL NC e
  WELL EB restituiscono due righe identiche. Funziona perché la risoluzione fa
  `LIMIT 1`. Non l'ho toccato.

---

## Le sei decisioni aperte del §11

Nessuna decisa. Dove servivano per procedere:

| § | Cosa ho messo | Dove si cambia |
|---|---|---|
| 1 · periodo parziale | mese iniziato = report dovuto; serie fino all'handover | `fn_serie_conteggio` |
| 2 · perimetro PM | tutti i siti | `fn_crono_can_read` |
| 3 · scalette autonome | tutte agganciabili al solo sito | è la forma più permissiva |
| 4 · chi marca una milestone | il PM titolare | policy su `certification_milestones` |
| 5 · soglia freschezza | 21 giorni, regolabile a schermo | parametro di `fn_portafoglio_siti` |
| 6 · dipendenze fra cronoprogrammi | niente, ma non impedito | — |

---

## Cosa resta aperto, e che ho trovato strada facendo

1. **`certifications.contract_end_date`** non esisteva in nessuna tabella.
   L'ho aggiunta perché senza di essa metà del cruscotto non è calcolabile. Se
   la scadenza è già scritta da qualche parte in quotazione, questa colonna deve
   leggerla invece di essere compilata a mano.
2. **Un'utenza con email esterna ha ruolo `admin`.** `is_admin()` apre parecchie
   porte, incluse le nuove policy.
3. **`fn_portafoglio_siti` impiega 1,75 s su 864 siti.** Accettabile per un
   cruscotto che si apre una volta. Si sistema con una vista materializzata, ma
   è ottimizzazione: prima guarda se i numeri sono quelli giusti.
4. **`planned_handover_date`** resta ferma e inutilizzata: è morta, e non ho
   voluto riesumarla dentro un modello che le assegnerebbe un ruolo diverso.

---

# Aggiornamento v1.1 — cosa è cambiato e cosa provare in più

*(specifica: `docs/specs/specifica-v1.1-rinomine-tipi-ocr.md`; dove diverge
dalla v1, vince la v1.1)*

## Le rinomine (§1)

CANTIERI → **PROJECTS** (admin, `/portafoglio`) · OPERATIONS → **SERVICES**
(admin, `/projects`) · Cronoprogramma → **PROJECT TIMELINE** · la sezione col
nome della certificazione → **HQ FGB TIMELINE**. Gli identificatori interni
restano quelli della v1: la mappa è in `docs/glossario-v1.1.md`.

## Cosa è cambiato nel flusso

- **Tipo di progetto** alla creazione: DESIGN+CONSTRUCTION, CONSTRUCTION o
  EXISTING, proposto dal catalogo e modificabile. EXISTING salta la PROJECT
  TIMELINE e il gate.
- **Template standard**: la PROJECT TIMELINE nasce dal template del tipo
  (IDC / BDC / CONSTRUCTION), righe rivedibili prima della creazione.
- **Fasi con durata**: inizio e fine; le milestone restano istanti.
- **Fonte facoltativa** ovunque: consigliata, mai bloccante.
- **Niente sezione «nuove date»**: si modifica la riga in linea → anteprima
  della cascata → conferma → registro. Vale per qualunque riga.
- **Registro corretto**: la voce nomina la riga davvero spostata; i derivati
  economici compaiono solo sull'handover.
- **Grafico verticale**: colonna compatta e sticky accanto al form; un click
  la espande a schermo intero con lo zoom. Grammatica dal riferimento visivo
  approvato (`docs/specs/riferimento-visivo-timeline.html`).
- **Import da file** nella PROJECT TIMELINE: xlsx (diretto), PDF con testo
  (parsing), immagini e scansioni (OCR ita+eng, scaricato al primo uso).
  Revisione del PM obbligatoria; integrazione per evento, mai sostituzione.

## Scenari nuovi da provare

- **(i) Template** — crea la PROJECT TIMELINE da template IDC su un sito e da
  template BDC su un altro; togli e rinomina righe prima di creare.
- **(j) Import** — sulle quattro fixture in `docs/specs/fixtures/`:
  - `20260209_GW_XD_Ergou_R2.xlsx` → durate in mesi: il sistema chiede la
    data di ancoraggio e calcola le date;
  - `20260623_Grand_Vespucci_..._REV02.pdf` e `GANTT_LCP_METRO_Pontedera...pdf`
    → parsing del testo, con proposta delle ancore (consegna aree, consegna
    lavori = handover);
  - `bou_almathy.png` → OCR (serve rete: i modelli si scaricano al primo uso).
  In revisione: elimina le righe superflue con le checkbox, correggi il
  mapping, conferma. Un re-import non deve azzerare le date pre-cantiere.
- **(k) Registro** — sposta una riga qualunque (non l'handover): la voce del
  registro nomina quella riga, senza derivati economici. Sposta l'handover:
  la voce esce monetizzata.
- **(l) Vista admin PROJECTS** — tabella con Certifications, Typology,
  Handover (con lo scostamento «+Ngg»), Status derivato (Design grigio /
  Construction ambra / Certification viola). Click sulla riga → drill-down
  orizzontale: barra PROJECT nelle tre fasi, una barra per certificazione con
  le tacche, la serie come tacche ravvicinate con etichetta cumulativa, la
  linea dell'oggi che attraversa tutto.
