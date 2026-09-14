# Specifica v1.1 — Rinomine, tipi di progetto, import OCR, revisioni UI

**Destinatario:** Claude Code. Si legge **insieme** a `specifica-cronoprogramma-v1.md`: dove le due divergono, **vince questa**. I punti della v1 sostituiti sono elencati in §11.
**Nuovi allegati:** quattro file reali che fanno da fixture di test per template e import (§10).

---

## 1. Glossario e rinomine

Rinomine di etichetta in tutta l'interfaccia (navigazione, titoli, breadcrumb, notifiche). Gli identificatori interni possono restare o allinearsi, ma la scelta dev'essere una e coerente, documentata in un glossario nel repo.

| Dove | Oggi | Diventa |
|---|---|---|
| Admin · sezione | CANTIERI | **PROJECTS** |
| Admin · sezione | OPERATIONS | **SERVICES** |
| PM · My Project · Configurazione progetto | Cronoprogramma | **PROJECT TIMELINE** |
| PM · sezione oggi intitolata con il nome della certificazione | — | **HQ FGB TIMELINE** |

La parola "cantiere/cronoprogramma" non deve più comparire come nome di sezione; può restare nel testo descrittivo dove serve ("timeline di cantiere fornita dal GC").

---

## 2. Tipi di progetto

Il progetto ha un **tipo**, scelto alla configurazione (proposto in automatico dal catalogo della certificazione, modificabile). Il tipo determina cosa contiene la PROJECT TIMELINE e se esiste.

| Tipo | Cosa copre la PROJECT TIMELINE | Esempio reale allegato | Certificazioni tipiche |
|---|---|---|---|
| **DESIGN+CONSTRUCTION** | Progettazione, permessi e realizzazione | `20260209_GW_ΧΔ_Έργου_R2.xlsx`, `20260623_Grand_Vespucci_Cronoprogramma_ENG_REV02.pdf` | BD+C, WELL NC, ID+C completi |
| **CONSTRUCTION** (consulenza al GC) | Sola fase di costruzione | `GANTT_-_LCP_METRO_Pontedera_PI__R01.pdf` | GC Support, Cx, ID+C su cantiere altrui |
| **EXISTING** | **Nessuna PROJECT TIMELINE**: si va direttamente alla timeline della certificazione/servizio | — | LEED O+M, BREEAM In-Use, WELL EB, HSR |

Regole:
- Il **gate di precedenza** (v1 §3.1) vale per DESIGN+CONSTRUCTION e CONSTRUCTION; per EXISTING non esiste e il PM entra direttamente nella HQ FGB TIMELINE.
- Questo **sostituisce** la decisione v1 §2.1 «non serve un campo tipo»: il tipo ora è strutturale, ma determina *quali fasi vengono proposte e se la timeline esiste*, non lo schema dei dati (la lista ordinata di eventi resta identica per tutti).
- Un solo esemplare di PROJECT TIMELINE per sito, condiviso da tutte le certificazioni che vi insistono (invariato). L'**handover arriva da Quotation-Operations** e resta la baseline contrattuale (invariato).

---

## 3. PROJECT TIMELINE — contenuto e campi

- Lista ordinata di eventi/fasi: `nome`, `data_inizio`, `data_fine` (le fasi hanno durata; le milestone hanno inizio=fine), `fonte`, `aggiornata_il`, `stato` (inserita / da confermare / confermata).
- **`fonte` NON è obbligatoria** — né qui né nel registro. Resta consigliata e l'interfaccia la chiede, ma non blocca il salvataggio. *(Sostituisce v1 §3.5 «fonte obbligatoria».)*
- Alla creazione il sistema propone il **template standard del tipo** (§4); il PM lo modifica, cancella le righe superflue, o parte dall'**import OCR** (§5).
- Le ancore FGB (quelle a cui la HQ FGB TIMELINE si aggancia) sono marcate come tali sulle righe; il PM può marcare/smarcare, ma l'handover è sempre ancora.

---

## 4. Template standard

Derivati dai file reali allegati. Sono **proposte di compilazione**, non schemi: il PM aggiunge, toglie, rinomina. Le righe marcate ● sono ancore FGB di default.

### 4.1 Template IDC (retail fit-out) — da `bou_almathy.png` (Boucheron Almaty)

| Fase / milestone | Natura |
|---|---|
| Kick-off (criteria package, store committee) | fase ● |
| Schematic Design (SD) | fase |
| Design Development (DD) | fase |
| Construction Documents (CD) | fase ● (fine CD = design freeze) |
| Tender | fase ● (chiusura = aggiudicazione) |
| Pre-construction: preparazione GC, produzione millwork/fixtures, trasporto | fase |
| Construction start | milestone ● |
| Mid-construction | milestone |
| Construction end | milestone ● |
| **Handover** | milestone ● (da Quotation) |
| Opening | milestone ● |
| Snag list | fase |

### 4.2 Template BDC (DESIGN+CONSTRUCTION) — da Grand Vespucci + xlsx greco

Quattro famiglie di fasi, come nella legenda del file greco: **Design · Permitting · Construction · Terze parti.**

| Fase / milestone | Famiglia | Natura |
|---|---|---|
| Concept design + review | Design | fase |
| Developed design (RIBA st.3) + review | Design | fase ● (fine = design freeze) |
| Detailed design (RIBA st.4) + review | Design | fase |
| Permessi: submission → approvazione (SCIA / building permit / ambientali) | Permitting | fase ● (ottenimento permesso) |
| Iter terze parti (soprintendenza, municipalità, enti) | Terze parti | fase |
| Tender / D&B tendering | Design | fase ● (aggiudicazione) |
| Long-lead procurement | Construction | fase |
| Mobilisation / consegna aree | Construction | milestone ● |
| Construction start | Construction | milestone ● |
| Strutture / involucro | Construction | fase |
| Impianti (fine = impianti pronti per test) | Construction | fase ● |
| Finiture | Construction | fase ● (fine = sito pronto per test) |
| Commissioning | Construction | fase |
| Consegna lavori / **Handover** | Construction | milestone ● (da Quotation) |

### 4.3 Template CONSTRUCTION — da Metro Pontedera

Sottoinsieme del 4.2: da *consegna aree di cantiere* a *consegna lavori/handover*, senza famiglie Design/Permitting.

---

## 5. Import della timeline via OCR / parsing (funzione nuova)

Oggi manca; va integrata nella creazione/aggiornamento della PROJECT TIMELINE.

### 5.1 Flusso

1. **Upload** di PDF, immagine (png/jpg) o xlsx nella finestra dedicata della PROJECT TIMELINE.
2. **Estrazione** per formato: PDF con layer testo → parsing testuale (Vespucci e Metro lo hanno); immagine o PDF scansionato → OCR; xlsx → parsing diretto, niente OCR.
3. **Proposta**: il sistema restituisce una tabella di attività candidate (nome, inizio, fine, durata) e propone il **mapping sulle ancore FGB** dove riconosce i nomi (handover, construction start, tender, consegna aree…). Il riconoscimento dev'essere **multilingua almeno IT/EN** (i file reali sono in entrambe; il greco arriva via xlsx quindi senza OCR) e tollerante alle varianti («Consegna lavori», «Handover», «Construction end»).
4. **Revisione del PM — obbligatoria**: schermata di conferma in cui il PM corregge date e nomi, **elimina le attività superflue** ai fini della certificazione perseguita (checkbox di riga + «elimina selezionate»), conferma o cambia il mapping delle ancore. **Nulla entra nella PROJECT TIMELINE senza questa conferma.**
5. **Integrazione per evento, mai per sostituzione** (invariato da v1 §2.3): un re-import non azzera le righe esistenti; propone differenze (nuove, spostate, rimosse) e il PM sceglie.

### 5.2 Criteri di qualità

- **Durate relative → date assolute.** Alcuni cronoprogrammi (es. la fixture xlsx greca) esprimono le fasi come durate in mesi, non come date. L'import deve riconoscere il caso e chiedere al PM **una data di ancoraggio** (tipicamente l'inizio della prima fase) da cui calcolare tutte le altre; le righe così generate sono marcate come derivate dall'ancoraggio, e se il PM cambia l'ancoraggio prima della conferma si ricalcolano.
- L'estrazione è un acceleratore: se fallisce o è parziale, il PM prosegue a mano senza vincoli. Mai bloccare sul risultato OCR.
- Ogni riga importata porta `fonte` precompilata (nome file + data) — modificabile, non obbligatoria.
- I quattro file allegati sono le **fixture di accettazione** (§10): l'import deve estrarne le attività principali e proporre il mapping corretto delle ancore evidenziate in §4.

---

## 6. HQ FGB TIMELINE

- Rinomina della sezione che oggi porta il nome della certificazione.
- Testo di aiuto nella sezione: *«La FGB timeline integra il cronoprogramma di progetto con le milestone della/e certificazione/i che inserisci tu.»*
- Comportamento: mostra la PROJECT TIMELINE come corsia di riferimento e sopra/sotto le milestone di **tutte** le certificazioni del sito (le proprie editabili, le altrui in sola lettura — invariato da v1). Generazione dalla scaletta, ereditarietà di construction start e handover, vincoli di precedenza: tutto invariato da v1 §3.2, §4.

---

## 7. Rimozione della sezione «Nuove date»

Il passo 3 della demo (**«Il GC comunica nuove date»**) **sparisce come sezione separata**. L'aggiornamento delle date avviene **modificando direttamente le righe della PROJECT TIMELINE**. La meccanica proposta-e-conferma resta identica ma si innesca dalla modifica in linea: cambio una data → anteprima della cascata (cosa si muove, cosa no, impatto contrattuale, chi viene notificato) → conferma → registro. Vale per qualunque riga, non solo per l'handover.

---

## 8. Registro — correzione

Difetto rilevato nella demo: il registro riporta sempre «handover» anche quando si sposta un'altra milestone.

Correzione: **la voce di registro nomina la riga effettivamente modificata** — *«Marco R. ha spostato "Impianti pronti per test" dal 20 nov 26 al 12 dic 26»*. I derivati economici (scostamento vs baseline, fine stimata vs contratto, variazione report) si calcolano e si mostrano **solo quando la modifica riguarda l'handover o cambia la durata** costruttiva; per le altre righe la voce riporta modifica, eventuale fonte e milestone di certificazione impattate.

---

## 9. Grafico laterale (anteprima viva) — revisione

Sostituisce il layout descritto in v1 §8.2, di cui restano validi i comportamenti (milestone che appaiono alla digitazione, si spostano con transizione, vincoli in ambra, focus bidirezionale, riuso nell'anteprima cascata, `prefers-reduced-motion`).

- **Orientamento verticale**: asse del tempo dall'alto in basso, mesi come tacche, milestone come nodi etichettati a lato. Regge liste lunghe e il mobile meglio dell'orizzontale.
- **Due stati.** *Compatto*: colonna stretta (~140–180px) accanto al form, sticky, sempre visibile mentre si compila; mostra nodi e date in forma abbreviata. *Espanso*: tap/click sul grafico → overlay a schermo intero con zoom (pinch su touch, rotellina/bottoni su desktop), date complete e leggibili, corsie affiancate (PROJECT TIMELINE + certificazioni) e chiusura esplicita.
- **Le date devono essere chiare** in entrambi gli stati: nel compatto almeno gg/mm sui nodi ancora; nell'espanso data completa su ogni nodo.
- **Cura grafica richiesta esplicitamente**: è l'elemento su cui spendere il design. Il riferimento visivo approvato è **`riferimento-visivo-timeline.html`**: scala temporale reale sull'asse verticale, fasi come barre e milestone come nodi sulla stessa spina, corsie Project e HQ FGB affiancate con i connettori di ereditarietà (tratteggio grigio) e di calcolo (viola, con etichetta +Ngg), semantica dei nodi da legenda (fatta / del PM / calcolata / ereditata / da confermare), linea dell'oggi e linea della scadenza contrattuale con il margine indicato. Replicare questa grammatica visiva, non reinventarla.

---

## 10. Fixture di test

| File | Tipo di progetto | Formato → estrazione | Cosa deve saperne fare l'import |
|---|---|---|---|
| `bou_almathy.png` | IDC | Immagine → OCR | Estrarre le fasi Kick-off→Snag list con date; mappare Construction start/end, Handover, Opening |
| `20260623_Grand_Vespucci_Cronoprogramma_ENG_REV02.pdf` | DESIGN+CONSTRUCTION | PDF testuale → parsing | Estrarre fasi di permitting/design; riconoscere submission/approvazioni e «latest start date for the works» |
| `20260209_GW_ΧΔ_Έργου_R2.xlsx` | DESIGN+CONSTRUCTION | xlsx → parsing diretto | Leggere stages+durate in mesi; riconoscere le famiglie dalla legenda; Commissioning e Construction |
| `GANTT_-_LCP_METRO_Pontedera_PI__R01.pdf` | CONSTRUCTION | PDF testuale → parsing | Estrarre F1–F4; mappare «Consegna aree di cantiere» e «Consegna lavori» (=handover) |

---

## 11. Punti della v1 sostituiti da questa revisione

| v1 | v1.1 |
|---|---|
| §2.1 — nessun campo `tipo` | §2 — tipo di progetto a tre valori, determina template e presenza della PROJECT TIMELINE |
| §3.5 — fonte obbligatoria nel registro | §3 — fonte facoltativa ovunque, consigliata |
| §8.1 passo 3 — sezione «aggiornamento date» dedicata | §7 — modifica in linea nella PROJECT TIMELINE, stessa meccanica |
| §8.2 — pannello laterale orizzontale a due colonne | §9 — mini-grafico verticale compatto + overlay zoom |
| Nomenclatura «cronoprogramma» nelle UI | §1 — PROJECT TIMELINE / HQ FGB TIMELINE / PROJECTS / SERVICES |

Tutto il resto della v1 (gate, ereditarietà, doppio handover, registro monetizzato sull'handover, serie ricorrente, cascata proposta-e-conferma, niente backfill, viste CEO, anti-requisiti, decisioni aperte §11) resta in vigore.

---

## 12. Vista admin PROJECTS (aggiunta)

La sezione admin PROJECTS (ex CANTIERI) adotta la stessa vista tabellare di SERVICES: stessa griglia, stessi controlli di ordinamento e filtro, stessa resa dei tag, così l'admin non impara due interfacce.

### 12.1 Tabella iniziale

Colonne esistenti come in SERVICES (Client, City, Project, Country, Region) più quattro nuove, tutte ordinabili e filtrabili:

| Colonna | Contenuto |
|---|---|
| **Certifications** | Un tag per ogni certificazione/servizio attivo sul sito (LEED, WELL, …), stesso stile pill di SERVICES |
| **Typology** | Retail, Offices, Warehouses, Logistics, … — dal dato di sito |
| **Handover** | La data corrente dalla PROJECT TIMELINE. Se diverge dalla baseline contrattuale, indicatore discreto accanto alla data (es. «+46g») |
| **Status** | Chip a tre valori, **derivato, mai compilato a mano** |

**Derivazione dello Status** (dalla data odierna contro la PROJECT TIMELINE):

| Status | Da | A |
|---|---|---|
| **Design** | Concept design | Construction start (inizio lavori) |
| **Construction** | Construction start | Handover (fine lavori) |
| **Certification** | Handover | Ottenimento certificazione |

Regole di bordo: con più certificazioni, la fase Certification termina all'**ultimo** attainment fra quelle attive. I progetti di tipo EXISTING, che non hanno PROJECT TIMELINE, sono sempre in Status **Certification**. Prima del concept design lo Status è Design. Colori dei chip: Design grigio, Construction ambra, Certification viola — coerenti con le famiglie del riferimento visivo.

### 12.2 Riga espansa (drill-down)

Il click sulla riga apre sotto di essa un pannello con l'innesto in forma orizzontale compatta, tutto sulla **stessa scala temporale** (anni/trimestri come tacche):

1. **Barra PROJECT**, segmentata nelle tre fasi Design | Construction | Certification, con i confini alle date reali della PROJECT TIMELINE (concept design, construction start, handover, ultimo attainment) e i colori dei chip di Status.
2. **Una barra per certificazione** (LEED, WELL, …), allineata sotto, con le milestone come tacche sulla barra ed **etichette sopra la barra** (pre-assessment, gc training, cx, submission…; sfalsate su due righe quando si affollano). Le **serie ricorrenti** (weekly/monthly report) si rendono come tacche ripetute ravvicinate con un'unica etichetta cumulativa («weekly report 1…9»), non un'etichetta per occorrenza.
3. **Linea dell'oggi** verticale che attraversa tutte le barre — è ciò che rende leggibile lo Status a colpo d'occhio.

Il pannello è di sola lettura; il click su una corsia porta al dettaglio sito (v1.1 §8.3 / vista completa). I dati vengono dallo stesso stato di PROJECT TIMELINE e HQ FGB TIMELINE — nessuna fonte parallela.

Rapporto con il resto: la **verticale** (riferimento-visivo-timeline.html) è la vista di lavoro e dettaglio; questa **orizzontale compatta** è la vista di scansione dell'admin. Stessa semantica di nodi e colori, orientamento diverso per scopo diverso.
