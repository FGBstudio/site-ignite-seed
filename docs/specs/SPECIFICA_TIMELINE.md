# Specifica — Vista "Timeline" (Project timeline + HQ FGB timeline)

Versione 1.0 · 16 settembre 2026 · Riferimento visivo: `reference/prototipo-approvato.html`

---

## 1. Contesto e obiettivo

La vista attuale (Services → sito → certificazione → Timeline) è percepita come confusa e i PM non la compilano. Obiettivo del redesign: una vista in cui il PM entra, capisce in pochi secondi cosa deve fare, compila (o importa) le date e **vede immediatamente** le due timeline costruirsi e aggiornarsi accanto ai campi.

Principi guida:
- Un solo compito per schermata: compilare le due timeline. Tutto il resto (task, alert, report) sta altrove.
- Feedback immediato: ogni data inserita produce un cambiamento visibile nella timeline live.
- Il meno possibile da scrivere a mano: date derivate, avanzamenti calcolati, import da file.
- Linguaggio visivo del prodotto FGB esistente: card bianche arrotondate, pallino nero numerato + titolo maiuscolo + chip, chip verdi con catenella per gli ancoraggi, link/testi secondari ambra, descrizioni viola, banner neri informativi.

## 2. Glossario

| Termine | Significato |
|---|---|
| **Sito** | L'edificio/commessa (es. Palazzo Aurora). |
| **Servizio / certificazione** | Un servizio FGB che insiste sul sito (es. LEED BD+C). Più servizi possono insistere sullo stesso sito. |
| **Project timeline** | Cronoprogramma del **progetto edilizio**: elenco di **attività** con data di inizio e fine. Record **unico per sito**, condiviso tra tutti i servizi che vi insistono. |
| **HQ FGB timeline** (timeline di certificazione/servizio) | Sequenza di **passi/milestone del servizio** (es. Pre-assessment, LEED Design Submittal…), specifica del servizio. |
| **Attività** | Voce della project timeline. Ha inizio + fine. |
| **Milestone / passo** | Voce della HQ FGB timeline. Ha **una sola data**; la sua durata implicita corre dalla propria data alla data del passo successivo. |
| **Àncora** | Regola che lega la data di un passo a un'attività di progetto: `(attività, punto ∈ {inizio, fine}, offset in giorni)`. Es. "30 gg dopo la fine di Handover". |
| **Dipendenza** | Legame facoltativo tra due attività di progetto (A dipende da B). |
| **Avanzamento** | % di completamento. **Automatico** (su base temporale) per le attività di progetto; **manuale** per i passi del servizio. |

## 3. Utente e flusso principale

Utente: PM del progetto. Flusso felice:

1. Il PM apre la vista. A sinistra vede la **timeline live** (vuota, con invito a iniziare), a destra tre card in ordine: **Importa il cronoprogramma** (facoltativo), **1 · Project timeline**, **2 · HQ FGB timeline**.
2. Importa un file (XLSX/PDF/PNG) **oppure** compila a mano inizio/fine delle attività.
3. Ad ogni data inserita la timeline live si popola con animazione; le date dei passi del servizio ancorati si calcolano da sole.
4. Corregge eventuali date, imposta dipendenze facoltative, forza a mano la data di qualche passo se serve.
5. Ogni modifica è salvata automaticamente ("Salvataggio… → Tutto salvato" in alto). "Salva e chiudi" torna alla pagina del servizio.

Durante la vita del progetto:
- l'avanzamento delle attività di progetto **si campisce da solo** col passare del tempo;
- il PM aggiorna **a mano** le % dei passi del servizio (un promemoria in dashboard ogni venerdì lo invita a farlo — fuori scope di questa vista, ma l'API deve esporre gli avanzamenti per quel widget);
- un nuovo caricamento del file aggiorna le date (tipicamente le fini) e tutto si ricalcola.

## 4. Layout della vista

Griglia a due colonne (breakpoint ~1120px, sotto: colonna singola con timeline sopra e form sotto).

### 4.1 Pannello sinistro — "Timeline live" (sticky)
- Card con testata in stile prodotto: icona/numero in cerchio nero, titolo `TIMELINE LIVE`, chip `«Sito» — «Servizio»`.
- Riga meta sotto la testata: `intervallo min → max · ~N mesi · N attività in corso`.
- Corpo scrollabile internamente (il pannello resta sticky, `max-height: viewport`).
- **Due colonne distinte e separate** da una hairline centrale:
  - **PROGETTO** (sinistra, colore inchiostro/nero, verde quando in corso/completata)
  - **CERTIFICAZIONE** (destra, verde brand)
- Ogni colonna: intestazione maiuscoletto + sottolineatura colorata, **spina verticale** a capi arrotondati, **badge circolari** sulle tappe (ordinate cronologicamente, spaziatura verticale fissa per colonna — NON scala temporale: le distanze temporali si comunicano con le etichette, vedi sotto).
- **Badge** (per entrambe le colonne): anello esterno grigio chiaro + **arco colorato = % avanzamento** (con capi arrotondati, da ore 12 in senso orario); disco interno bianco con la **data** (giorno+mese in bold, anno sotto piccolo).
- **Colonna PROGETTO**, sotto ogni badge: nome attività (max 2 righe, ellissi), **barra orizzontale inizio→fine che si campisce** della stessa % dell'anello, riga `«NN%» · fino al «data fine»`. Se manca la fine: `manca la fine` e barra vuota.
- **Colonna CERTIFICAZIONE**, sotto ogni badge: nome passo, riga `«NN%» · calcolata|manuale`. Sui segmenti di spina tra un passo e il successivo: etichetta **durata** (`47 gg` / `2 mesi`) — è la durata implicita del passo.
- **Marcatore OGGI**: tacca ambra + etichetta `OGGI`, posizionata proporzionalmente sul segmento tra le due tappe che racchiudono la data odierna (in entrambe le colonne se applicabile).
- **Ancore visive**: per ogni passo ancorato, curva tratteggiata verde dal badge dell'attività di progetto al badge del passo (bassa opacità, sotto i badge).
- **Dipendenze**: archetto tratteggiato ambra sul lato esterno sinistro della colonna progetto, dall'attività madre alla dipendente.
- **Stato vuoto** (nessuna data in nessuna colonna): illustrazione + "Le timeline nascono qui …". Colonna singola vuota: testo corsivo `in attesa di date…` al posto della spina.
- Animazione: la tappa nuova o modificata appare con micro-pop (rispettare `prefers-reduced-motion`).

### 4.2 Colonna destra — compilazione

**Card "Importa il cronoprogramma"** (chip `facoltativo`)
- Dropzone drag&drop + bottone "Scegli file". Formati: **XLSX, PDF, PNG**.
- XLSX: parsing reale, formato atteso `Attività | Inizio | Fine` (prima colonna nome, prime due date utili della riga = inizio e fine; match fuzzy dei nomi, case/accents-insensitive). PDF/PNG: estrazione lato server (vedi §8); nel prototipo è simulata.
- L'import è **non distruttivo**: aggiorna le date delle attività riconosciute, non tocca le altre, non cancella dipendenze o override.
- Esito in toast: `N attività aggiornate da «file»` / messaggio d'errore con formato atteso.
- Link "Carica dati d'esempio" (solo ambienti non-prod).

**Card "1 · Project timeline"** (chip `condivisa`, pill conteggio `N di M attività`)
- Sottotitolo (viola): record unico per sito; avanzamento automatico; dipendenza facoltativa.
- Tabella con intestazioni: `# · Attività · Inizio · Fine · Avanz.`
- Riga: numero, nome in bold + sotto la riga meta con icona catena ambra e **select** `dipende da: nessuna | «attività»` (testo-link ambra, non un campo pesante); due date picker (Inizio, Fine); colonna **Avanz.** in sola lettura: mini barra + `NN% · pianificata|in corso|completata` (colori: neutro/verde/verde scuro).
- Comportamenti:
  - selezione dipendenza con inizio vuoto → propone `inizio = fine dell'attività madre` (modificabile);
  - la dipendenza NON vincola rigidamente le date (niente scheduling automatico in v1): è informativa + suggerimento, e disegna l'archetto in timeline;
  - riga evidenziata (flash verde tenue ~600ms) a ogni modifica.

**Card "2 · HQ FGB timeline"** (chip `«Sito» — «Servizio»`, pill `N di M passi`)
- Sottotitolo (viola): milestone del servizio, durata fino al passo successivo, data ancorata alla project timeline.
- **Banner nero**: "L'avanzamento parte da zero e si aggiorna **manualmente**: ogni venerdì la dashboard ti inviterà ad aggiornare le % delle attività in corso."
- Tabella: `# · Passo · Data · Avanz. · Natura`
- Riga: numero; nome in bold + sotto **chip verde con catenella** `+30gg` / `−60gg` e testo ambra `inizio|fine di: «attività»`; date picker (tratteggiato e grigio quando la data è calcolata; pieno quando forzata a mano); input numerico `% ` (step 5, clamp 0–100); chip **Natura**: `calcolata` (verde) / `manuale` (ambra) / `in attesa` (grigio); azione `↺` (visibile a hover, solo se manuale) per tornare al calcolo automatico.

### 4.3 Barra superiore
Logo FGB, breadcrumb `Services / «Sito» / Timeline`, stato salvataggio (`● Tutto salvato` / `● Salvataggio…` ambra), bottone pill nero **Salva e chiudi**.

## 5. Modello dati

Adattare i nomi allo schema esistente; questa è la forma logica.

```
ProjectActivity {
  id: string
  site_id: string            // la project timeline è per-SITO, condivisa tra servizi
  name: string
  start_date: date | null
  end_date: date | null
  dependency_ids: string[]   // facoltative, 0..n, verso altre attività dello stesso sito
  sort_order: int
}

CertStep {
  id: string
  service_id: string         // per-SERVIZIO (es. LEED BD+C su quel sito)
  name: string
  sort_order: int
  anchor: {                  // null solo per passi liberi, se mai esisteranno
    activity_id: string
    point: 'start' | 'end'
    offset_days: int         // può essere negativo ("60 gg prima dell'inizio di…")
  } | null
  override_date: date | null // se valorizzata vince sull'àncora → natura "manuale"
  progress_pct: int          // 0..100, SOLO manuale, default 0
}
```

Valori derivati (mai persistiti come sorgente di verità):
- `CertStep.effective_date = override_date ?? (anchor_activity[point] + offset_days)`; `null` se l'attività àncora non ha ancora la data richiesta.
- `CertStep.natura = override_date ? 'manuale' : (effective_date ? 'calcolata' : 'in attesa')`.
- `CertStep.durata = next_step.effective_date − effective_date` (ordinamento per data effettiva).
- `ProjectActivity.progress_pct = clamp01((today − start) / (end − start)) × 100`, arrotondato; `0` se `today ≤ start`, `100` se `today ≥ end`; `null` se manca una delle due date.
- `ProjectActivity.stato = completata (100) | in corso (1–99) | pianificata (0) | null`.

## 6. Regole di business

1. **Project timeline condivisa**: una sola per sito; la vista la mostra/edita nel contesto del servizio corrente ma le modifiche valgono per tutti i servizi del sito (come oggi — mantenere il chip `condivisa` e la nota nel sottotitolo).
2. **Avanzamento progetto = tempo**: nessun input manuale. Ricalcolato a ogni render lato client e disponibile via API (calcolo lato server per report/dashboard). Se `end_date` cambia (import o mano), la % si ricalcola immediatamente.
3. **Ancore**: cambiando le date di un'attività, le `effective_date` dei passi ancorati si ricalcolano e la UI si aggiorna in tempo reale. **[APERTO — vedi §10.1]** se lo slittamento debba generare una notifica/da-confermare o restare silenzioso.
4. **Override**: scrivere una data su un passo calcolato crea l'override (natura `manuale`); `↺` lo rimuove e torna al calcolo. L'override sopravvive ai ricalcoli dell'àncora.
5. **Dipendenze attività**: facoltative, molti-a-uno ammesso (v1 UI: singola per attività; il modello supporta n). Nessun auto-scheduling in v1; niente cicli (validare: A non può dipendere, direttamente o transitivamente, da sé stessa).
6. **Ordinamento timeline live**: per data (progetto: `start_date`; servizio: `effective_date`). Le righe delle card a destra mantengono invece `sort_order` (l'ordine "canonico" dei passi).
7. **Avanzamento servizio**: manuale, parte da 0. Esposto via API per il promemoria del venerdì in dashboard (widget fuori scope: qui serve solo che i dati siano leggibili/scrivibili via API).
8. **Salvataggio**: autosave con debounce per campo (~600–800ms) + indicatore di stato; "Salva e chiudi" forza il flush e naviga. Gestire errore di rete con toast e retry.

## 7. Interazioni — dettaglio per campo

| Azione | Effetto immediato |
|---|---|
| Compilo `Inizio` di un'attività | Badge appare/si sposta nella colonna Progetto (pop), riga flash, autosave. |
| Compilo `Fine` | Barra e anello si campiscono alla % temporale; etichetta `fino al …`; ricalcolo passi ancorati a `fine`. |
| Svuoto una data | La tappa esce dalla timeline (o perde la barra); i passi ancorati tornano `in attesa`. |
| Scelgo `dipende da` | Archetto ambra in timeline; se inizio vuoto → proposto = fine della madre; toast. |
| Cambio data di un passo | Override → natura `manuale`, date picker pieno, `↺` visibile. |
| Premo `↺` | Override rimosso, torna `calcolata`, toast "Data ricalcolata dall'àncora". |
| Cambio `%` di un passo | Anello del badge si riempie a quella %, clamp 0–100. |
| Import file riuscito | Date aggiornate, timeline si ricompone, toast con conteggio. |
| Tutto vuoto | Stato vuoto del pannello con invito. |

## 8. Import file — requisiti produzione

- **XLSX**: parsing client-side accettabile (come prototipo) o server-side; formato `Attività | Inizio | Fine`; match fuzzy nome (normalizza case, accenti, punteggiatura; contains bidirezionale con soglia); log delle righe non riconosciute mostrato all'utente.
- **PDF / PNG**: endpoint server di estrazione (OCR/parser da definire col backend); il client invia il file, riceve `[{activity_name, start, end}]` e applica la stessa pipeline dell'XLSX. Finché l'endpoint non esiste: nascondere PDF/PNG o marcarli "in arrivo" (NON simulare in produzione).
- Dimensione max e validazioni coerenti con gli standard dell'app.

## 9. Requisiti non funzionali

- **Design system**: riusare token/componenti esistenti dell'app (bottoni pill, chip, tabelle, toast). Il prototipo usa DM Sans e una palette nero/verde/ambra/viola dedotta dagli screenshot: se l'app ha token propri, **vincono i token dell'app**.
- **Responsive**: ≥1120px due colonne; sotto, colonna singola (timeline sopra, corpo scrollabile ~70vh); righe tabella degradano nascondendo colonne secondarie (#, Natura) su mobile.
- **Dark mode**: supportata (il prototipo definisce i token per entrambi i temi).
- **Accessibilità**: label ARIA su ogni input; `aria-label` sull'SVG; focus visibile; contrasto AA; `prefers-reduced-motion` disattiva le animazioni; le informazioni veicolate dal colore (stati) hanno sempre anche testo.
- **Performance**: la timeline è un singolo SVG rigenerato a ogni modifica (14–30 nodi: nessun problema); evitare re-render dell'intera pagina.
- **i18n**: stringhe in italiano come nel prototipo; predisporre per il sistema di traduzioni dell'app se esiste.

## 10. Punti aperti (decidere col PO prima o durante lo sviluppo)

1. **Slittamento àncora**: quando un'attività slitta e le date calcolate dei passi cambiano, il ricalcolo è silenzioso (v1 del prototipo) o richiede presa visione (badge "ricalcolata" / centro notifiche)?
2. **Dipendenze multiple in UI**: il modello le supporta; la UI v1 ne mostra una. Serve subito la multi-selezione?
3. **Permessi**: chi oltre al PM può editare? La project timeline condivisa è editabile da PM di altri servizi sullo stesso sito?
4. **Storico**: serve audit/versioning delle date (chi ha cambiato cosa e quando)? Consigliato almeno per le date di fine.
5. **PDF/PNG**: definire il servizio di estrazione (fornitore OCR, formato risposta, error handling).

## 11. Criteri di accettazione

- [ ] Vista vuota: stato vuoto visibile; inserendo UNA data qualsiasi appare il primo badge con animazione.
- [ ] Attività con inizio+fine nel passato → `100% · completata` (barra e anello pieni, verde scuro).
- [ ] Attività a cavallo di oggi → % coerente col tempo trascorso (±1%), stato `in corso`, colore verde; marcatore OGGI presente.
- [ ] Attività futura → `0% · pianificata`.
- [ ] Cambio della `Fine` (a mano o via import) → % e barre ricalcolate senza reload.
- [ ] Passo ancorato: data calcolata = punto àncora + offset; visibile curva verde verso l'attività; chip `calcolata`.
- [ ] Override data passo → chip `manuale`, `↺` presente e funzionante (ritorno al calcolo).
- [ ] % passo modificabile solo a mano; anello del passo riflette la %; default 0.
- [ ] Durate (`47 gg`/`2 mesi`) sui segmenti della colonna certificazione = differenza tra date effettive consecutive.
- [ ] Dipendenza facoltativa: selezione → archetto ambra; nessun vincolo rigido sulle date; niente cicli.
- [ ] Import XLSX `Attività|Inizio|Fine` → date aggiornate, toast con conteggio, righe non riconosciute segnalate; l'import non cancella override/dipendenze.
- [ ] Autosave con indicatore; refresh della pagina → dati persistiti.
- [ ] Due colonne SEMPRE distinte (nessuna fusione delle timeline); layout regge 0..12+ voci per colonna con scroll interno.
- [ ] Responsive, dark mode, `prefers-reduced-motion`, label ARIA: verificati.

## 12. Fuori scope (v1)

- Widget/popup del venerdì in dashboard (solo API pronte).
- Auto-scheduling dalle dipendenze (CPM/Gantt).
- Gestione passi "auto·opz" da spedizioni (QIAir/Greeny Shipment) — mantenere i passi esistenti di quel tipo com'è oggi, non regredire.
- Editing dell'anagrafica dei passi del servizio (template) — questa vista compila date e avanzamenti, non crea/rinomina passi.
