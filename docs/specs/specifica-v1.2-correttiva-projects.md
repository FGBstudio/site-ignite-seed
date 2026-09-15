# Specifica v1.2 — Correttiva della vista admin PROJECTS

**Origine:** la prima implementazione della vista PROJECTS (v1.1 §12) presenta difetti gravi di leggibilità e resa, verificati su screenshot: etichette minuscole e troncate, testi delle corsie sovrapposti alle barre, colori identici fra corsie diverse, confini delle fasi invisibili, header di tabella che scompare allo scroll, filtri inadeguati, più due elementi mai richiesti («storico», «dato stantio») da rimuovere.
**Precedenza:** dove diverge da v1 e v1.1, **vince questa**. Il riferimento visivo del drill-down corretto è il mockup approvato in conversazione; la grammatica di `riferimento-visivo-timeline.html` resta valida per la verticale.

---

## 1. Sistema colore unico per servizio

Un'unica mappa di token colore, definita in un solo posto, usata da **tutto** il prodotto: tag nelle tabelle, corsie del drill-down, timeline verticale, chip, legende. Nessun componente sceglie colori per conto proprio.

**Regole vincolanti:**

1. **Ogni tipo di servizio/certificazione ha una tinta propria**, distinta da tutte le altre e riconoscibile ovunque ricompaia.
2. **La project timeline è neutra**: scala di pietra (tre toni, chiaro→scuro per Design→Construction→Certification), mai una tinta di servizio. È ciò che rende leggibile l'innesto: sfondo neutro, servizi colorati.
3. **I servizi di supporto ereditano la tinta della certificazione madre in variante tratteggiata** (bordo/riempimento dashed): LEED GC Support = tinta LEED tratteggiata. Evita l'esplosione di tinte e dichiara la parentela.
4. **L'ambra è riservata agli avvisi** (da confermare, Da attenzionare, divergenze): mai come tinta di servizio o di fase.
5. **Il colore non è mai l'unico portatore d'informazione**: etichetta testuale sempre presente.

**Palette proposta** (modificabile, ma ogni sostituzione deve mantenere la distinguibilità reciproca e le regole sopra):

| Famiglia | Tinta forte | Fondo chiaro |
|---|---|---|
| Project timeline (fasi) | #A8A47F / #CFCBBD / #E7E5DC | — |
| LEED | #2F7A4E | #E3F0E8 |
| WELL | #1673B1 | #E2EFF8 |
| BREEAM | #6E7A1F | #EFF2DF |
| WiredScore | #C0453C | #FAE7E5 |
| Tassonomia / CSRD / ESG | #5348B8 | #ECEAF9 |
| Energy (Greeny) | #C25E1D | #FAEBDE |
| Air (ClAir / IAQ) | #147F8C | #DFF1F3 |
| Commissioning (MEP/Envelope) | tinta della certificazione servita, variante tratteggiata; se venduto solo: #6E6C63 | #EFEEE7 |

Ogni famiglia espone tre token: `strong` (testo, tacche, bordi), `bg` (riempimento barre e pill), `mid` (stati intermedi). Tag di tabella e corsie usano la stessa coppia strong/bg.

---

## 2. Tipografia e leggibilità

- **Dimensioni minime**: etichette di milestone ≥ 11px; nomi corsia ≥ 12px; date ≥ 10.5px con `tabular-nums`. Sotto queste soglie il testo non si riduce: si applica la strategia anti-collisione.
- **Niente troncamenti ciechi**: un'etichetta o entra intera, o va su riga alternata, o collassa in tacca con tooltip. Mai «Preliminary Const…» sospeso a mezz'aria. Ellissi ammessa solo con tooltip/hover che mostra il testo completo, e mai sulle ancore.
- **Anti-collisione a tre stadi**, in ordine: (1) etichette su **due righe alternate**, sopra e sotto la barra, con lineetta di richiamo alla tacca; (2) se ancora si toccano, le etichette non-ancora collassano in sole tacche con tooltip, e resta visibile un'etichetta cumulativa per le serie («report mensili 1…8»); (3) toggle «mostra tutte le etichette» che aumenta l'altezza della corsia invece di ridurre il testo.
- **L'altezza della corsia si adatta al contenuto**, non viceversa: due righe di etichette = corsia più alta.

---

## 3. Drill-down ristrutturato

### 3.1 Struttura

- **Colonna sinistra congelata** (≈150–180px): quadratino colore + nome del servizio + PM, su righe proprie. **I nomi non si sovrappongono mai alle barre**: le barre iniziano dopo la colonna. La colonna resta ferma durante lo scorrimento orizzontale.
- **Asse temporale in testa** (anni e trimestri; mesi quando lo zoom lo consente), **sticky** durante lo scroll verticale del pannello.
- **Barra Project** per prima, a tre segmenti nella scala neutra, con **etichetta della fase dentro il segmento** quando c'è spazio (altrimenti sopra) e **data di confine sotto ogni giunzione** (construction start, handover).
- **Confini di fase prolungati**: dalle giunzioni della barra Project scendono **separatori verticali tratteggiati attraverso tutte le corsie** — è questo che risponde a «quando parte uno e quando parte l'altro»: ogni milestone si legge rispetto alla fase in cui cade.
- **Una corsia per certificazione/servizio** nella propria tinta; milestone come tacche con etichette secondo §2; serie ricorrenti come tacche ravvicinate + etichetta cumulativa.
- **Linea dell'oggi** sempre renderizzata, con pill «oggi» e pulsante **«Oggi»** che vi riporta la viewport.
- **Corsie vuote**: una certificazione senza timeline materializzata mostra una barra sottile smorzata con la dicitura «timeline non compilata» — mai una corsia bianca ambigua.

### 3.2 Navigazione temporale: due modalità, mai una via di mezzo

Il problema «non ci sta tutto nello schermo» si risolve con una scelta esplicita, non con lo schiacciamento:

- **Adatta**: l'intera durata (dal primo evento all'ultimo attainment, +margine) entra nella viewport; a questa scala valgono le regole di collasso etichette del §2.
- **Scorri**: scala fissa leggibile (densità minima ~90px/mese a zoom 100%) con **scorrimento orizzontale** — trascinamento, rotella orizzontale/trackpad — colonna sinistra e asse che restano fissi.
- Controlli: toggle Adatta/Scorri, zoom − / + (che agisce sui px/mese in modalità Scorri), «Oggi». Doppio click su una corsia = apri il dettaglio sito.
- All'apertura del drill-down: modalità Adatta di default; se la durata comprimerebbe sotto la densità minima leggibile, si apre direttamente in Scorri centrato sull'oggi.

---

## 4. Header di tabella fisso

L'intestazione delle colonne della tabella PROJECTS è **sticky**: resta visibile durante lo scroll verticale, anche con una o più righe espanse. Vale identico per SERVICES. Nessuna riga di dati deve mai comparire a schermo senza le sue intestazioni.

---

## 5. Status: quattro stati derivati + On Hold

Sostituisce la tabella di v1.1 §12.1.

| Status | Da | A | Chip |
|---|---|---|---|
| **Design** | Concept design | Construction start | pietra chiara |
| **Construction** | Construction start | Handover | pietra media |
| **Certification** | Handover | fino all'ottenimento (escluso) | pietra scura |
| **Certified** | Certificazione ottenuta | — | inchiostro scuro, testo chiaro |

- Sempre **derivato, mai compilato**. Con più certificazioni: Certified quando **tutte** quelle attive sono ottenute; fino ad allora, lo status segue le fasi. EXISTING: Certification fino all'ottenimento, poi Certified.
- **On Hold** è l'unico stato **manuale** (admin o PM, con motivo obbligatorio e data): sospende il progetto nel conteggio «in corso», ne silenzia gli alert, e prevale sulla visualizzazione dello status derivato (chip outline tratteggiato). Alla rimozione, lo status derivato riemerge da solo.
- **Rimosso il label «storico»** (mai richiesto): i progetti chiusi sono semplicemente Certified. **Rimosso l'indicatore «dato stantio»** e la relativa soglia (mai richiesti): provenienza e data di aggiornamento restano consultabili sul singolo evento, senza allarmi automatici. Le parti della demo e delle specifiche precedenti che li citavano sono superate.

---

## 6. Filtri e colonne

- **Barra filtri unica sopra la tabella**: campo di ricerca libera (client, project, city) + multi-select per Certification, Typology, Region, Status, PM. Ogni filtro attivo diventa un **chip rimovibile** sotto la barra; «Azzera» li toglie tutti. Le opzioni dei multi-select mostrano il conteggio dei risultati. Lo stato dei filtri vive nell'URL (condivisibile). L'ordinamento resta sulle intestazioni di colonna.
- **Nuova colonna PM**, subito dopo Handover: i PM delle certificazioni del sito (nome puntato; se più d'uno, elenco compatto), ordinabile e filtrabile.

---

## 7. KPI di testata

Quattro card sopra la barra filtri; **il click su una card filtra la tabella** sul relativo insieme.

| Card | Contenuto |
|---|---|
| **Certificazioni in corso** | Numero di certificazioni con status Design/Construction/Certification (On Hold escluse) · sottotitolo: «su N progetti · M siti» |
| **Da attenzionare** | Conteggio progetti che soddisfano almeno una delle tre condizioni sotto, con scomposizione per condizione |
| **On Hold** | Progetti in On Hold, con motivo visibile all'hover |
| **Certified** | Certificazioni ottenute · sottotitolo: progetti interamente certificati |

**Regola «Da attenzionare»** — un progetto vi entra se vale almeno una di:

1. **In ritardo di timeline**: esiste almeno una milestone di certificazione **in carico a FGB**, non completata e non opzionale, con **data corrente anteriore a oggi di oltre 5 giorni lavorativi** (tolleranza configurabile, default 5). La misura è sulle **date correnti**: se il cronoprogramma slitta e la milestone rientra, il ritardo si chiude da solo (principio v1 §3.3). Le occorrenze di serie ricorrenti contano come milestone.
2. **Ritardo pagamento**: fattura scaduta non incassata oltre la tolleranza — richiede il dato da Payments; **finché l'integrazione non esiste, la condizione non si mostra e non si simula** (niente dati inventati).
3. **Estensione contrattuale necessaria**: fine stimata del progetto (ultimo attainment proiettato) **oltre la scadenza contrattuale**.

I progetti On Hold sono esclusi da «Da attenzionare».

---

## 8. Criteri di accettazione visivi

Checklist verificabile a occhio su viewport ≥1280px, dati di test completi:

- (v1) Nessuna etichetta troncata senza tooltip; nessun testo sotto le soglie del §2.
- (v2) Nessuna sovrapposizione testo-su-barra o testo-su-testo, in Adatta e in Scorri.
- (v3) I confini Design/Construction/Certification sono individuabili in meno di due secondi (segmenti, etichette, date, separatori).
- (v4) Ogni corsia ha una tinta diversa; la barra Project non condivide tinte con i servizi; i support sono riconoscibili come varianti tratteggiate.
- (v5) Scrollando la tabella con una riga espansa, header di tabella, asse temporale e colonna sinistra restano visibili.
- (v6) In modalità Scorri, il trascinamento è fluido e «Oggi» riporta sempre alla linea rossa.
- (v7) Nessuna occorrenza di «storico» o «stantio» nell'interfaccia.
- (v8) Chip Status coerenti con i segmenti della barra Project; un progetto certificato mostra Certified.
- (v9) Click su ciascuna KPI card filtra la tabella e il chip del filtro applicato compare nella barra.

---

## 9. Delta sui documenti precedenti

| Documento | Punto superato |
|---|---|
| v1 §3.7 | «marcati storici» → Status Certified |
| v1 §8.4 | KPI ed eccezioni CEO → §7 di questa; colonna «freschezza» e allarme stantio rimossi |
| v1 §11.5 | decisione «soglia di freschezza» eliminata (non esiste più l'indicatore) |
| v1.1 §12.1 | tabella Status a tre stati → §5 (quattro stati + On Hold); colori chip → scala pietra + Certified inchiostro |
| v1.1 §12.2 | struttura del drill-down → §3 (colonna congelata, confini prolungati, Adatta/Scorri) |
| demo-timeline-pm-ceo.html | le parti «dati stantii» e le tinte uniformi delle corsie non fanno più testo |
