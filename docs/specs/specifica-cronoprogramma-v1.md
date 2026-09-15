# Cronoprogramma e timeline di certificazione — specifica di implementazione v1

**Destinatario:** Claude Code, per la costruzione di una versione locale da testare e approvare.
**Stato:** decisioni consolidate. Le scelte qui dentro sono state discusse e chiuse una per una; i punti ancora aperti sono elencati in §11 e non vanno decisi in autonomia.
**Documenti di contesto:** `specifica-risultato-timeline-certificazioni.md` (il risultato atteso lato PM e admin), `decisione-cantieri-certificazioni.md` (il percorso di decisione e le motivazioni), `FGB-timeline-certificazioni.pdf` (le 23 scalette reali con nature e offset), `demo-timeline-pm-ceo.html` (riferimento UX interattivo approvato concettualmente).

---

## 1. Obiettivo

Integrare le timeline delle certificazioni con le timeline dei cantieri su cui si innestano, in modo che:

- il **PM** compili con il minimo sforzo (template + ancore = timeline generata) e sappia collocare le proprie attività nei punti giusti della timeline del cantiere, comprese quelle precedenti al cantiere stesso (gara, progetto);
- l'**admin/CEO** veda come l'azienda si colloca rispetto a ogni cantiere, distingua i ritardi nostri dagli slittamenti esterni, e ne ricavi le decisioni economiche: fatturare un mese, negoziare una proroga, contare i report addizionali.

Il frontend cliente (dash mappa, organizzazione su base sito) **non cambia**.

---

## 2. La nuova entità: `cronoprogramma`

Modello B della specifica di partenza, con il nome scelto in corso d'opera: *cronoprogramma*, non *cantiere*, perché contiene anche eventi precedenti all'apertura del cantiere.

### 2.1 Struttura

| Campo | Regola |
|---|---|
| `site_id` | **Obbligatorio, not null.** Un cronoprogramma appartiene a un sito solo. Lo store dentro un mall sono due siti, ciascuno col suo cronoprogramma. |
| Molteplicità | Un sito può avere più cronoprogrammi **nel tempo** (rifacimenti successivi). Mai più d'uno attivo contemporaneamente nella v1. |
| Fasi | **Lista ordinata di eventi**, non colonne fisse: `nome`, `data_pianificata`, `data_effettiva`, `fonte`, `aggiornata_il`, `stato` (inserita / da confermare / confermata). Il PM può aggiungere eventi che il gantt del GC contiene davvero. |
| Tipo | Non serve un campo `tipo` strutturale. Fit-out e ground-up sono identici come struttura; la distinzione vive solo come **set di etichette proposte** in compilazione. Il tipo è comunque ricavabile dalla certificazione agganciata. |
| Provenienza | **Per singola data, non per cronoprogramma.** Sullo stesso asse convivono date manuali del PM e date importate dal GC in momenti diversi; un unico "aggiornato al" mentirebbe. |

### 2.2 Eventi canonici (ancore)

Otto-nove ancore, uguali per tutti i tipi di cantiere, derivate dai passi manuali reali delle scalette:

**Pre-cantiere** (fonte: committente/DL, inserimento manuale): lancio gara d'appalto · aggiudicazione GC · progetto definitivo consegnato.
**Cantiere** (fonte: gantt GC o manuale): construction start · impianti pronti per test · involucro chiuso · sito pronto per test di performance · **handover** (fine cantiere).

L'handover è l'unica ancora da cui il motore ricalcola (v. §4). Le altre servono per collocamento, vincoli di precedenza e serie ricorrenti.

### 2.3 Compilazione in due momenti

1. **Al kickoff:** il PM inserisce le date pre-cantiere (dal cronoprogramma di sua competenza o a mano) e l'handover contrattuale, che arriva precompilato dalla quotazione. Il cronoprogramma nasce sempre con almeno una data vera.
2. **Durante il cantiere:** integrazione con le date del gantt del GC. **L'import integra per evento, mai per sostituzione dell'intero record** — non deve azzerare le date pre-cantiere già inserite.

Construction start non ancora comunicato dal GC → stato **«da confermare»**, non campo obbligatorio vuoto. Il gate è una precedenza, non un muro.

---

## 3. Regole fondanti

### 3.1 Vincolo di precedenza (gate)

Per le **12 scalette di cantiere** (LEED ID+C, LEED BD+C, BREEAM NC/RFO, WELL NC, WELL Core, WiredScore Dev, i 3 GC Support, MEP Cx, Envelope Cx, WELL PTA): la timeline di cronoprogramma **si compila prima** di quella di certificazione. Finché il cronoprogramma del sito non esiste, il PM non accede alla compilazione delle date della certificazione. Le 7 scalette su edificio esistente e le 4 di monitoraggio non hanno il gate.

### 3.2 Ereditarietà

Nel to-be, **Construction Start e Construction End (Handover) non sono più dati di input** della compilazione della certificazione: sono valori **ereditati dal cronoprogramma, in sola lettura** nella scheda certificazione. In `cert_timeline_steps` quei passi cambiano natura: non più `PM` né `auto · handover`, ma "ereditato dal cronoprogramma agganciato". Creare la tabella senza togliere i due campi dall'input lascerebbe due strade per scrivere la stessa data.

### 3.3 Due handover, due conteggi, due misure

Lo stesso pattern ricorre tre volte e va implementato identico:

| Baseline (storia, per negoziare) | Corrente (realtà, per decidere) |
|---|---|
| Handover **contrattuale** — dalla quotazione, per certificazione. Non si sovrascrive mai. | Handover **corrente** — sul cronoprogramma, condiviso. |
| Report **contrattuali** — quanti venduti (durata assunta in quotazione). | Report **proiettati** — quanti ne serviranno (durata corrente). |
| **Slittamento** — misurato vs baseline contrattuale. | **Ritardo nostro** — misurato vs date correnti; se il cantiere slitta e rientriamo nel range, il ritardo si chiude da solo. |

Slittamento e ritardo nostro sono due indicatori distinti, mai fusi in un unico semaforo; il primo è un input del secondo.

### 3.4 Aggancio, non creazione

Quando una **seconda certificazione** nasce su un sito che ha già un cronoprogramma, il percorso di default è **agganciarsi a quello esistente**; crearne uno nuovo è l'eccezione esplicita. È il meccanismo che impedisce alle date discordanti di riprodursi.

### 3.5 Scrittura condivisa con registro

Tutti i PM agganciati possono modificare le date del cronoprogramma (lettura ampia, scrittura sul cronoprogramma condivisa; le timeline di certificazione altrui restano in sola lettura). Ogni modifica scrive una voce di registro: **chi, quando, da quale data a quale data, fonte** (obbligatoria), più i derivati: scostamento in giorni vs baseline, fine progetto stimata vs scadenza contrattuale, variazione nel numero di report. La voce è il documento su cui Payments negozia la proroga: deve uscire già monetizzata, non ricostruibile a mano.

Ogni modifica **notifica** i PM di tutte le certificazioni agganciate e l'admin, con l'elenco delle milestone che si spostano di conseguenza.

### 3.6 Cascata: proposta e conferma

Lo spostamento dell'handover **propone** lo spostamento delle sole attività ancorate all'handover (i passi `calcolati` e gli ereditati); i passi decisi dal PM (guidelines, training, kick-off, commissioning) **non si muovono automaticamente**. Ogni PM **conferma la propria** cascata: PM-A non muove le milestone di PM-B. L'anteprima prima della conferma mostra quali milestone si spostano, quali sforano un vincolo, e l'impatto contrattuale.

### 3.7 Nessuna migrazione, nessuna materializzazione in blocco

- **Nessun backfill** dei progetti esistenti. I progetti certificati sono chiusi, le loro date sono storia; nel cruscotto compaiono con Status **Certified** (v1.2 §5), senza etichette aggiuntive.
- **Nessuna materializzazione in blocco.** La timeline si materializza quando il PM compila: cronoprogramma prima, certificazione poi. L'adozione è in avanti.
- I 12 casi oggi materializzati si sistemano a mano quando qualcuno li tocca.

### 3.8 SAL

La fatturazione è a stato avanzamento lavori. Quindi **marcare una milestone come completata è un fatto contabile**: va tracciato chi la marca e quando; l'annullamento della spunta è consentito ma lascia traccia nel registro. (Chi possa marcarla è una decisione aperta, §11.)

---

## 4. Il motore delle date

Riusa il meccanismo esistente (`timing_kind`, `anchor_order`, `offset_days`, `fn_materialize_timeline()`, `fn_refresh_timeline_dates()`), estendendolo:

1. **Anchor cross-entità:** i passi calcolati devono poter puntare all'handover del cronoprogramma agganciato, non solo a milestone della stessa scaletta.
2. **Quarta natura di passo — serie ricorrente** (v. §5).
3. **Vincoli di precedenza dichiarativi** sui passi decisi: `guidelines ≤ lancio_gara`, `tendering ≤ lancio_gara`, `training ≥ construction_start`, `commissioning ≤ handover`. Non calcolano date: **generano avvisi** quando violati, anche quando è l'ancora a muoversi e non il passo.

Nota di verifica dai dati reali: nelle 23 scalette **nessun passo calcolato pende da Construction Start** — tutto pende dall'handover o da passi interni. Il ricalcolo quindi riguarda solo l'handover; Construction Start serve per la barra, per i vincoli e per la durata dei report.

---

## 5. La serie ricorrente

Nuovo tipo di passo per i report mensili di cantiere (oggi enumerati nei 3 GC Support come «Report No. 1, 2, 3 + Further as needed») e riusabile per Greeny/ClAir e per i performance period.

- **Definizione:** periodicità (mensile), ancora di inizio (construction start), ancora di fine (handover), regola sul periodo parziale (aperta, §11).
- **Generazione:** alla materializzazione produce N occorrenze, ciascuna una milestone normale con data e stato.
- **Rigenerazione non distruttiva:** quando l'handover si muove si aggiungono o rimuovono **solo le occorrenze future**. Le occorrenze già emesse non si toccano mai; se l'handover arretra oltre un report già emesso, si segnala, non si cancella.
- **Doppio conteggio:** contrattuali (da quotazione) vs proiettati (da durata corrente). La differenza è la fatturazione addizionale e alimenta la voce di registro.

---

## 6. Relazioni fra servizi sul sito

Tre nature, decise **per istanza** (singola vendita), mai per catalogo:

| Natura | Legame | Esempi |
|---|---|---|
| Certificazione autonoma | `cronoprogramma_id` proprio (nullable: null per edificio esistente) | LEED ID+C, WELL EB |
| Satellite | `parent_certification_id` → eredita il cronoprogramma della madre | Monitoraggio da `trg_cert_quotation_approved`; Tassonomia quando accompagna una LEED |
| Servizio autonomo | Appeso **al solo sito**, certificazione e cronoprogramma facoltativi | Le 66 righe aria orfane ("mandami i monitor per domani"); Tassonomia venduta da sola |

La Tassonomia e IAQ Testing (e probabilmente GC Support, MEP/Envelope Cx, WELL PTA) cambiano natura a seconda della vendita. Il modello deve permettere a una riga di monitoraggio di vivere appesa al solo sito. Verificare cosa propaga `trg_cert_quotation_approved` quando in futuro i PM saranno più d'uno per certificazione (oggi `PM` è un campo singolo, non una relazione).

---

## 7. Correzioni immediate al sistema attuale

Da fare nella versione locale, indipendenti dal resto:

1. **Match del Gantt:** oggi cerca la stringa `"construction phase"`, presente solo in WELL Core e WELL NC (2 scalette); le altre 21 dicono `Construction Start` → colonne Con. Start/Fcst vuote su 587 progetti ID+C. Nel to-be il Gantt legge il cronoprogramma, non una stringa.
2. **Anomalie di scaletta** da correggere o far confermare: WELL PTA ha Construction Start ma non Handover (unica delle 12); IAQ Testing ha «Site Ready for IAQ Testing» ma nessuna milestone di cantiere; WiredScore Occ calcola la submission (#6) da #2 ignorando la visita auditor (#3-4) che le sta in mezzo; WELL Core ≡ WELL NC e LEED GC Support ≡ BREEAM GC Support (duplicazioni parametrizzabili).
3. **Riconciliare le due generazioni di nomi** delle milestone esistenti (igiene sui 12 record materializzati).

---

## 8. Interfacce

### 8.1 Flusso PM (ordine vincolato)

1. **Cronoprogramma** — tabella eventi con data, fonte, stato di conferma; handover precompilato dalla quotazione come baseline. Salvataggio sblocca il passo 2.
2. **Timeline di certificazione** — «Genera dalla scaletta» materializza i passi; PM editabili con vincoli di precedenza inline; ereditati in sola lettura con provenienza dichiarata; calcolati auto. Sotto, le timeline degli altri PM sullo stesso sito in sola lettura con nome del responsabile.
3. **Aggiornamento date di cantiere** — nuovo valore + fonte obbligatoria → anteprima cascata (cosa si muove, cosa no, verdetto sul contratto, chi verrà notificato) → conferma → registro.
4. **Registro** — cronologia consultabile.

### 8.2 Anteprima viva durante la compilazione (novità, da specificare non da mockuppare)

Mentre il PM compila, un **pannello laterale disegna la timeline in tempo reale**: la corsia del cronoprogramma come riferimento e sotto la corsia della certificazione che prende vita milestone per milestone man mano che le date vengono inserite.

Requisiti:
- Layout a due colonne sopra i ~1100px (form a sinistra, timeline a destra, sticky); sotto, la timeline si sposta in un pannello richiudibile sopra il form. Aggiornamento a ogni change con debounce ~300ms, senza salvataggi intermedi.
- Ogni data inserita fa **apparire** la milestone sulla corsia; ogni data modificata la **sposta con una transizione breve** (150–250ms) — il movimento è l'informazione: il PM vede l'effetto della data che ha appena scritto.
- Le milestone ereditate e calcolate compaiono da subito (il cronoprogramma è già salvato); i passi PM compaiono man mano. I passi senza data restano come segnaposto smorzati in coda alla corsia, così il PM vede quanto manca.
- **I vincoli si vedono, non solo si leggono:** un passo che viola la precedenza si colora di ambra sulla timeline e mostra il collegamento all'ancora violata; il campo corrispondente nel form mostra lo stesso avviso. Timeline e form sono la stessa verità in due forme.
- Focus bidirezionale: focus su un campo evidenzia la milestone; click sulla milestone porta il focus al campo.
- La stessa componente si riusa nell'**anteprima della cascata** (§3.6): le milestone proposte si mostrano nella posizione nuova con la vecchia in traccia smorzata, prima della conferma.
- Rispettare `prefers-reduced-motion` (niente transizioni, solo riposizionamento).

### 8.3 Viste di lettura

Tre viste che mostrano lo stesso innesto (riferimento visivo: `demo-timeline-pm-ceo.html` e il mockup approvato della vista sito):

| Vista | Perimetro |
|---|---|
| Dettaglio sito/progetto | Corsia cronoprogramma sopra (con provenienza per data), corsie certificazioni sotto, dipendenze visibili. |
| Gantt PM | Come il Gantt Operations, filtrato sui siti dove il PM ha almeno una certificazione (perimetro finale: decisione aperta §11). Editabile solo il proprio. |
| Gantt Operations/Admin | Tutto il portafoglio. **Stessa schermata del Gantt PM con filtro diverso, non due schermate.** |

### 8.4 Vista CEO

Su **base sito** (mai su base cronoprogramma: escluderebbe il 38% del portafoglio). KPI di testata e regola «Da attenzionare»: come definiti in **v1.2 §7** (che sostituisce l'elenco precedente di questa sezione). Tabella portafoglio con riga espandibile → corsie. Colonne: fase corrente, slittamento vs baseline, ritardo nostro (ricalcolato), prossima milestone e chi la blocca, fine stimata vs scadenza contratto, report proiettati/contrattuali dove applicabile. La provenienza e la data di aggiornamento delle date del cronoprogramma restano dati consultabili sul singolo evento (§2.1), ma **non** generano indicatori, soglie o eccezioni di «dato stantio».

---

## 9. Anti-requisiti

- Non replicare il gantt del GC: si mappano le ancore, non le 400 righe di WBS.
- Nessun semaforo unico che fonda ritardo nostro e slittamento.
- La provenienza delle date (fonte, aggiornata il) resta consultabile sul singolo evento, senza però generare indicatori o allarmi automatici.
- Nessuna timeline farlocca per i progetti senza cantiere: hanno il loro asse (performance period, contratto).
- Nessuna modifica al frontend cliente.
- Nessuno spostamento silenzioso di date altrui; nessuna cancellazione di occorrenze emesse.

---

## 10. Perimetro della versione locale di test

Costruire in locale, senza toccare produzione, un verticale completo su cui validare i flussi:

1. Entità `cronoprogramma` + eventi + registro + notifiche (anche solo in-app/log).
2. Gate di precedenza sulle 12 scalette; ereditarietà dei due passi; aggancio-non-creazione.
3. Motore esteso: anchor cross-entità, vincoli di precedenza, serie ricorrente con doppio conteggio.
4. Flusso PM completo (8.1) con anteprima viva (8.2), su due scalette reali: **LEED BD+C** e **WELL NC** dello stesso sito, due PM.
5. Vista CEO (8.4) e dettaglio sito (8.3) alimentate dallo stesso stato.
6. Correzioni §7 punto 1 e verifiche punto 2.

**Scenari di accettazione** (ricalcano la demo approvata): (a) il PM non accede alla certificazione prima del cronoprogramma; (b) genera la LEED e i calcolati pendono dall'handover del cronoprogramma; (c) violazione di precedenza segnalata inline e sulla timeline; (d) spostamento handover → anteprima → conferma → registro monetizzato → notifica e conferma separata del secondo PM; (e) ritardo nostro che rientra quando il cantiere slitta; (f) serie report che passa da 7 a 9 con le occorrenze emesse intatte; (g) vista CEO che mostra il contratto a rischio e la conferma in sospeso; (h) progetto senza cronoprogramma (WELL EB) che vive sul proprio asse senza dati inventati.

---

## 11. Decisioni aperte — NON deciderle in autonomia

1. **Periodo parziale della serie report:** 10 mesi e 12 giorni = 10 o 11 report? E la serie si ferma all'handover o alla chiusura documentale (+30gg)? → Payments.
2. **Perimetro di lettura del PM:** tutti i siti dell'azienda o solo i propri? Implementarlo come parametro. → Direzione.
3. **Quali scalette sono vendute anche da sole** e quali solo appese a una madre (Tassonomia, IAQ, GC Support, Cx, PTA). → Operations.
4. **Chi può marcare una milestone come completata** (fatto di SAL) e la policy di reversibilità. → Direzione/Payments.
6. Dipendenze fra cronoprogrammi di siti diversi (store nel mall): fuori perimetro v1, non predisporre nulla oltre a non impedirlo.
7. **Collaborazione fra PM sulla stessa certificazione** (invito a posteriori da parte del PM o dell'admin): richiede una tabella di associazione certificazione↔utente con ruolo (responsabile/collaboratore), mentre oggi `PM` è un campo singolo propagato via trigger. Fuori perimetro v1 come funzione, ma la verifica preliminare su `trg_cert_quotation_approved` (§6) va fatta ora e lo schema non deve impedirla. → Direzione per il modello dei ruoli.
