# Cantieri e certificazioni — documento di decisione

Redatto dopo aver letto la specifica di funzionamento generata da Claude Code. Sostituisce le parti del documento precedente che erano scritte senza conoscere il sistema reale; il §4 (risultato lato PM) e il §4 di quel documento (risultato lato Admin) restano validi e non vengono ripetuti qui.

---

## 1. Cosa cambia rispetto al documento precedente

| Avevo ipotizzato | Realtà | Conseguenza |
|---|---|---|
| Bisogna costruire un meccanismo di ancoraggio relativo | Esiste già: `timing_kind`, `anchor_order`, `offset_days`, `fn_refresh_timeline_dates()` | Il costo dell'operazione è molto più basso del previsto. Serve estendere il dominio degli anchor, non inventarli. |
| Il taglio cantiere/non-cantiere è BD+C vs resto | Il taglio è per scaletta. LEED ID+C ha il cantiere ed è il 52% del portafoglio attivo | Il caso principale è il fit-out retail, non la costruzione da terra |
| Un solo vocabolario canonico di 8-12 ancore | Due date sole in tutte le scalette di cantiere, e Construction Start non ancora nulla | La distinzione fit-out / ground-up si dissolve (§3): non serve un `tipo` di cantiere. Il taglio che conta è a tre vie — cantiere, edificio esistente, servizio — e determina che tipo di asse ha la certificazione, non che fasi ha il cantiere |
| Le certificazioni si dividono in con cantiere e senza | Tre gruppi distinti nelle 23 scalette: 12 con cantiere, 7 su edificio esistente (WELL EB, LEED O+M, BREEAM In-Use P1/P2, WELL HSR, WiredScore Occ), 4 di monitoraggio e altri servizi | L'edificio esistente non è "un progetto a cui manca il cantiere": è una casistica sua, con un asse fatto di periodo di performance e scadenza di ricertificazione. Va trattata come tale, non come caso degradato |
| L'entità radice è il progetto | L'entità radice è `certifications`; `projects` è archiviata | Ogni ragionamento su "il progetto" va riletto come "la certificazione" |
| "Asse di riferimento" come concetto nuovo | Le scalette già sono assi autoportanti per i servizi senza cantiere | Il concetto serve solo a dare un nome unificante, non a introdurre struttura |

---

## 2. La scelta del modello

### Perché B, e non per la ragione scritta nella specifica

La specifica motiva B con la capacità di reggere più cantieri sullo stesso sito. È vero, ma è l'argomento debole: dipende da una previsione sul ciclo di rifacimento dei negozi che nessuno può fare con certezza, ed è proprio l'argomento che le domande 1 e 2 cercano di verificare.

L'argomento forte è un altro, e non dipende da nessuna risposta:

> **Un cantiere è un evento con inizio e fine. Un sito è permanente.** Scrivere un evento come attributo di un'entità permanente significa scegliere oggi che non potrà mai essercene un secondo, e scoprirlo il giorno in cui succede — quando avrai dati storici da preservare e nessun posto dove metterli.

A questo si aggiunge che B è l'unica delle tre che risolve strutturalmente problemi che oggi paghi in altre forme:

- **Il bug del Gantt sparisce invece di essere tamponato.** Sotto B il Gantt legge `cantiere.data_inizio`, non fa `grep` su un nome di milestone. Le due generazioni di nomi smettono di essere un rischio architetturale e restano solo un problema di igiene sui 12 record esistenti.
- ~~Le 66 righe aria orfane trovano un padrone.~~ **Argomento ritirato.** Avevo dato per scontato che dietro un sensore orfano ci fosse un intervento in corso. Spesso non c'è: il cliente chiede i monitor e basta, senza cantiere e senza certificazione. Sono servizi venduti a sé stanti, e il loro problema — non avere un'entità a cui appendersi — è indipendente dal modello di cantiere. La soluzione è che una riga di monitoraggio possa appendersi **al sito**, con certificazione e cantiere entrambi facoltativi. Vale sotto A, B e C allo stesso modo, quindi non contribuisce alla scelta.
- **Il cantiere è condiviso fra PM diversi, e questo è l'argomento decisivo.** Operations assegna le certificazioni di uno stesso sito a PM diversi, che dipendono tutti dallo stesso cantiere. I PM si leggono a vicenda — la visibilità è ampia, la scrittura no — quindi il problema non è che non sappiano cosa fa il collega. È che sotto A e C **non esiste una data di cantiere da guardare**: ce ne sono tante quante le certificazioni, ciascuna scritta da qualcun altro, e la visibilità reciproca serve solo a rendere visibile la contraddizione, non a risolverla. È esattamente il quadro dei 13 siti con date discordanti: nessuno le nasconde, semplicemente non c'è un posto dove metterne una sola. E il cambiamento non lascia traccia da nessuna parte, perché un campo su `sites` non ha una storia e una data dentro la certificazione capofila ha una storia che vive nel posto sbagliato. Sotto B il cantiere è un oggetto condiviso dichiarato, che sa **chi lo legge** — quindi chi notificare — e **come è cambiato nel tempo**, che è il documento su cui si negozia una proroga.

### Come non pagare B tutta subito

L'obiezione della specifica è corretta: B è il lavoro più grosso. Ma il costo è divisibile, e la parte cara non è quella che serve per prima.

**Fase 1 — la tabella e il vincolo di precedenza. Nessun backfill.** Crea `cantieri` con il sito e le date, e aggiungi `cantiere_id` nullable sulle certificazioni. Poi la regola che è il cuore della fase: **per le dodici scalette di cantiere, la timeline di cantiere si compila prima di quella di certificazione.** Finché il cantiere non c'è, il PM non accede alla compilazione delle date della sua certificazione. E una volta che c'è, Construction Start e Handover nella scheda della certificazione diventano **ereditati e in sola lettura** (§3.1): non sono più campi da riempire, sono il riflesso del cantiere.

Niente migrazione dei dati esistenti. I progetti già certificati sono chiusi e le loro date sono storia: ricostruirne un cantiere per via automatica significherebbe inventare dati che nessuno ha mai inserito, per progetti su cui nessuno prenderà più decisioni. I dodici casi oggi materializzati si sistemano a mano quando qualcuno li tocca, se mai serve. L'adozione è in avanti: quando la piattaforma arriva ai PM e questi cominciano a compilare i progetti in corso, compilano prima il cantiere e poi la certificazione assegnata.

**Perché il vincolo di precedenza risolve le discordanze meglio di qualunque migrazione.** Il momento decisivo non è la creazione del primo cantiere, è la creazione del secondo. Quando PM-B apre la sua certificazione su un sito dove PM-A ha già compilato il cantiere, il sistema deve proporre di **agganciarsi a quello esistente**, non di crearne uno nuovo. Se quel passaggio è fatto bene, le date discordanti smettono di prodursi alla fonte, senza che nessuno debba riconciliare niente a posteriori. Se è fatto male — se creare è più facile che agganciare — riavrai gli stessi 13 conflitti in una tabella nuova.

**Il vincolo va costruito come precedenza, non come muro.** Un blocco duro su un dato che il PM ancora non ha lo costringe a inventare qualcosa pur di procedere, ed è il modo classico in cui questi gate producono dati peggiori di quelli che volevano prevenire. Qui però il problema non si pone quasi mai: l'handover arriva dalla quotazione ed è disponibile fin dal kickoff, quindi il cantiere nasce sempre con almeno una data vera. Construction Start, che il GC può non aver ancora comunicato, va ammesso come **da confermare** invece che come campo obbligatorio vuoto. Sblocca il PM e lascia visibile all'admin che quel dato non è ancora affidabile.

**Fase 2 — le ancore intermedie.** Serve, ma solo per un motivo. Non per il ricalcolo, perché nessun passo pende da Construction Start (§3.2) e per far muovere le date basta l'handover. E non per la fatturazione, che va a SAL più conteggio dei report (domanda 4). Serve perché il PM possa collocare le proprie attività nei punti giusti: le otto o nove ancore del §3.3, metà prima del cantiere (gara, aggiudicazione) e metà durante (prontezza impianti, involucro, sito pronto per i test). Aggiunge soprattutto vincoli di precedenza e avvisi, che costano meno del ricalcolo.

**Fase 3 — l'anagrafica dei cantieri.** La schermata CRUD per creare, elencare e correggere i cantieri come oggetti a sé. L'ultima, e forse mai: finché i cantieri sono pochi e le date due, si gestiscono dalla scheda certificazione senza una sezione dedicata.

> **Da non confondere.** Le tre fasi qui sopra riguardano solo il modello dati. Le viste — la timeline della certificazione letta contro l'avanzamento del cantiere, per il PM come per Operations — non sono una fase tardiva: sono il motivo per cui si fa tutto il resto, e vanno in parallelo dalla fase 1. Quello che è rimandabile è l'anagrafica, cioè il posto dove si amministrano i cantieri; quello che non lo è affatto è il posto dove si guardano.

Le viste da coprire sono tre, e devono mostrare tutte lo stesso innesto:

| Vista | Chi | Cosa contiene |
|---|---|---|
| Dettaglio progetto | PM e Operations | La corsia del cantiere sopra, la timeline della certificazione sotto, le dipendenze visibili. Vale anche per gli ID+C, che sono il grosso del portafoglio. |
| Gantt PM | PM | Il cantiere e tutte le certificazioni che vi insistono, incluse quelle dei colleghi. In sola lettura tranne le proprie |
| Gantt Operations | Operations e admin | Lo stesso contenuto, esteso a tutto il portafoglio invece che ai propri siti |

La differenza fra le ultime due è di perimetro, non di forma: stessa schermata, filtro diverso. Se vengono disegnate come due schermate distinte finiranno per divergere.

Il punto è che **non c'è nessuna migrazione**, e la ragione per cui è possibile evitarla è che oggi solo 12 certificazioni su 1.135 hanno la timeline materializzata. Il sistema è in pratica ancora vuoto sul lato timeline: si può introdurre il cantiere come prerequisito e lasciare che il portafoglio si popoli correttamente man mano che i PM compilano. Fra sei mesi, dopo una materializzazione in blocco, questa strada non esisterebbe più e resterebbe solo la riconciliazione a posteriori.

### Il corollario che ne discende

**Non materializzare le timeline in blocco, né prima né dopo la fase 1.** Materializzare in blocco oggi scrive 1.135 coppie di date di cantiere private dentro altrettante certificazioni e trasforma il problema delle discordanze da 13 siti a 49. Ma il punto è più generale: la materializzazione non è un'operazione da fare in massa, è quello che succede quando un PM compila un progetto — cantiere prima, certificazione poi. Fatta così, ogni timeline che nasce nasce già agganciata, e non c'è nessun momento in cui qualcuno debba riconciliare qualcosa. È la decisione a costo zero con il rapporto beneficio/rischio più alto di tutto il documento.

---

## 3. Quali ancore servono davvero (riscritto sui dati reali)

Le 23 scalette rendono questa sezione contabile invece che congetturale. Le due versioni precedenti — prima "servono due set di fasi per tipo di cantiere", poi "il tipo è solo un set di etichette" — sono entrambe superate: i dati dicono che la questione del tipo non si pone proprio.

### 3.1 Il conteggio

Dodici scalette su ventitré toccano il cantiere: sei certificazioni con fase di cantiere (LEED ID+C, LEED BD+C, BREEAM NC/RFO, WELL NC, WELL Core, WiredScore Dev) e sei servizi di supporto in cantiere (i tre GC Support, MEP Commissioning, Envelope Commissioning, WELL PTA). Sono oltre 680 progetti dichiarati, la maggioranza del portafoglio attivo.

Tutte e dodici hanno **Construction Start**, oggi compilato a mano dal PM. Undici hanno **Construction End (Handover)**, oggi derivato in automatico dal dato `handover`. Nessuna ha altro.

**Questo è l'as-is, e cambia con il modello B.** Nel to-be quei due passi smettono di essere dati di input della compilazione della certificazione: diventano **valori ereditati dalla timeline di cantiere**, in sola lettura nella scheda della certificazione. Il PM li compila una volta sul cantiere, non una volta per ogni certificazione.

È la parte che chiude davvero il problema, e va detta esplicitamente perché non è automatica: creare la tabella `cantieri` senza togliere quei due campi dalla compilazione della certificazione lascia in piedi due strade per scrivere la stessa data, e la seconda continuerà a produrre discordanze. In `cert_timeline_steps` significa che quei passi cambiano natura — non più `PM` né `auto · handover`, ma ereditati dal cantiere agganciato.

**Attenzione a non fondere due handover diversi.** Quello che arriva dalla quotazione è la data *contrattuale* prevista, per certificazione, e definisce la durata della commessa. Quello del cantiere è la data *corrente* della realtà, condivisa. Non sono la stessa cosa e devono restare due campi: la loro differenza è esattamente l'indicatore che dice all'admin se il contratto scadrà prima della fine del cantiere. Se al momento di spostare l'handover sul cantiere si sovrascrive anche quello contrattuale, si perde la baseline e con essa la capacità di negoziare una proroga su un numero.

### 3.2 Il fatto che cambia tutto: Construction Start non ancora niente

Ho verificato ogni dipendenza `+Ngg da #X` di tutte e ventitré le scalette. **Nessun passo, in nessuna scaletta, è calcolato a partire da Construction Start.** Tutto quello che si ricalcola pende da Construction End:

| Scaletta | Passi ancorati a Handover | Passi ancorati a Construction Start |
|---|---|---|
| LEED ID+C | 3 (#10, #11, #12) | 0 |
| LEED BD+C | 4 (#10–#13) | 0 |
| BREEAM NC/RFO | 5 (#10–#14) | 0 |
| WiredScore Dev | 4 (#9–#12) | 0 |
| LEED / BREEAM GC Support | 2 ciascuna | 0 |
| WELL GC Support | 2 | 0 |
| MEP Commissioning | 2 | 0 |
| Envelope Commissioning | 2 | 0 |
| WELL NC / WELL Core | 1 diretto, il resto via #13/#14 | 0 |

Construction Start è una data che il PM compila e che nessun calcolo di milestone legge. Serve a disegnare la barra — e, come emerso dopo, a determinare la durata su cui si contano i report mensili fatturabili (domanda 4). Non è inutile: è inutilizzata dal motore delle date.

**Ma questo è un sintomo, non un progetto.** Il sistema calcola solo quello che viene *dopo* l'handover. Tutto ciò che sta prima — pre-assessment, design guidelines, requisiti di gara, training del GC, commissioning — è compilato a mano, e non perché sia indipendente dal cantiere, ma perché **le ancore che gli servirebbero non esistono nel modello**. In LEED ID+C, otto passi su dodici stanno prima dell'handover e sette di questi sono manuali.

Quindi la conclusione va corretta: per far *ricalcolare* le timeline com'è fatto il sistema oggi basta l'handover. Ma per far sì che il PM sappia **collocare** le proprie attività nei punti giusti della timeline del cantiere — che è l'obiettivo dichiarato — l'handover da solo non basta affatto.

### 3.3 Le ancore che mancano, e sono su due lati

Contando da cosa dipendono davvero i passi manuali, escono due gruppi. Il primo l'avevo perso del tutto.

**Prima del cantiere — progettazione e appalto.** Questi passi precedono l'apertura del cantiere e pendono da eventi che oggi il modello non conosce affatto:

| Passo oggi manuale | Dove compare | Evento sottostante |
|---|---|---|
| FGB Design Guidelines / Sustainability Guidelines | 6 scalette | Fase di progettazione in corso, prima del capitolato |
| FGB Tendering Requirements | 6 scalette | Lancio della gara d'appalto |
| WiredScore Design Phase Submission | WiredScore Dev #3 | Progetto definitivo consegnato |
| LEED / WELL / BREEAM GC Training | 6 scalette | GC aggiudicato e mobilitato |

Il caso che citi è esattamente questo: le design guidelines vanno emesse *prima* del capitolato di gara, altrimenti non finiscono nei documenti d'appalto e la certificazione parte già in salita. Oggi quella precedenza esiste solo nella testa del PM.

Ne discende una precisazione sul nome delle cose: **l'asse a cui ci appendiamo è più lungo del cantiere.** Gara e aggiudicazione avvengono prima che il cantiere esista, e le loro date non stanno nel gantt del GC — stanno dal committente o dalla DL. Se l'entità si chiama `cantieri` va bene lo stesso, ma deve poter contenere anche eventi pre-cantiere, altrimenti fra sei mesi qualcuno creerà una seconda tabella per ospitarli. La parola che usi tu, *cronoprogramma*, descrive meglio l'oggetto di quanto faccia *cantiere*, e vale la pena considerarla come nome.

**Il modo in cui si riempie: due momenti, due fonti.** L'asse non nasce completo. Prima si mettono le date che ci competono — gara, progetto, aggiudicazione — prendendole dal cronoprogramma nostro o inserendole a mano; poi, quando il cantiere apre, si integrano quelle del GC. Questo ha tre conseguenze pratiche che vale la pena fissare adesso.

*Il gate della fase 1 è satisfacibile fin dal kickoff.* Al momento dell'assegnazione hai già l'handover contrattuale dalla quotazione e le date di gara e progetto: il cronoprogramma nasce con dati veri anche senza che il GC abbia consegnato nulla. Il vincolo di precedenza non blocca nessuno.

*L'import del gantt del GC non deve sovrascrivere la prima metà.* È il modo tipico in cui questi caricamenti fanno danno: arriva un file che non contiene gara e progetto, e li azzera. L'integrazione va fatta per evento, non per sostituzione dell'intero record.

*La provenienza è per data, non per cronoprogramma.* Su uno stesso asse convivranno date inserite a mano dal PM a marzo e date importate dal GC a settembre. Un unico campo "aggiornato al" mentirebbe su metà di esse. Ogni data porta la sua fonte e la sua freschezza — che è anche ciò che permette all'admin di distinguere una previsione nostra da un impegno del GC.

**Durante il cantiere — cancelli di prontezza.** Il secondo gruppo, che avevo già isolato:

| Passo oggi manuale | Dove compare | Stato di cantiere sottostante |
|---|---|---|
| Site Ready for WELL Performance Testing | WELL PTA #5 | Finiture complete, sito pulito |
| Systems Ready for Testing | MEP Commissioning #5 | Impianti completati |
| Envelope Site Inspection & On-site Testing | Envelope Cx #5 | Involucro chiuso |
| Commissioning tests and reports | ID+C #8, BD+C #8, BREEAM NC #8, WELL NC/Core #7 | Impianti in avviamento |
| QlAir Installation / Shipment | 7 scalette | Sito accessibile e sicuro per i sensori |

Sono in tutto otto o nove ancore fra i due gruppi, ricorrono identiche in tutte le scalette, e **nessuna dipende dal tipo di cantiere**: "gara lanciata" e "impianti pronti per il test" significano la stessa cosa in un fit-out e in una nuova costruzione. La questione fit-out contro ground-up resta chiusa.

### 3.3.1 Cosa farne

Non tutte devono diventare ancore calcolate. La distinzione utile è fra date che **il PM subisce** e date che **il PM decide**:

- *Subite* — lancio gara, aggiudicazione, prontezza impianti, handover. Vengono da fuori, riguardano più servizi contemporaneamente, e sono le candidate a stare sul cantiere condiviso.
- *Decise* — quando emettere le design guidelines, quando fare il training. Restano del PM, ma con **un vincolo di precedenza dichiarato** rispetto all'ancora subita: "le guidelines devono uscire prima del lancio gara". Non serve calcolarne la data, serve che il sistema segnali quando la precedenza viene violata.

Questa seconda categoria è probabilmente la cosa più utile al PM di tutto il lavoro, e costa poco: non è ricalcolo, è un controllo di coerenza. Se la gara slitta in avanti nessuno si allarma; se slitta indietro, il PM viene avvisato che le sue guidelines sono in ritardo rispetto a un evento che non controlla.

### 3.4 Anomalie trovate nelle scalette

- **I report di cantiere sono enumerati invece che ricorrenti.** Le tre scalette GC Support hanno «FGB Construction Report No. 1, 2, 3 Issued» come passi fissi più un «Further FGB Construction Reports (as needed)» che raccoglie tutti gli altri. Siccome sono mensili e fatturabili, il loro numero dipende dalla durata del cronoprogramma: vanno generati come serie, non elencati. Modello in §3.5.
- **WELL PTA ha Construction Start ma non ha Handover.** È l'unica delle dodici. Non può ancorarsi alla fine lavori, e i suoi passi calcolati pendono dai test invece che dal cantiere. Da verificare se è voluto.
- **IAQ Testing non ha milestone di cantiere**, pur avendo "Site Ready for IAQ Testing" al passo #2. Un test IAQ pre-consegna è per definizione appeso a un cantiere. Probabile buco.
- **Tassonomia UE 7.1 e 7.2** si chiamano Nuove Costruzioni e Ristrutturazioni Importanti e non hanno cantiere. Non è un buco della scaletta: è una scaletta vendibile in due modi — appesa a una certificazione madre, oppure da sola — e nel secondo caso ha bisogno di un cronoprogramma proprio. Il legame va deciso per progetto, non per catalogo. Vedi §5.
- **WELL Core e WELL New Construction hanno scalette identiche** (19 passi, stessi nomi). Come LEED GC Support e BREEAM GC Support (11 passi, cambia solo il nome del training). Duplicazione che vale la pena guardare quando si toccherà `cert_timeline_steps`.

### 3.5 La serie ricorrente: come il modello deve gestire i report mensili

I report di cantiere sono mensili e fatturabili, quindi il loro numero dipende dalla durata del cronoprogramma. È il legame più diretto fra slittamento e ricavo di tutto il sistema, e va modellato esplicitamente invece che lasciato a passi enumerati.

**Un tipo di passo nuovo.** Oggi `cert_timeline_steps` conosce tre nature: data messa dal PM, data calcolata da un'altra milestone, data ereditata da un dato esistente. Ne serve una quarta: **serie ricorrente**, definita non da una data ma da quattro parametri — periodicità (mensile), ancora di inizio (Construction Start), ancora di fine (Handover), regola sul periodo parziale. Nella scaletta smette di essere «Report No. 1, 2, 3 + altri as needed» e diventa una riga sola: *report di cantiere, mensile, da Construction Start a Handover*.

**La generazione.** Alla materializzazione la serie produce N occorrenze, ciascuna una milestone normale con la sua data e il suo stato. Da lì in poi si comportano come qualunque altro passo: il PM le marca emesse, compaiono nel Gantt, contribuiscono all'avanzamento.

**La rigenerazione, che è la parte delicata.** Quando l'handover si sposta, la serie si ricalcola — ma con un vincolo assoluto: **le occorrenze già emesse non si toccano mai.** Si aggiungono o si rimuovono solo quelle future. Un ricalcolo che cancella un report consegnato distruggerebbe sia il dato di avanzamento sia la base di fatturazione, ed è il modo in cui questo meccanismo può fare più danno di quanto ne risolve. Se l'handover arretra al punto da rendere «di troppo» un report già emesso, non va rimosso: va segnalato, perché significa che il periodo si è accorciato dopo che il lavoro era stato fatto.

**Due conteggi, non uno.** Come per l'handover (§3.1), servono due numeri distinti:

| | Da dove viene | A cosa serve |
|---|---|---|
| Report **contrattuali** | La quotazione, che ha assunto una durata | Baseline: quanti ne sono stati venduti |
| Report **proiettati** | Durata corrente del cronoprogramma | Realtà: quanti ne serviranno davvero |

La differenza fra i due è la fatturazione addizionale. Fonderli in un unico contatore fa sparire esattamente l'informazione per cui si costruisce il meccanismo.

**Il collegamento con il registro.** Quando qualcuno sposta l'handover, la voce di registro (§4.8a) riporta già scostamento in giorni e nuova fine stimata; con la serie in piedi può riportare anche la variazione nel numero di report e, se il prezzo unitario è noto dalla quotazione, il valore. È il punto in cui il tracciamento smette di essere cronologia e diventa un documento di trattativa.

**La decisione di business da prendere prima di implementare.** Il periodo parziale: dieci mesi e dodici giorni fanno dieci report o undici? È una regola di fatturazione, non un arrotondamento tecnico, e va scritta esplicitamente perché ogni implementazione ne sceglierà una implicitamente. Va deciso anche se la serie si ferma all'handover o continua fino alla chiusura documentale, che nelle scalette GC Support arriva 30 giorni dopo.

**Non è un caso isolato.** Lo stesso meccanismo serve ai servizi continuativi — Greeny ed Energy hanno report periodici e campagne ricorrenti — e alle certificazioni su edificio esistente, dove il performance period è per definizione un ciclo. Costruirlo come tipo generale di passo, e non come eccezione per i GC Support, lo rende riusabile su tutto il portafoglio.

---

## 4. Risposte alle otto domande

Dove posso ragionare lo faccio; dove serve conoscenza vostra lo dico.

**1 · Un sito può avere due cantieri in momenti diversi?**
Nel retail di lusso i rifacimenti di negozio hanno cicli tipicamente inferiori al decennio, e il sistema ha 1.105 siti che accumuleranno storia. Ma l'argomento decisivo non è la frequenza: è che una ricertificazione futura avrà bisogno del record dell'intervento precedente, e sotto A quel record è stato sovrascritto. **Risposta operativa: comportati come se fosse sì**, perché il costo di sbagliare in questa direzione è una migration in più, mentre nell'altra è perdita di dati.

**2 · Un cantiere può ospitare certificazioni di siti diversi?**
**Risposta data: no.** Anche il negozio dentro un mall si modella come due siti distinti — lo store e il mall — ciascuno con il proprio cronoprogramma. La relazione è quindi netta: **un cronoprogramma appartiene a un sito solo**, e un sito può averne più d'uno nel tempo (domanda 1).

È una semplificazione utile allo schema: `site_id` sul cronoprogramma è obbligatorio e non nullable, niente relazione molti-a-molti, niente tabella ponte. Una delle poche domande che chiude qualcosa invece di aprirlo.

Resta un caso di secondo ordine, da tenere presente ma non da risolvere ora: quando i due siti sono in rapporto — il fit-out dello store non può partire finché il mall non consegna il guscio — quella dipendenza attraversa due cronoprogrammi e non è rappresentata da nulla. In pratica significa che se slitta il mall, le date dello store vanno aggiornate a mano e nessuno viene avvisato. Se il caso è raro, va benissimo così. Se invece è ricorrente nel retail dentro department store, prima o poi servirà un riferimento fra cronoprogrammi — che sotto B è un campo in più, non un ripensamento.

**3 · La timeline la teniamo noi o ce la dà il cliente?**
Questa te la sei già risposta nella tua richiesta iniziale: il PM contatta il GC o la DL e chiede il gantt. Quindi **la riceviamo**, e serve import più rilevamento dei cambiamenti. Aggiungo il requisito che nella specifica non compare: ogni ancora deve portare con sé **data e fonte dell'ultimo aggiornamento**. Un dato di cantiere fermo a tre mesi fa produce numeri che sembrano validi e non lo sono, ed è il modo tipico in cui un cruscotto direzionale perde credibilità.

**4 · Quante fasi ha un cantiere?**
**Per il ricalcolo, una sola: l'handover.** Nessuna delle 23 scalette calcola alcunché a partire da Construction Start (§3.2). Ma questo descrive il sistema com'è, non ciò che serve.

**Per collocare le attività, ne servono otto o nove** (§3.3), e stanno su due lati: prima del cantiere — lancio gara, aggiudicazione, progetto definitivo — e durante — prontezza impianti, involucro chiuso, sito pronto per i test. Sono le stesse in tutte le scalette e non dipendono dal tipo di cantiere.

Non vanno però trattate allo stesso modo. Quelle **subite** (gara, aggiudicazione, prontezza, handover) stanno sul cantiere condiviso perché riguardano più servizi insieme. Quelle **decise** dal PM restano sue, con un vincolo di precedenza dichiarato che genera un avviso quando viene violato. È un controllo di coerenza, non un ricalcolo, e costa molto meno.

**Sulla fatturazione c'è ora una risposta parziale, ed è la più utile di tutte.** Per i servizi di supporto in cantiere vanno redatti **report mensili**: le tre scalette GC Support hanno «FGB Construction Report No. 1, 2, 3 Issued» più «Further FGB Construction Reports (as needed)». Se il cantiere si prolunga di un mese, è un report in più, e quindi fatturazione addizionale.

Questo è il collegamento diretto fra slittamento del cantiere e ricavo che il cruscotto direzionale cerca, ed è calcolabile: **numero di report = durata del cantiere in mesi**, cioè funzione di Construction Start e Handover. Quando l'handover si sposta di 45 giorni, il sistema può dire "+1 report" e, se il prezzo unitario è noto, anche quanto vale. La voce di registro della modifica (§4.8a) diventa così direttamente monetizzata invece che solo cronologica.

**Il modello attuale non sa esprimerlo, e va esteso.** Tre passi fissi più un «as needed» che raccoglie tutto il resto non sono una serie ricorrente: sono un elenco tarato su una durata presunta. Un cantiere di dieci mesi produce dieci report dentro un contenitore che ne prevede tre più un jolly, e il conteggio reale — cioè il numero da fatturare — finisce fuori dal sistema. La specifica di come modellarlo è in **§3.5**: un tipo di passo nuovo, la serie ricorrente, con generazione, rigenerazione non distruttiva e doppio conteggio contrattuale/proiettato.

**Ne discende anche una correzione al §3.2.** Avevo scritto che Construction Start è una data che nessuno legge. È vero per il calcolo delle milestone, ma falso per la fatturazione: insieme all'handover definisce la durata, e quindi quanti report vanno prodotti e fatturati. Serve eccome, solo per un motivo diverso da quello che cercavo.

**Il resto è chiuso: si lavora a SAL.** La fatturazione segue gli stati di avanzamento, quindi non serve una regola separata per le certificazioni senza report mensili, e non serve modellare il monte ore come driver di fatturazione. Non servono nemmeno le fasi intermedie del cronoprogramma a scopo economico: la fase 2 (§2) resta giustificata solo dal bisogno del PM di collocare le proprie attività, non dalla fatturazione.

Lo spostamento dell'handover produce quindi due effetti, e solo due:

1. **Le attività di timeline che dipendono dall'handover si spostano** — con conseguente slittamento dei SAL a cui sono legate.
2. **Cambia il numero di report** dove la serie ricorrente è attiva, e quindi la fatturazione addizionale (§3.5).

Una conseguenza da tenere presente, che discende dal SAL e non da un'esigenza aggiuntiva: se l'avanzamento è la base della fatturazione, **marcare una milestone come completata diventa un fatto contabile**, non solo una nota di stato. Vale la pena decidere consapevolmente chi può farlo e se sia reversibile senza traccia, perché è il punto in cui un errore di compilazione del PM diventa un errore di fatturazione.

**5 · Il ritardo del cantiere deve spostare le nostre milestone?**
**Si spostano solo le attività collegate all'handover.** Non tutta la timeline: i passi che il PM decide (guidelines, training, kick-off) restano dove sono, coerentemente con la distinzione subite/decise del §3.3.1. La cascata è quindi più stretta di quanto potrebbe sembrare, e questo la rende anche meno rischiosa.

**Proposto, con conferma del PM. Non automatico.** Alcune date non sono elastiche — finestre di audit, scadenze d'ente, submission — e uno spostamento silenzioso le renderebbe impossibili senza che nessuno se ne accorga. La conferma lascia inoltre traccia di chi sapeva cosa e quando, che serve quando si negozia una proroga. L'anteprima prima di confermare — quali milestone si spostano, quali sforano un vincolo — è la funzione che rende il meccanismo utile al PM invece che un adempimento.

**Il ritardo nostro si ricalcola, non si congela.** Questa è la precisazione che mancava, e corregge il modo in cui avevo impostato gli indicatori. Se siamo in ritardo su una consegna e poi il cantiere slitta, **rientriamo nel range e il ritardo si chiude da solo**: il problema non è più tale, perché non lo è nei fatti. Se invece il cantiere resta fermo, il ritardo persiste ed è nostro.

Ne discende una regola precisa per il cruscotto: **il ritardo nostro va misurato sempre contro le date correnti del cronoprogramma, mai contro un piano congelato.** Un indicatore calcolato su una baseline fissa mostrerebbe rosso a un PM il cui problema si è appena risolto, e nel giro di poche settimane nessuno guarderebbe più quel semaforo.

Restano comunque due misure distinte e non fondibili — ritardo nostro e slittamento del cantiere — ma con un rapporto preciso fra loro: la seconda è un input della prima. Lo slittamento si misura contro la baseline contrattuale, perché lì la storia serve a negoziare; il ritardo nostro si misura contro il presente, perché lì serve a decidere cosa fare oggi.

**6 · Cosa vede il CEO?**
Non una riga per cantiere. **Una riga per sito**, espandibile a cantiere (se c'è) e certificazioni. Motivo: una vista radicata sul cantiere esclude i 427 progetti che non ne hanno, cioè il 38% del portafoglio, e rompe la coerenza con la dashboard cliente che è già su base sito. Il cantiere è un attributo di raggruppamento e un filtro, non la radice. Sopra la tabella, le liste di eccezione descritte nel documento precedente: contratti a rischio, vincoli in conflitto, dati stantii.

**7 · I servizi senza cantiere restano fuori?**
No, entrano con un asse loro. Sono metà del portafoglio e non ha senso escluderli. Si dividono in due famiglie con comportamenti diversi:

- **Edificio esistente, periodici a ciclo** — WELL Existing Building (195), LEED O+M (64), BREEAM In-Use Part 1 (35) e Part 2 (16), WELL HSR (9), WiredScore Occ. Sono sette scalette e oltre 320 progetti: non è un residuo, è il secondo blocco del portafoglio. L'asse è il periodo di certificazione — kickoff, performance period, submission, scadenza di ricertificazione — ed è già quello che fanno le loro scalette. LEED O+M lo dichiara esplicitamente con il passo «12 months Performance Period End», che è la sua ancora principale così come l'handover lo è per le scalette di cantiere.
- **Continuativi** — Energy Greeny (93), Air ClAir (5). Non hanno milestone ma cicli ricorrenti, ancorati al contratto o all'esercizio.

In nessuno dei due casi si inventa un cantiere. Nel Gantt del CEO compaiono con la corsia 0 etichettata diversamente e gli stessi indicatori di scostamento, che restano ben definiti perché misurati sul loro asse.

**8 · Chi tiene aggiornato il cantiere?**
Risposta data: **il PM.** L'admin gli passa i dati di base che vengono dalla quotazione — data prevista di handover, cioè la durata contrattuale, e il monte ore disponibile per la commessa — e tutto il resto della timeline è suo.

La risposta però risolve solo il caso a una certificazione. Nel caso multi-PM, che è quello che motiva l'intero progetto, si scompone in tre cose distinte:

**a · Chi può modificare il cantiere quando le certificazioni sono di PM diversi.**
**Decisione presa: scrittura condivisa, con registro.** Chiunque fra i PM agganciati può modificare una data di cantiere. È la scelta giusta: chi parla con il GC e scopre che le date sono cambiate deve poterlo scrivere subito, e un proprietario esclusivo introdurrebbe latenza esattamente nel momento in cui il dato vale di più. Il controllo non sta nel permesso, sta nella traccia.

Ogni modifica scrive una voce nella storia del cantiere, visibile nella canvas di tutte le certificazioni agganciate: *chi, quando, da quale data a quale data, e su quale fonte*. La fonte è il campo che evita l'unico rischio serio della scrittura condivisa — due PM che hanno parlato con interlocutori diversi e si sovrascrivono a vicenda. Con la fonte annotata, chi vede una data cambiata sa se ha informazioni più fresche o più vecchie, e il ping-pong si spegne da solo. Senza, la scrittura condivisa diventa l'ultimo che ha salvato.

La voce del registro non è un log tecnico: è **il documento su cui Payments negozia la proroga**. Deve quindi riportare anche lo scostamento in giorni e la nuova fine progetto stimata a confronto con la scadenza contrattuale, non solo le due date. Scritta così è direttamente utilizzabile in trattativa; scritta come semplice audit trail va ricostruita a mano ogni volta.

**Il limite da mettere.** La scrittura condivisa vale sul cantiere, non oltre. Lo spostamento di una data propone la cascata su tutte le certificazioni agganciate, ma **ogni PM conferma la propria**: PM-A non deve poter muovere le milestone di PM-B, che possono avere vincoli d'ente o finestre di audit che lui non conosce. È la stessa regola proposta-e-conferma della domanda 5, applicata al confine fra colleghi invece che al confine col cantiere.

**La notifica.** Ogni modifica avvisa i PM di tutte le certificazioni agganciate e l'admin, con l'elenco delle milestone che si spostano di conseguenza e l'impatto contrattuale. È la parte che impedisce alle discordanze di ripresentarsi in forma nuova: senza notifica, il cantiere condiviso è solo un modo più ordinato di essere disallineati.

**b · Chi vede cosa.**
**Regola: lettura ampia, scrittura stretta.** Il PM vede il cantiere e le altre timeline che vi insistono, comprese quelle dei colleghi, ma può modificare solo la propria. Le ragioni che dai sono due e sono entrambe buone: dare a tutti cognizione delle tempistiche generali dell'azienda, e permettere di rispondere in fretta a chi chiede senza dover passare da chi è titolare.

Va bene anche perché due certificazioni sullo stesso cantiere si contendono le stesse finestre di accesso: vedere quando il collega ha in programma la sua campagna di misura evita conflitti che altrimenti emergono in cantiere.

Resta una sola cosa da fissare: **fin dove arriva la lettura.** Tutti i siti dell'azienda, o solo quelli su cui il PM ha almeno una certificazione? La prima dà davvero la visione d'insieme che descrivi; la seconda è più conservativa e regge meglio se in futuro entrano clienti con vincoli di riservatezza. Sotto B la scelta è un parametro, non una riscrittura, quindi non è bloccante — ma va decisa prima di disegnare il Gantt PM, perché cambia cosa ci finisce dentro.

Sotto A la regola non è nemmeno esprimibile: il cantiere è un campo del sito, quindi chi legge il sito lo legge e la scrittura è tutto-o-niente. Sotto B sono entità separate con permessi separati, ed è quello che consente di separare lettura e scrittura in modo netto.

**c · Invitare altri PM a collaborare.**
Non credo esista già. La specifica descrive `PM` come un valore singolo sulla certificazione, propagato via trigger alla riga di monitoraggio insieme a nome e data di consegna: è un campo, non una relazione. Aggiungere la collaborazione significa una tabella di associazione certificazione↔utente con un ruolo (responsabile / collaboratore), e comporta una decisione a valle che va presa consapevolmente: **cosa si propaga alla riga di monitoraggio quando i PM sono due?** Oggi quel trigger copia un singolo nome. Da verificare prima di scrivere la tabella, non dopo.

---

## 5. Correzione al §10 della specifica

Le tre azioni sono presentate come indipendenti dalla forma scelta. Due non lo sono.

| Azione | Verdetto |
|---|---|
| **Riconciliare i nomi delle milestone** | **Sì, e per prima.** Ora è quantificato: **21 scalette dicono «Construction Start», solo 2 dicono «Construction Phase Start»** — WELL Core e WELL New Construction. Siccome il Gantt cerca letteralmente `"construction phase"`, la colonna Con. Start si popola su quelle due scalette e resta vuota su tutte le altre, LEED ID+C compreso, cioè su 587 progetti. Non è un residuo di generazione vecchia: è la maggioranza del portafoglio. Ed è la vista su cui stai per costruire il controllo di avanzamento. |
| **Dare un nome dichiarato alla fase di cantiere nelle scalette** | **Solo se scegli A o C.** Sotto B il Gantt legge l'entità cantiere e la stringa non viene più cercata da nessuno. Farlo prima di aver deciso è lavoro che getterai. |
| **Chiudere le 66 righe aria orfane** | **Sì, e in qualunque momento.** Qui la specifica è ottimista: dice che in un modello a cantieri diventano più facili da collocare, ma vale solo per quelle legate a un intervento. Le altre sono monitoraggio venduto senza certificazione e senza cantiere, e nessuno dei tre modelli le riguarda. Va deciso che una riga di monitoraggio possa vivere appesa al solo sito — che è una modifica a sé, non un effetto collaterale della scelta A/B/C. |

Aggiungo una quarta verifica, che è più grossa di come l'avevo classificata. **Tassonomia UE non è una scaletta a cui manca il cantiere: è una scaletta che può essere venduta in due modi diversi, e il modello ne conosce uno solo.**

Le versioni 7.1 e 7.2 si chiamano letteralmente Nuove Costruzioni e Ristrutturazioni Importanti, quindi il cantiere c'è eccome — ma non è necessariamente suo. Nel caso tipico la Tassonomia accompagna una LEED sullo stesso sito e potrebbe ereditarne il cronoprogramma. Ma **esiste anche da sola**, venduta a chi ha bisogno dell'allineamento tassonomico per finanziamenti o rendicontazione senza perseguire una certificazione ambientale.

**Ne discende che la relazione non si può decidere a livello di catalogo.** Non è vero né che «Tassonomia eredita sempre dalla LEED» né che «Tassonomia ha sempre un cronoprogramma proprio»: dipende dalla singola vendita. Il legame va quindi sulla singola certificazione, non sulla scaletta:

- se accompagna una madre, si aggancia a quella ed eredita il cronoprogramma — nessuna data duplicata;
- se è venduta da sola su un intervento, aggancia il cronoprogramma direttamente, come qualunque altra certificazione di cantiere;
- se è venduta da sola su un edificio esistente, non ha cronoprogramma e vive sul proprio asse.

Sotto il modello B i tre casi costano lo stesso: `cantiere_id` nullable più un riferimento facoltativo alla certificazione madre. È l'ennesimo argomento per cui il legame deve stare sull'istanza e non sul tipo.

**La verifica da fare, in una query:** quanti degli 8 progetti Tassonomia insistono su siti che hanno anche una LEED? Non serve a decidere la regola — quella ormai è chiara — ma a sapere quale dei tre casi è quello normale, e quindi quale proporre come default quando il PM crea il progetto.

**E apre una domanda più generale, che vale la pena porsi adesso.** Le entità su un sito non sono tutte dello stesso tipo. Ce ne sono almeno tre:

| Tipo | Condizione di esistenza | Esempi |
|---|---|---|
| Certificazione autonoma | Vive da sola | LEED ID+C, WELL EB, BREEAM In-Use |
| Satellite | Esiste solo se esiste una certificazione madre | Il monitoraggio creato da `trg_cert_quotation_approved` |
| Servizio autonomo | Venduto a sé, senza certificazione | Il monitoraggio delle 66 righe orfane; probabilmente Energy Audit |

Oggi il sistema conosce solo il primo e il secondo, e il secondo solo per il monitoraggio, tramite un trigger. Il terzo non ha rappresentazione — è la ragione per cui le 66 righe sono orfane. E la stessa scaletta può cambiare tipo a seconda della vendita: IAQ Testing è satellite dentro una WELL e autonomo se venduto da solo, e la Tassonomia si comporta allo stesso modo. Vale la pena chiedersi, prima di toccare `cert_timeline_steps`, quali fra GC Support, MEP/Envelope Commissioning, WELL PTA e IAQ Testing sono satelliti e quali sono venduti anche da soli, perché la risposta determina se ereditano il cantiere o se devono agganciarlo per conto loro.

---

## 6. Sequenza proposta

1. Riconciliare i nomi e sistemare il match del Gantt. Indipendente da tutto, sblocca la vista attuale.
2. Chiudere le due domande rimaste: quali scalette sono vendute anche da sole e quali solo appese a una madre (§5), e fin dove arriva la lettura del PM (domanda 8b). Tutte le altre hanno risposta.
3. Fase 1 del modello B: tabella `cantieri`, `cantiere_id` nullable sulle certificazioni, vincolo di precedenza sulle dodici scalette di cantiere. Nessun backfill.
4. Il passaggio di aggancio: quando una seconda certificazione nasce su un sito che ha già un cantiere, agganciarsi deve essere il percorso di default e crearne uno nuovo l'eccezione. È qui che si vince o si perde sulle discordanze.
5. Estendere gli anchor delle scalette per puntare all'handover del cantiere, in modalità proposta-e-conferma.
6. La serie ricorrente (§3.5): nuovo tipo di passo, generazione e rigenerazione non distruttiva, doppio conteggio contrattuale/proiettato. Va insieme al punto 5, perché è lo stesso motore di date.
7. Nessuna materializzazione in blocco. Le timeline si materializzano quando il PM compila, cantiere prima e certificazione poi.
8. Assegnare le 66 righe orfane, consentendo il monitoraggio appeso al solo sito. Scorporabile dal resto: non dipende dalla scelta del modello e può correre in parallelo dal punto 1.
9. Le viste, in parallelo dal punto 3 e non alla fine: dettaglio progetto con corsia cantiere, Gantt PM, Gantt Operations. Stessa schermata con perimetri diversi.
10. Vista CEO su base sito con le liste di eccezione.
