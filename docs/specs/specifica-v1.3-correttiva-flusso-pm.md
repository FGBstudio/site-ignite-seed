# Specifica v1.3 — Correttiva del flusso PM: persistenza, template, import, timeline protagonista

**Origine:** verifica su screenshot della pagina PM (PROJECT TIMELINE + HQ FGB TIMELINE) e del flusso di import. Difetti: la project timeline si ripresenta da compilare a ogni apertura anche per certificazioni dello stesso sito; righe di default generiche invece dei template per tipo; flusso di import poco chiaro con pulsante di conferma non funzionante; anteprima laterale minuscola con etichette sovrapposte; associazione fra passi di certificazione e progetto invisibile.
**Precedenza:** vince su v1, v1.1 e v1.2 dove diverge. I colori sono quelli della mappa token **v1.2 §1** — nessuna nuova tinta. Le regole di leggibilità **v1.2 §2** valgono anche per tutte le viste di questa specifica.

---

## 1. Persistenza della PROJECT TIMELINE (difetto bloccante, priorità assoluta)

**La PROJECT TIMELINE è un record unico per sito, salvato, condiviso.** Compilata una volta, è compilata per tutti.

- **Stati della sezione 1** nella pagina di una certificazione:
  - *Non ancora creata* (nessuna certificazione del sito l'ha compilata): due sole azioni — «Crea dal template {tipo}» e «Importa da file». Nessun form vuoto precompilato.
  - *Creata*: la sezione appare come **riepilogo compatto collassato** (nome, tipo, prime/ultime date, handover, n. eventi, ultimo aggiornamento) con azione «Apri / Modifica». Mai il form da capo.
- Aprendo qualunque altra certificazione dello **stesso sito**, la sezione 1 mostra il riepilogo della timeline esistente e il PM passa direttamente alla HQ FGB TIMELINE. Il gate risulta già soddisfatto.
- Ogni modifica è salvata sul record condiviso ed è immediatamente visibile dalle altre certificazioni (già previsto da v1 §3.5: scrittura condivisa + registro + notifiche).
- **Criterio di accettazione:** compilo la project timeline dalla certificazione A; apro la certificazione B dello stesso sito → la trovo compilata e identica; modifico una data da B → la rivedo da A; chiudo e riapro → nessun azzeramento, mai.

---

## 2. Popolamento iniziale: solo template per tipo, niente righe generiche

L'elenco fisso «Lancio gara d'appalto, Aggiudicazione GC, …» **si elimina**. Non esiste un default generico.

- «Crea dal template» carica **il template del tipo di progetto** (v1.1 §4, derivati dalle fixture reali): IDC → 4.1 (Kick-off→Snag list, Boucheron), DESIGN+CONSTRUCTION → 4.2 (famiglie Design/Permitting/Construction/Terze parti, Vespucci + xlsx), CONSTRUCTION → 4.3 (Metro). EXISTING non ha la sezione (v1.1 §2).
- Le righe da template arrivano **senza date** (salvo l'handover, precompilato dalla Quotation come baseline) e con le ancore FGB già marcate. Il PM data, aggiunge, elimina.
- Le ancore canoniche (aggiudicazione, construction start, impianti pronti, handover…) non spariscono: vivono **dentro** i template del tipo come righe marcate ●, non come elenco a sé.

---

## 3. Import ridisegnato: wizard a schermo intero in tre passi

Il flusso attuale non dice al PM cosa fare e il pulsante di conferma non funziona. Si sostituisce con un **wizard modale a tutto schermo**, tre passi dichiarati in testata:

**Passo 1 — Carica.** Area drag&drop grande, formati accettati (PDF, immagine, xlsx), una riga che spiega cosa succederà («Estraggo le attività, tu scegli quali tenere»). Caso durate relative (xlsx greco): qui si chiede la data di ancoraggio (v1.1 §5.2).

**Passo 2 — Rivedi ed escludi.** Layout a due colonne: **sinistra ~45%** la tabella delle righe estratte, **destra ~55% la timeline verticale grande** che si aggiorna in tempo reale.
- Istruzione esplicita in testa alla tabella: *«Togli la spunta alle attività che non servono alla certificazione: spariscono dalla timeline a destra.»*
- Selezione: checkbox per riga **e** click sull'intera riga come toggle; azioni di massa «escludi/includi selezionate»; le escluse restano visibili, barrate e smorzate (anche sulla timeline, in traccia), con contatore vivo «26 incluse · 4 escluse». Niente righe che spariscono senza traccia.
- Mapping ancora per riga come select a tendina (badge «ancora ▾»), precompilato dal riconoscimento; la divergenza dell'handover dalla baseline è segnalata in ambra qui e nel footer.
- Date e nomi modificabili in linea.

**Passo 3 — Conferma.** Riepilogo (n righe, ancore risolte, divergenze) e scrittura.

**Regole del pulsante di conferma** (correzione del bug, e prevenzione del prossimo):
- Sta in un **footer fisso** sempre visibile, con etichetta parlante («Conferma e inserisci 26 righe»).
- È attivo quando: ≥1 riga inclusa **e** l'ancora Handover è risolta (mappata su una riga inclusa, oppure il PM sceglie esplicitamente «mantieni handover da Quotation»).
- Quando è disattivo, **accanto compare sempre il motivo** in chiaro («manca il mapping dell'handover»). Mai un pulsante muto che non risponde.
- Al click: salvataggio, chiusura del wizard, ritorno alla sezione 1 con la timeline popolata e conferma visiva (toast «26 righe inserite»). Ogni errore di salvataggio si mostra nel footer con possibilità di riprovare: **nessun fallimento silenzioso**.
- Re-import su timeline esistente: il passo 2 diventa un diff (nuove / spostate / rimosse) e l'integrazione resta per evento (v1.1 §5.1.5).

---

## 4. Layout della pagina PM: tabelle compatte, timeline protagonista

Rovesciare le proporzioni attuali. La timeline non è un accessorio laterale: è la verifica visiva di quello che si sta compilando.

- **Tabelle più dense:** righe ~40px; colonna FONTE compressa (icona con tooltip; il campo si edita al click) e STATO come pallino colorato con etichetta breve. Le tabelle PROJECT TIMELINE e HQ FGB occupano **al massimo il 55–60%** della larghezza utile.
- **Pannello timeline:** larghezza **minima 360px** (non 150), sticky, alto quanto la viewport. Dentro: la verticale con la grammatica di `riferimento-visivo-timeline.html`, colori dalla mappa v1.2 §1, anti-collisione v1.2 §2 — le etichette accavallate dello stato attuale sono una violazione diretta di quelle regole.
- **Espansione a schermo intero:** il tap/click apre un overlay che occupa **tutta la viewport in larghezza e altezza**, con zoom (+/−/Adatta), corsie affiancate (Project + tutte le certificazioni del sito), date complete su ogni nodo, chiusura esplicita. Stessa componente, due formati — non due implementazioni.
- Sotto ~1100px il pannello si sposta sopra il form come striscia richiudibile (già v1 §8.2), con le stesse soglie di leggibilità.

---

## 5. Associazione visiva certificazione ↔ progetto

Il PM deve **vedere e governare** come i passi della certificazione si allineano alla project timeline. Oggi il legame è invisibile.

- Nella HQ FGB TIMELINE ogni passo ha una colonna **«Ancorato a»**: i passi ereditati mostrano il legame in sola lettura («← Handover · project timeline»); i passi calcolati mostrano ancora + offset modificabili («Handover + 60gg ▾»); i passi PM con vincolo di precedenza mostrano il vincolo («prima di: Lancio gara»); i passi liberi mostrano «—» con possibilità di agganciarli.
- **Evidenziazione bidirezionale:** hover/focus su un passo della certificazione evidenzia la riga di progetto a cui è ancorato e il connettore sulla timeline; viceversa, selezionando una riga di progetto si accendono tutti i passi che vi pendono. Sulla timeline i connettori seguono la semantica del riferimento visivo (tratteggio grigio = ereditata, tinta del servizio con etichetta +Ngg = calcolata).
- Cambiare un'ancora o un offset ricalcola in anteprima (stessa meccanica proposta-e-conferma) e si registra.
- I default vengono dalla scaletta (v1 §4); l'associazione manuale è l'eccezione, non il flusso normale.

---

## 6. Criteri di accettazione

- (p1) Persistenza: scenario del §1 superato tra due certificazioni dello stesso sito, senza mai ricompilare.
- (p2) Alla creazione compare il template del tipo giusto per ciascuna fixture di progetto (IDC/BDC/CONSTRUCTION); nessuna riga generica precompilata; EXISTING senza sezione.
- (p3) Import: ciascuna delle quattro fixture attraversa i tre passi; il pulsante di conferma è sempre visibile e, quando disattivo, spiega perché; alla conferma le righe compaiono nella sezione 1 con toast di esito.
- (p4) Nel passo 2, escludere una riga la fa sparire dalla timeline a destra con transizione, e il contatore si aggiorna.
- (p5) Pannello timeline ≥360px sticky; overlay a tutta viewport con zoom; nessuna etichetta sovrapposta o troncata senza tooltip (v1.2 §2) in entrambi i formati.
- (p6) Colori esclusivamente dalla mappa token v1.2 §1; la project timeline in scala neutra, i servizi nelle loro tinte.
- (p7) Hover su un passo calcolato evidenzia riga di progetto e connettore; la colonna «Ancorato a» è presente ed editabile dove previsto.
- (p8) Riepilogo compatto della sezione 1 quando la timeline esiste: riaprendo la pagina non si vede mai un form vuoto.
