# Specifica di risultato — Integrazione timeline cantiere / timeline certificazioni

**Natura del documento:** descrive *quale deve essere il risultato* lato PM e lato Admin, non *come implementarlo*. Serve come base condivisa prima di rispondere alle domande di processo e prima di scrivere qualunque specifica tecnica.

---

## 0. Riformulazione dell'obiettivo

Quello che vuoi ottenere, detto con parole mie:

> Ogni progetto di certificazione vive appeso a una realtà esterna che non controlliamo (il cantiere). Oggi le due cose vivono separate: il PM tiene la sua timeline di certificazione, il cantiere fa la sua vita, e l'allineamento tra le due esiste solo nella testa del PM. Il risultato è che l'admin non riesce a rispondere a domande che sono di business, non di project management: possiamo fatturare questo mese? il contratto scade prima che il cantiere finisca? siamo noi in ritardo o è slittato il cantiere?

L'integrazione non serve a "vedere due gantt insieme". Serve a rendere **calcolabile** l'impatto del cantiere sul nostro lavoro e sui nostri ricavi.

Due precisazioni che considero acquisite:

- Il frontend cliente (dash mappa, organizzazione su base sito) non cambia. Questa specifica riguarda solo le viste interne PM e Admin.
- Un sito può avere più certificazioni e più servizi attivi contemporaneamente. La vista deve reggere il caso multiplo, non il caso singolo.

---

## 1. Il modello concettuale: tre livelli distinti

La scelta strutturale più importante è tenere separate tre cose che oggi tendono a confondersi.

### Livello 1 — Asse di riferimento
La realtà esterna a cui siamo appesi. **Non è nostro lavoro, è contesto.** Nessuno di noi lo esegue, lo subiamo. Va importato e mantenuto aggiornato, in sola lettura.

### Livello 2 — Timeline di servizio
Le nostre milestone e i nostri deliverable, derivati dai requisiti dello standard perseguito. **Una timeline per ogni certificazione o servizio attivo sul sito**, non una timeline unica per progetto.

### Livello 3 — Dipendenze
I collegamenti tra le nostre milestone e gli eventi dell'asse di riferimento. È il livello che oggi non esiste da nessuna parte se non nell'esperienza del PM, ed è quello che genera tutto il valore.

**Regola fondante:** una milestone di livello 2 non ha una data assoluta. Ha un ancoraggio a un evento di livello 1 più un offset più un vincolo.

```
Milestone: "Campagna di misura IAQ pre-occupancy"
Ancora:    fine_finiture
Offset:    +14 giorni
Vincolo:   deve concludersi prima di consegna_edificio
Durata:    5 giorni
```

Da qui discende tutto: se `fine_finiture` slitta, la milestone si sposta da sola, e se lo slittamento fa collidere il vincolo con `consegna_edificio` il sistema segnala un conflitto **prima** che diventi un problema. Questo è il comportamento che rende l'integrazione utile invece che decorativa.

---

## 2. Le ancore: vocabolario canonico, non import del gantt

Dal PDF del GC/DL non si importa il gantt. Si estraggono (o si inseriscono a mano) **poche date che corrispondono a eventi definiti da noi**, sempre gli stessi su tutti i progetti.

Motivo: il gantt del GC ha centinaia di righe, una WBS diversa per ogni impresa, nomenclature incoerenti, e cambia ogni due settimane. Se lo importi tutto, ti sei preso in carico la manutenzione di un dato altrui che non saprai mantenere. Se estrai 8-12 eventi canonici, hai un dato piccolo, stabile, confrontabile tra progetti diversi e aggiornabile in due minuti.

Il vocabolario va definito una volta con i PM. Un punto di partenza plausibile, da validare:

| Evento canonico | Perché ci serve |
|---|---|
| Inizio lavori | Ancora iniziale, base contrattuale |
| Fine strutture / chiusura involucro | Sblocca verifiche su involucro, blower door |
| Fine impianti MEP | Prerequisito per commissioning e misure |
| Fine finiture | Prerequisito per misure qualità aria |
| Avvio commissioning | Si intreccia con i nostri protocolli |
| Fine lavori | Milestone contrattuale forte |
| Consegna / occupancy | Cambia il regime di molti servizi |
| Collaudo / agibilità | Chiude la fase costruttiva |

Attributi minimi per ogni ancora: data pianificata, data effettiva (se avvenuta), **data dell'ultimo aggiornamento e fonte**. L'ultimo attributo non è burocrazia: un'ancora aggiornata a tre mesi fa vale poco e l'admin deve saperlo a colpo d'occhio.

---

## 3. Risultato ottimale lato PM

### 3.1 Il principio: il PM valida, non compila

Se il PM deve inserire trenta milestone a mano per ogni certificazione, non lo farà, o lo farà male e una volta sola. Il lavoro deve essere: **importa le ancore → scegli il template di certificazione → il sistema genera la timeline → il PM corregge le eccezioni.**

Il template di certificazione è il vero asset: contiene le milestone standard di quello standard, con i loro ancoraggi e offset già impostati. Si scrive una volta per certificazione e si riusa su tutti i progetti. È qui che sta il "minimo sforzo" che chiedi.

### 3.2 Cosa vede il PM

Una schermata per progetto/sito, a corsie orizzontali:

- **Corsia 0 (in alto, grafica diversa):** l'asse di riferimento. Sola lettura, con le ancore come marker verticali che attraversano tutte le corsie sottostanti.
- **Corsia 1..n:** una corsia per certificazione o servizio attivo, con le nostre milestone.
- **Linee di dipendenza** visibili tra milestone e ancore, così il PM capisce *perché* una milestone sta dove sta.

Le ancore che tagliano verticalmente tutte le corsie sono la cosa che rende leggibile il multiplo: si vede immediatamente cosa deve essere fatto prima di "consegna" da parte di tutte le certificazioni insieme.

### 3.3 Cosa può fare il PM

| Azione | Risultato atteso |
|---|---|
| Caricare il PDF/gantt del GC | Il sistema propone le date delle ancore, il PM conferma o corregge. La proposta automatica è un acceleratore, non una fonte di verità: la conferma umana resta obbligatoria. |
| Inserire le ancore a mano | Percorso di pari dignità, non un ripiego. Molti GC non danno un PDF utilizzabile. |
| Aggiornare una data di cantiere | **Il ricalcolo è la funzione più importante del sistema.** Il PM sposta un'ancora e vede in anteprima, prima di confermare, quali milestone si spostano, quali sforano un vincolo, quali escono dal perimetro contrattuale. |
| Aggiungere una certificazione al sito | Nuova corsia generata da template sulle stesse ancore, senza reinserire nulla. |
| Segnare stato milestone | Pianificata / in corso / completata / bloccata, con causa del blocco (nostra o esterna). La causa è ciò che alimenta la distinzione al punto 4.2. |
| Sganciare una milestone | Deve esistere l'override: certe date sono fissate da terzi (audit di ente, finestre di submission) e non seguono il cantiere. Una milestone sganciata deve essere visibilmente marcata come tale. |

### 3.4 La domanda che il PM deve poter fare in dieci secondi

> "Il GC mi ha detto che la consegna slitta di due mesi. Cosa succede a noi?"

La risposta deve essere una schermata, non un pomeriggio di lavoro su Excel.

---

## 4. Risultato ottimale lato Admin / CEO

### 4.1 Il principio: portfolio ed eccezioni, non gantt

Un gantt multi-progetto con quaranta siti è illeggibile e nessun CEO lo aprirà due volte. La vista admin primaria deve essere **una tabella di portfolio guidata dalle eccezioni**, con il gantt disponibile solo come drill-down su singolo sito.

L'admin non vuole guardare tutto. Vuole che il sistema gli dica cosa guardare.

### 4.2 La distinzione che non va mai persa

Questo è il punto più delicato di tutta la specifica. Esistono **due tipi di disallineamento** e non vanno mai fusi in un unico semaforo:

- **Ritardo nostro** — un deliverable in carico a noi non è stato consegnato nei termini. È un problema di delivery, riguarda il PM, e ha impatto reputazionale e contrattuale.
- **Slittamento del cantiere** — le date esterne si sono mosse. Non è colpa nostra, ma è **l'informazione a maggior valore economico**: allunga la durata del progetto, sposta i ricavi, può far scadere il contratto prima della fine, può richiedere un'estensione da negoziare.

Un cruscotto che li mescola in un unico "rosso/giallo/verde" distrugge esattamente l'informazione per cui stai costruendo il sistema. Vanno tenuti come due colonne, due indicatori, due liste di eccezioni.

### 4.3 Indicatori per riga di portfolio

Una riga per sito (coerente con l'organizzazione su base sito), espandibile per servizio:

| Indicatore | Domanda a cui risponde |
|---|---|
| Fase di cantiere corrente | Dove siamo nella realtà esterna |
| Avanzamento nostro % vs avanzamento cantiere % | Siamo avanti, allineati o indietro rispetto al contesto |
| Scostamento cantiere in giorni vs baseline iniziale | Di quanto è slittato il progetto rispetto a quando l'abbiamo venduto |
| Ritardo nostro in giorni | Quanto siamo indietro per causa nostra |
| Prossima milestone e chi la blocca | Cosa serve adesso e a chi chiederlo |
| Freschezza del dato di cantiere | Quanto posso fidarmi di questi numeri |
| **Fine progetto stimata vs scadenza contratto** | Serve un'estensione, e di quanti mesi |
| **Mese fatturabile sì/no** | La domanda operativa che hai citato esplicitamente |

Gli ultimi due sono quelli che trasformano il sistema da strumento di PM a strumento di direzione. Vanno progettati con chi fa la fatturazione, non dedotti.

### 4.4 Liste di eccezione

Tre code, aggiornate in automatico:

1. **Contratti a rischio** — fine progetto stimata oltre la scadenza contrattuale, con i mesi di estensione stimati.
2. **Vincoli in conflitto** — milestone che, con le date attuali, non possono più rispettare il loro vincolo. È l'allerta precoce che oggi arriva quando è tardi.
3. **Dati stantii** — progetti la cui ancora di cantiere non viene aggiornata da oltre N settimane. Senza questa lista tutti gli altri numeri si degradano in silenzio.

### 4.5 Sulla modalità di visualizzazione

Hai scritto di non sapere ancora quale sia la migliore. La mia proposta è di non sceglierne una: **tabella di portfolio come vista primaria, gantt per sito come drill-down, calendario delle prossime 8 settimane come terza vista**. Le tre rispondono a domande diverse (come sta il portafoglio / com'è messo questo sito / cosa succede a breve) e costano poco se il modello dati sottostante è quello descritto. La decisione da prendere non è "quale vista", ma "quale apre l'admin quando fa login": e la risposta secondo me è la tabella con le eccezioni in cima.

---

## 5. Progetti senza cantiere

**Non creare timeline farlocche.** Un cantiere finto inquina tutti gli indicatori di portfolio: gli scostamenti diventano rumore, le medie perdono senso, e la lista eccezioni si riempie di allarmi inventati.

La soluzione è generalizzare il livello 1. Non si chiama "timeline di cantiere", si chiama **asse di riferimento**, e ha un tipo:

| Tipo | Ancore tipiche | Chi le fornisce |
|---|---|---|
| **A — Cantiere** | Gli 8-12 eventi canonici del §2 | GC / DL, via PDF o inserimento manuale |
| **B — Operativo / contrattuale** | Inizio esercizio, periodi di monitoraggio, finestre di audit, data di ricertificazione, scadenze dell'ente | Contratto, protocollo dello standard, calendario dell'ente certificatore |
| **C — Nessuno** | La timeline di certificazione è autoportante | Il PM, in fase di kickoff |

Nel tipo C esistono comunque **due ancore obbligatorie**: data di kickoff e data target di submission/certificazione. Sono sufficienti a far funzionare tutto il resto — ancoraggi, ricalcolo, scostamento, avanzamento — senza inventare nulla.

Il vantaggio è che struttura dati, UI e KPI restano identici in tutti e tre i casi. L'admin non deve imparare due sistemi, e il confronto tra progetti eterogenei resta valido, perché "scostamento vs asse di riferimento" è una metrica ben definita in tutti i casi. Cambia solo l'etichetta della corsia 0 e la semantica delle ancore.

**Risposta secca alla tua domanda:** l'unica che conta è la timeline di certificazione, ma non esiste "senza asse". Anche il progetto più semplice ha un inizio e un target, e quelli sono il suo asse.

---

## 6. I servizi di monitoraggio (aria ed energia)

Questi non sono progetti a milestone, sono **servizi continuativi a cicli ricorrenti** (campagne di misura, periodi di logging, report periodici). Forzarli nel modello a milestone li snatura.

Vanno modellati come serie ricorrenti con una periodicità, ancorate a un evento dell'asse: tipicamente `consegna/occupancy` per il monitoraggio in esercizio, o `fine finiture` per le campagne pre-consegna.

Il punto di attenzione è il **doppio uso**: la stessa campagna di misura può essere sia un servizio venduto autonomamente, sia il deliverable che soddisfa un credito di una certificazione. Se la modelli due volte, il PM la eseguirà una volta e la marcherà completata in un posto solo, e il portfolio mostrerà dati incoerenti. Serve un'entità unica riferibile da più timeline. Questo è il punto in cui il modello dati attuale (tabelle monitoring e operations) va guardato con attenzione, ed è dove servirà il contenuto della specifica che Claude Code ha generato.

---

## 7. Anti-requisiti

Cose che il sistema **non** deve fare, elencate perché sono le derive naturali di progetti come questo:

- Non deve replicare il gantt del GC. Non siamo un software di gestione cantieri e non vinceremo quella battaglia.
- Non deve chiedere al PM di mantenere le date allineate a mano. Se lo chiede, il sistema ha fallito.
- Non deve mostrare all'admin un unico semaforo aggregato. Distrugge la distinzione del §4.2.
- Non deve mostrare date con la stessa confidenza a prescindere dalla freschezza del dato.
- Non deve cambiare nulla lato frontend cliente.

---

## 8. Decisioni aperte

Da chiudere prima di passare alla specifica tecnica:

1. **Vocabolario delle ancore** — quali sono i 8-12 eventi canonici, definiti con i PM che hanno gestito più cantieri. È la decisione che condiziona tutto il resto e va presa per prima.
2. **Regola di fatturabilità** — cosa determina esattamente un mese fatturabile? Avanzamento cantiere, milestone consegnate, tempo trascorso, o una combinazione? Da definire con chi fattura, non da dedurre.
3. **Baseline** — lo scostamento si misura rispetto alle date del contratto iniziale o all'ultima revisione condivisa? Le due cose danno numeri molto diversi e servono a scopi diversi (una per la negoziazione, l'altra per l'operatività). Probabilmente servono entrambe.
4. **Granularità dell'ancoraggio** — ogni singola milestone è ancorata, o solo le milestone di apertura di ciascuna fase con il resto in sequenza interna? La seconda è molto più semplice da mantenere e probabilmente sufficiente.
5. **Soglia di freschezza** — dopo quante settimane un dato di cantiere è considerato inaffidabile.
6. **Chi aggiorna le ancore e con quale cadenza** — è un impegno di processo, non una funzione software, ed è la condizione di sopravvivenza dell'intero sistema.

---

## 9. Prossimo passo

Con questa base condivisa, le domande su modello dati e collegamento tra tabelle monitoring/operations diventano rispondibili in modo concreto. Per farlo mi serve il contenuto reale della specifica generata da Claude Code (esportata in Markdown o PDF), in particolare: elenco dei servizi e delle certificazioni offerte, quali prevedono cantiere e quali no, e come sono oggi collegate le entità nelle sezioni monitoring e operations.
