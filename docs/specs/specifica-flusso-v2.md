# Specifica Flusso v2 — Dal PM che apre il progetto all'admin in PROJECTS

**Questo documento è l'UNICA fonte di verità per flusso e interfaccia.** Sostituisce e assorbe: v1 §8, v1.1 §8 e §12, v1.2 §3–§7, v1.3 per intero. Restano in vigore, richiamati e non ripetuti: **v1** per modello dati, motore delle date, serie ricorrente e regole di dominio; **v1.2 §1** (mappa colori) e **v1.2 §2** (tipografia e anti-collisione), che valgono per ogni schermata descritta qui. In caso di dubbio tra documenti: vince questo.

---

## PARTE 0 — Divieti e regole trasversali

### 0.1 Divieti (verificabili con una ricerca nel codice o un giro in interfaccia)

| # | Divieto |
|---|---|
| V1 | **La timeline di default esiste, ma non è mai arbitraria.** Alla prima apertura la PROJECT TIMELINE si presenta già con l'**ossatura del template del tipo di progetto** — realistica e veritiera perché derivata dai file d'esperienza forniti (Boucheron per IDC, Vespucci + xlsx per il BDC completo, Metro per il BDC solo GC/Construction) — con le date vuote da compilare, tranne l'handover dalla Quotation. Ciò che è **vietato** è qualunque elenco generico non derivato dal tipo (il vecchio «Lancio gara d'appalto, Aggiudicazione GC, …» fuori contesto). L'ossatura è sempre integrabile: righe aggiungibili, eliminabili, importabili. |
| V2 | Nessuna etichetta «storico» o «stantio», da nessuna parte. |
| V3 | Nessun colore fuori dalla mappa token v1.2 §1. Project timeline sempre in scala pietra neutra; ogni servizio nella sua tinta; support in variante tratteggiata della madre; ambra solo per avvisi. |
| V4 | **Quando il PM compila la timeline di un servizio/certificazione, i passi da datare e da agganciare sono esclusivamente le milestone della scaletta di quella certificazione** — quella per cui sta generando la timeline. Mai milestone di altre scalette, mai attività estranee, mai dati di altri siti. Le uniche altre voci ammesse nella compilazione sono i bersagli dell'ancoraggio, cioè le righe della PROJECT TIMELINE di questo sito (§3.2). |
| V5 | Nessun pulsante disabilitato senza il motivo scritto accanto. |
| V6 | Nessuna perdita di dati uscendo da un passaggio: tutto ciò che è parziale è bozza ripristinabile. |
| V7 | Nessun testo sotto le soglie v1.2 §2, nessuna etichetta sovrapposta o troncata senza tooltip. |

### 0.2 Navigazione e ritorno

- **Breadcrumb sempre presente e cliccabile**: `Services / {Sito} / {Certificazione}`.
- **Wizard**: «Indietro» torna al passo precedente **conservando tutto**; la «X» chiude salvando bozza, e alla riapertura si riprende dal punto lasciato («Riprendi import (passo 2)»).
- **Tabelle**: salvataggio automatico per riga con toast «Salvato · Annulla» (undo singolo, 10s).
- Da ogni schermata si torna al livello superiore con un click, senza dialoghi di conferma se non c'è nulla da perdere.

### 0.3 Persistenza (regola madre)

La **PROJECT TIMELINE è un record unico per sito**. Creata da una qualunque certificazione, esiste per tutte. Nessuna schermata può mai ripresentarla vuota se esiste. Le modifiche sono condivise, registrate, notificate (v1 §3.5).

---

## FASE 1 — Il PM apre un progetto assegnato

### 1.1 Elenco «My Projects»

Il PM vede le card dei progetti a lui assegnati. Ogni card: **sito** (nome, città), **cliente**, **tipo di progetto** (Design+Construction / Construction / Existing), **la sua certificazione** (tag nella tinta del servizio), e uno **stato di compilazione** a tre valori: `Da iniziare` (nessuna timeline), `Project timeline pronta` (manca la sua HQ FGB), `Timeline completa`. Click sulla card → Fase 1.2.

### 1.2 Pagina progetto — struttura e stati di apertura

Header: sito · cliente · tipo · certificazione aperta · PM. Corpo su due colonne: a sinistra le sezioni **① PROJECT TIMELINE** e **② HQ FGB TIMELINE** (insieme ≤60% larghezza), a destra il **pannello timeline** (≥360px, sticky, alto quanto la viewport; tap → overlay a tutta viewport con zoom +/−/Adatta). Sotto ~1100px il pannello diventa striscia richiudibile sopra le sezioni.

Cosa si vede all'apertura, senza eccezioni:

| Project timeline del sito | Sezione ① | Sezione ② |
|---|---|---|
| Non esiste | Stato vuoto di scelta (§2.1) | **Bloccata**, con la frase: «Si sblocca compilando la project timeline» (solo per tipi con cantiere; per EXISTING la ① non esiste e si parte dalla ②) |
| Esiste (creata da chiunque) | **Riepilogo compatto collassato**: tipo, n. eventi, prima data, handover, ultimo aggiornamento e da chi · azione «Apri / Modifica» | Attiva: se la HQ del PM non è mai stata generata → §3.1; se esiste → tabella compilata (§3.2) |

**Mai** il form della ① aperto e vuoto se il record esiste. **Mai** la ② che mostra scalette altrui.

---

## FASE 2 — Sezione ① PROJECT TIMELINE

### 2.1 Prima apertura (il sito non ha ancora la timeline)

La sezione ① si apre **già popolata con l'ossatura del template del tipo di progetto** (§2.2): righe realistiche derivate dai file d'esperienza, date vuote da compilare, handover precompilato dalla Quotation. In testa alla tabella, una fascia dichiara cosa sta succedendo:

> *«Ossatura {tipo} precaricata — compila le date, aggiungi o elimina righe, oppure **importa il cronoprogramma da file** per integrarla o sostituirla.»*

con il pulsante **«Importa da file»** bene in vista accanto. L'ossatura non è ancora salvata come record del sito: lo diventa al primo salvataggio (date inserite o righe modificate). Regola d'import sull'ossatura intatta: se il PM importa **senza aver toccato nulla** (nessuna data oltre l'handover, nessuna riga modificata), l'import **sostituisce** l'ossatura; se l'ha già lavorata, l'import **integra** per evento con il diff (§2.3, passo 2).

### 2.2 Il template del tipo

L'ossatura precaricata è **il template del tipo** (contenuti definiti in v1.1 §4, derivati dai file reali):

- **IDC** → Kick-off, SD, DD, CD, Tender, Pre-construction (preparazione, produzione millwork, trasporto), Construction start, Mid-construction, Construction end, Handover, Opening, Snag list.
- **Design+Construction** → famiglie Design / Permitting / Construction / Terze parti: concept, developed, detailed design; permessi (submission→approvazione); tender; long-lead; consegna aree; construction start; strutture/involucro; impianti; finiture; commissioning; handover.
- **Construction** → da consegna aree a consegna lavori/handover.
- **EXISTING** → la sezione ① non esiste.

Le righe arrivano **senza date**, tranne **Handover = data dalla Quotation** (baseline, fonte precompilata «Quotation», stato `inserita`). Le ancore FGB sono marcate ●. Il PM data le righe che gli servono, elimina le altre (cestino di riga + selezione multipla), aggiunge le proprie: è un'ossatura da cui partire, mai una gabbia.

### 2.3 Import da file — wizard a schermo intero, 3 passi

**Passo 1 · Carica.** Drag&drop grande; formati; una riga di spiegazione («Estraggo attività e date; tu scegli cosa tenere»). Se il file ha **durate relative** (es. xlsx in mesi): il sistema lo dichiara e chiede la **data di ancoraggio** della prima fase prima di procedere.

**Passo 2 · Rivedi ed escludi.** Due colonne: sinistra ~45% tabella righe estratte, destra ~55% **timeline verticale grande** aggiornata in tempo reale.
- **Ogni riga estratta porta le sue date** (inizio/fine). Una riga estratta senza data riconosciuta è marcata «data mancante» in ambra con i campi editabili in linea: **l'estrazione che non popola le date è un difetto, non un comportamento accettabile.** Valori attesi per fixture in §6 (script) — verificabili.
- Istruzione fissa in testa: «Togli la spunta alle attività che non servono alla certificazione: spariscono dalla timeline a destra.»
- Selezione: checkbox + click sull'intera riga; azioni di massa; escluse visibili barrate (anche in timeline, in traccia smorzata); contatore vivo «26 incluse · 4 escluse».
- Mapping ancora per riga: select «ancora ▾» precompilata dal riconoscimento (IT/EN); l'handover che diverge dalla Quotation è segnalato in ambra qui e nel footer, con la regola scritta: «la Quotation resta baseline; questa diventa la data corrente».

**Passo 3 · Conferma.** Riepilogo: n righe, ancore risolte, divergenze. **Pulsante**: footer fisso, etichetta parlante («Conferma e inserisci 26 righe»); attivo se ≥1 riga inclusa e handover risolto (mappato, o scelta esplicita «mantieni handover da Quotation»); se disattivo, **motivo scritto accanto**; al click salva, chiude, torna alla ① popolata, toast «26 righe inserite». Errori mostrati con «Riprova». Re-import su timeline esistente = diff per evento (nuove/spostate/rimosse), mai sostituzione.

### 2.4 Tabella di compilazione

Colonne: Fase/milestone (● se ancora) · Inizio · Fine · Fonte (icona con tooltip, editabile al click, **facoltativa**) · Stato (pallino: inserita / da confermare / confermata). Righe ~40px. Ogni digitazione aggiorna il pannello timeline (nodo che appare/si sposta, v1 §8.2 comportamenti). Autosave con undo (§0.2).

### 2.5 Dopo il salvataggio

La ① collassa nel **riepilogo compatto** e la ② si sblocca. Da qui in poi, chiunque apra qualunque certificazione del sito trova questo riepilogo (§0.3).

---

## FASE 3 — Sezione ② HQ FGB TIMELINE

### 3.1 Generazione

Un solo pulsante: **«Genera dalla scaletta {nome certificazione}»** — la scaletta è quella della **certificazione aperta** (dal suo `timeline_key` in catalogo), con i suoi passi reali (FGB-timeline-certificazioni.pdf). Divieto V4: mai passi d'altro.

### 3.2 Tabella passi

Colonne: # · Passo · Natura · Data · **Ancorato a** · Fatto.

| Natura | Data | Ancorato a |
|---|---|---|
| PM | input editabile | vincolo se previsto («prima di: Tender») con avviso ambra alla violazione, in tabella e sulla timeline |
| Ereditata | sola lettura, dal record di progetto | «← Handover · project timeline» (sola lettura) |
| Calcolata | sola lettura, ricalcolata | «Handover + 60gg ▾» — ancora e offset **modificabili** |
| Auto | «—» finché il dato sorgente non esiste | sorgente dichiarata («da spedizione») |
| Serie ricorrente | occorrenze generate (v1 §5) | «mensile · da Construction start a Handover» |

**Scoping dell'ancoraggio (il punto sbagliato oggi):** il menu «Ancorato a ▾» elenca **esclusivamente le righe della PROJECT TIMELINE di questo sito**, nell'ordine in cui vi compaiono, ciascuna con la sua data accanto. Non passi di certificazione, non righe di altri siti, non ancore astratte.

**Evidenziazione bidirezionale:** hover/focus su un passo ② accende la riga ① a cui è ancorato e il connettore sul pannello timeline; selezionando una riga ① si accendono tutti i passi che vi pendono.

### 3.2.1 L'esperienza di ancoraggio (modello Microsoft Project, semplificato)

L'ancoraggio è il gesto centrale del prodotto e non può presupporre gergo: il PM deve capire **cosa sta collegando e cosa succederà dopo**, prima di confermare. Il riferimento è il collegamento predecessore/successore di Microsoft Project — freccia disegnata subito, data ricalcolata subito, distinzione visiva fra date collegate e date manuali — ridotto al nostro caso (un'ancora + un offset in giorni, niente tipologie FS/SS).

1. **Il linguaggio è una frase, non un codice.** Il controllo non mostra «H+60» ma compone: *«Si calcola da: **Handover** (15 mar 27) **+ 60 giorni** → **14 mag 27**»*. Ancora, offset e **data risultante in anteprima** sono visibili e aggiornati mentre si sceglie, **prima** di applicare: la conseguenza del gesto si vede in anticipo, non si scopre dopo.
2. **Il selettore mostra bersagli veri.** «Si calcola da ▾» apre l'elenco delle righe della PROJECT TIMELINE del sito, ordinate come in tabella, ognuna con la sua data. Passandoci sopra, il nodo corrispondente **pulsa sul pannello timeline** e il connettore appare in bozza tratteggiata: si vede dove si sta agganciando.
3. **L'offset è uno stepper in giorni** (−/valore/+) con la data risultante che si aggiorna a ogni scatto.
4. **Alla conferma, feedback immediato e triplo:** il connettore si disegna definitivo sulla timeline (tratteggio grigio se ereditata, tinta del servizio con etichetta +Ngg se calcolata), la colonna Data mostra la nuova data **nella tinta del servizio con l'icona catena ⛓** — è così che una data collegata si distingue a colpo d'occhio da una scritta a mano — e sotto la riga compare per qualche secondo la frase di conseguenza: *«D'ora in poi, se l'Handover si sposta, questa data si ricalcola da sola.»*
5. **Sganciare è possibile, ma spiegato.** Su ogni passo ancorato, l'azione «Sgancia» converte la data calcolata in manuale **mantenendo il valore corrente**, con avviso esplicito prima di procedere: *«Questa data non si aggiornerà più quando il progetto si sposta. Potrai riagganciarla in ogni momento.»* Il passo sganciato perde la catena e il colore, come un'attività a pianificazione manuale in MS Project. «Riaggancia» riapre il selettore del punto 2.
6. **Collegamento col trascinamento (miglioria, non prima consegna):** nell'overlay a schermo intero, trascinare dal nodo di una riga di progetto a un passo della certificazione crea l'ancora e apre lo stepper dell'offset — il gesto delle frecce di MS Project. Il percorso da tabella dei punti 1–5 resta quello primario e sempre disponibile.
7. **Prima volta:** un suggerimento contestuale una-tantum sul primo passo calcolato («Questa data è collegata all'Handover: tocca la catena per vedere o cambiare il collegamento»), chiudibile e mai più riproposto.

Spuntare «Fatto» = fatto di SAL (v1 §3.8): tracciato, annullabile con traccia.

### 3.3 Le altre certificazioni del sito

Sotto la ②, in sola lettura, le HQ timeline delle altre certificazioni del sito (tinta propria, nome del PM, lucchetto). Servono a vedere le finestre dei colleghi, non si toccano.

### 3.4 Modifiche successive alle date di progetto

Si fanno **in linea nella ①** (aperta dal riepilogo). Cambio data → **anteprima cascata**: elenco «si spostano» (solo i passi ancorati a quella riga, di tutte le certificazioni del sito) / «non si spostano» (passi decisi), verdetto contrattuale se la riga è l'handover, chi verrà notificato → Conferma → registro con la **riga effettivamente modificata** nominata (derivati economici solo su handover/durata), notifiche, e i passi dei colleghi in stato «in attesa di conferma di {PM}».

---

## FASE 4 — Cosa vede l'admin in PROJECTS

### 4.1 Testata

Nell'ordine, dall'alto: **KPI** (4 card cliccabili-filtro: Certificazioni in corso «su N progetti · M siti» · Da attenzionare con scomposizione ritardo timeline / estensione necessaria / ritardo pagamento-solo-se-integrato · On Hold · Certified) → **barra filtri** (ricerca libera + multi-select Certification, Typology, Region, Status, PM; chip rimovibili; stato nell'URL) → **tabella** con header **sticky**.

Regola «in ritardo di timeline»: almeno una milestone in carico a FGB, non completata e non opzionale, con data corrente anteriore a oggi di oltre 5 giorni lavorativi (misurata sulle date correnti: il rientro per slittamento chiude il ritardo).

### 4.2 Tabella

Colonne: Client · City · Project · Country · Region · Certifications (tag nelle tinte servizio) · Typology · Handover (data corrente; se diverge dalla baseline, «+46g» discreto) · **PM** · Status (Design/Construction/Certification in scala pietra · **Certified** inchiostro · On Hold outline tratteggiato; sempre derivato, On Hold unico manuale con motivo).

### 4.3 Drill-down (click sulla riga) — perché stavolta si capisca

1. **Colonna sinistra congelata** (~160px): quadratino tinta + nome servizio + PM, su righe proprie. Le barre iniziano **dopo** la colonna: nessun testo sopra le barre.
2. **Asse temporale in testa, sticky** (anni/trimestri; mesi se lo zoom lo consente).
3. **Prima corsia: Project**, tre segmenti in scala pietra con l'etichetta della fase dentro il segmento e la **data sotto ogni giunzione**; dalle giunzioni scendono **separatori tratteggiati attraverso tutte le corsie** — è così che si vede dove finisce una fase e ne inizia un'altra.
4. **Una corsia per servizio nella sua tinta** (support tratteggiati); milestone come tacche con etichette secondo v1.2 §2 (due righe alternate → collasso con tooltip → toggle che alza la corsia); serie ricorrenti come tacche fitte + etichetta cumulativa.
5. **Corsie vuote**: barra sottile smorzata «timeline non compilata».
6. **Navigazione**: toggle **Adatta / Scorri** + zoom + «Oggi»; in Scorri, colonna sinistra e asse restano fermi; apertura in Adatta, o in Scorri centrato sull'oggi se Adatta scenderebbe sotto la densità leggibile.
7. **Linea dell'oggi** sempre visibile. Doppio click su una corsia → dettaglio sito.

---

## §5 — Matrice dei ritorni

| Da | «Indietro» / chiusura porta a | Cosa si conserva |
|---|---|---|
| Wizard import, passo 2 o 3 | passo precedente / bozza + ritorno alla ① | tutto: file, selezioni, mapping |
| Overlay timeline | pagina progetto, stesso scroll | — |
| Modifica ① aperta dal riepilogo | riepilogo compatto | autosave + undo |
| Anteprima cascata | tabella, nessuna modifica applicata | — |
| Drill-down PROJECTS | tabella, riga ancora evidenziata | filtri (URL) |

---

## §6 — Script di collaudo end-to-end (è anche il copione della demo)

Da eseguire in ordine; ogni passo ha l'esito atteso. Dati: sito A «Palazzo Aurora» (Design+Construction, LEED BD+C→Marco, WELL NC→Sara), sito B «Metro Pontedera» (Construction, LEED GC Support→Marco), sito C (Existing, WELL EB).

1. Marco apre il sito A da My Projects → ① **già popolata con l'ossatura del template Design+Construction** (famiglie Design/Permitting/Construction/Terze parti), tutte le righe senza data tranne Handover 15/03/27 · Quotation; fascia esplicativa e pulsante «Importa da file» visibili; ② bloccata con motivo scritto.
2. Verifica dell'ossatura: le righe sono quelle del template BDC (Vespucci + xlsx), non l'elenco generico vietato dal V1; le ancore ● sono marcate.
3. Elimina due righe di template, ne aggiunge una manuale, data quattro righe → il pannello a destra si popola nodo per nodo; undo su una modifica funziona.
4. Salva → ① diventa riepilogo compatto; ② si sblocca.
5. «Genera dalla scaletta LEED BD+C» → i 13 passi reali della scaletta, e solo quelli. Construction start e Handover ereditati in sola lettura.
6. Apre «Si calcola da ▾» su un passo calcolato → il menu elenca **le righe della ① del sito A** con le date; passando sulle opzioni, il nodo pulsa sulla timeline con il connettore in bozza; sceglie l'ancora, regola l'offset con lo stepper e vede la **data risultante in anteprima prima di confermare**; alla conferma la data appare in tinta con l'icona ⛓, il connettore si disegna e compare la frase di conseguenza. «Sgancia» mostra l'avviso, mantiene il valore e toglie catena e colore; «Riaggancia» funziona.
7. Mette la data delle Design Guidelines dopo il Tender → avviso ambra in tabella e sulla timeline; la corregge → l'avviso sparisce.
8. Apre il sito B → ① già popolata con l'ossatura Construction (template Metro); senza toccarla, preme «Importa da file» → carica il gantt Metro → l'import sostituisce l'ossatura intatta → passo 2: **~30 righe con le date popolate** (attese: Consegna aree 22/04/24; Impianti elettrici/meccanici 29/08/24→01/01/25; Consegna lavori 15/03/25 mappata su Handover). Esclude «Celle frigo» e «Guardiania» → spariscono dalla timeline a destra, contatore aggiornato.
9. Preme «Indietro» dal passo 3 al 2 → selezioni e mapping intatti. Chiude con la X → alla riapertura «Riprendi import (passo 2)».
10. Conferma → toast, ① popolata; il pulsante era attivo con etichetta parlante (o, se disattivato ad arte togliendo il mapping handover, mostra il motivo accanto).
11. Sara apre il sito A → ① **già compilata, in riepilogo**; genera la sua WELL NC; sotto vede la LEED di Marco in sola lettura, tinta LEED.
12. Marco modifica l'handover del sito A in linea nella ① (30/04/27, fonte gantt) → anteprima: si spostano solo i passi ancorati all'handover di entrambe le certificazioni; verdetto contrattuale; conferma → registro nomina «Handover», voce monetizzata; i passi di Sara «in attesa di conferma di Sara B.».
13. Import xlsx greco su un progetto di prova → il wizard chiede la data di ancoraggio e converte i mesi in date.
14. Admin apre PROJECTS → KPI in testa; click su «Da attenzionare» filtra la tabella e appare il chip del filtro; header sticky durante lo scroll.
15. Espande il sito A → colonna sinistra ferma, corsia Project a segmenti con date alle giunzioni e separatori che attraversano le corsie LEED (verde) e WELL (blu); WELL EB del sito C, se espanso, mostra la corsia senza project timeline correttamente.
16. Toggle Scorri → trascina, «Oggi» riporta alla linea rossa; nessuna etichetta sovrapposta in nessuna delle due modalità.

---

**Prossimo passo:** al tuo ok su questo documento, costruisco la **demo HTML interattiva** che replica esattamente le Fasi 1–4 e ti permette di eseguire lo script §6 punto per punto, così il collaudo dell'implementazione di Claude Code diventa un confronto uno-a-uno con la demo approvata.
