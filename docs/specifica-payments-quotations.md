# Payments ↔ Quotations — specifica

**Fonte**: registrazione del 30 settembre 2026, ore 09:53 (Matteo, Francesca, Marco).
**Stato**: da approvare. Niente di questo è ancora implementato salvo dove scritto «c'è già».

Ogni richiesta ha cinque voci sempre uguali: **cosa serve**, **cosa c'è già**,
**cosa manca**, **dove vanno i dati**, **proposta di soluzione**. L'ultima è
scritta perché si possa dire di no prima che sia costruita.

---

## Il problema, in una riga

Francesca tiene in Excel quello che il database ha già, e lo tiene perché il
database non glielo mostra nel modo in cui le serve. Marco emette quotazioni che
nel sistema non ci sono. Il risultato sono cinque tabelle diverse compilate a
mano con le stesse informazioni in formati diversi.

> «Una volta che le informazioni sono nel database, sono in **una** tabella.
> Queste sono **viste**.»

Questa frase è il criterio di tutta la specifica. Ogni volta che una richiesta
sembra chiedere una tabella nuova, la prima domanda è: quel fatto esiste già da
qualche parte? Se sì, si costruisce una vista. Se no, si aggiunge **un** posto
dove metterlo.

---

## Cosa c'è già, e che quasi nessuno usa

Prima di aggiungere qualsiasi cosa, l'inventario. Il motore dei pagamenti è
molto più completo di quanto la registrazione lasci pensare:

| Cosa | Dove | Usato? |
|---|---|---|
| Note libere per fattura | `invoice_notes` + componente `NoteFattura` | **0 righe** — si scrivono **solo dai Recall** |
| Solleciti con canale, nota, prossima data | `invoice_reminders` + `fn_registra_sollecito` | **0 righe** |
| «Il cliente ha disposto il bonifico, aspetta N giorni» | `fn_bonifico_disposto` → `recall_status='yellow'`, `yellow_until` | **0 fatture** |
| Blocco progetto per insoluto e sblocco automatico | `fn_blocca_per_insoluto`, `fn_sblocca_se_credito_rientrato` | sì |
| Avvisi in dashboard con deduplica | `task_alerts` (387 aperti) + `fn_apri_alert` / `fn_chiudi_alert` | sì |
| Lista di cosa c'è da fatturare | pagina **Da Emettere** + `useTrancheAperte` (due / pending) | sì |
| Residuo calcolato, mai scritto | `v_invoices`, `fn_residuo_fattura` | sì |
| Entrate e uscite sullo stesso asse | `v_cash_events`, `v_saldo_commessa` | sì |
| Import di fatture già emesse da PDF | `fn_importa_fattura_storica` + OCR | da 2 giorni |

**Numeri di oggi**: 69 fatture · 166 tranche (109 mai fatturate) · 22 commesse ·
1.548 certificazioni · 33 quotazioni pendenti · 64 annullate · 18 fatture in
recall · 7 parziali · 14 clienti fatturati.

---

---

## A che punto siamo

| | Richiesta | Stato |
|---|---|---|
| R1 | Nota sulla fattura, col pallino | rivista due volte su tua indicazione |
| R2 | Data di incasso attesa — il previsionale | rivista: un flag solo, non due gesti |
| R3 | Follow-up del mese | riscritta sul tuo `prospetto 1 3.xlsx` |
| R4 | Regole di sollecito | rivista due volte: cadenza lun/mer, si ferma al pagamento |
| R5 | I parziali restano visibili | allineata a R4 |
| R6 | Registrare l'incasso: un filtro | **approvata** |
| R7 | Le note dal foglio di Francesca | **approvata** — si fa da qui, niente pagina |
| R8 | Vista per cliente | riscritta sul tuo `Projects_Payment_Update.xlsx` |
| R9 | Credito del cliente da progetto cancellato | **approvata** |
| R10 | Emettere una fattura: dalle tranche o da zero | **R10+R11 unite** su tua indicazione — tocca lo schema |
| R12 | Generare il documento — in Word | riscritta sul tuo template e sulle 166 fatture |
| R13 | Dashboard quotazioni | **approvata** |
| R14 | Quotazioni storiche di Marco | **approvata** — si fa da qui, niente pagina |
| R15 | Le tre società che emettono | **fatta** — anagrafiche caricate dai master |

---

## I due documenti veri, e cosa insegnano

Sono l'offerta **FGB for LOUIS VUITTON DALLAS — LEED GOLD** e la fattura che ne
è nata, **n. 3.089**. Messi uno accanto all'altro si legge tutto il meccanismo
che questa specifica deve tenere insieme.

**L'offerta** dice il totale e come si spezza:

```
LOUIS VUITTON — Dallas, Highland Park Village
  Services Fees UP TO LEED ID+C Retail GOLD        TOTAL 22.500 USD
  PAYMENT TERMS 30 days. Not inclusive of taxes/VAT.
  LEED: step 1. 30% at the beginning
        step 2. 40% at the completion of design
        step 3. 30% at the completion of construction
```

**La fattura** è lo step 1, e non aggiunge niente che l'offerta non sapesse:

```
  Invoice No. 3.089                       September 29, 2026
  30% LEED ID+C GOLD consultancy            6.750,00 USD
  Payment Terms: 30 days  →  Due by: October 29, 2026
```

6.750 è il 30% di 22.500. **La fattura è l'offerta, divisa.** È esattamente il
«se scrivo step 2 me lo divide lui» della registrazione — e qui si vede che il
dato per farlo c'è già tutto, scritto nell'offerta.

Tre cose meno evidenti, che cambiano la specifica:

**La fattura non è intestata a Louis Vuitton.** È intestata a **TPG
Architecture, LLP**, New York. Il progetto è Louis Vuitton Dallas, chi paga è lo
studio di architettura. Sono due cose diverse e il sistema le tiene già separate
— ma la vista «per cliente» di R8 deve dire quale delle due sta raggruppando,
o sommerà mele e pere.

**«The amount invoiced is net, all bank fees have to be paid by the payer».** È
la clausola che sta in fondo a ogni fattura, ed è il fondamento contrattuale
degli ammanchi: i 56,50 e i 19,50 che compaiono in OUTSTANDING nel prospetto
**non sono uno sconto accettato**, sono una clausola non rispettata. Nel testo
dei recall vale la pena dirlo con quelle parole.

**Questa fattura non è nel sistema.** Cercando 3.089 non si trova niente, e non
esistono né TPG Architecture come contatto né Louis Vuitton come brand: il
registro arriva alla 3.077 di settembre. Non è un difetto — è la ragione per cui
esistono R7 e R14.

---

# Le richieste

---

## R1 · La nota sulla fattura, con il pallino

**Cosa serve.** Nel registro, poter scrivere una nota per fattura («pagano a fine
settembre», «richiesta quietanza»), vederla con un **pallino giallo** sulla riga,
e cercarla. Note standard precompilate — *Pagamento predisposto* — sempre
modificabili.

**Cosa c'è già.** Più di quanto sembrava. `invoice_notes` (id, invoice_id, date,
text, created_by) **e il componente che le scrive**: `NoteFattura`, completo di
elenco, campo di scrittura e salvataggio con Invio. È montato **nella pagina
Recall**, su ogni riga, con la scritta *«Cosa ti ha detto il cliente…»*.

Zero righe scritte perché i Recall mostrano solo le 18 fatture in sollecito:
tutto quello che succede prima — una promessa arrivata su una fattura non ancora
scaduta — non ha oggi un posto dove essere annotato. È esattamente il buco che
Francesca copre in Excel.

C'è anche `invoices.notes`, un campo libero singolo, **mai mostrato da nessuna
parte**.

**Cosa manca.** Portare lo stesso componente nel Registro Fatture, il pallino, le
note rapide e la ricerca dentro le note. E una decisione: `invoices.notes` e
`invoice_notes` sono due posti per lo stesso fatto, e uno dei due non si vede.

**Dove vanno i dati.** In `invoice_notes`, sempre: una nota ha una data e un
autore, e la storia di cosa ha detto il cliente è esattamente ciò che serve nei
recall. `invoices.notes` resta per la nota *strutturale* della fattura (perché è
stata emessa così), e non si mescola con il diario del sollecito. Il pallino
giallo è `exists(nota)`, calcolato nella vista — non una colonna.

**Proposta di soluzione.**

Nel Registro Fatture, la riga guadagna **un pallino** subito dopo il numero:

```
● 2.769   Kering Eyewear   Turati 28    4.440,00   ← ha note
  2.743   Boucheron        Vendôme      2.520,00   ← non ne ha
```

**Niente pannello nuovo**: le note vanno **dentro la riga che si apre già**,
accanto a *Incassi registrati* e *Note di credito collegate*. Quella riga esiste
per rispondere a «come si è arrivati a questo residuo», e cosa ha detto il
cliente è parte della stessa risposta. Il pallino segnala che là sotto c'è
qualcosa da leggere; aprirlo è il gesto che si fa già.

Diventa una terza colonna del dettaglio:

```
┌── 2.769 · Kering Eyewear · Turati 28 ─────────────────────────────────────┐
│                                                                           │
│  Incassi registrati      Note di credito    Aggiornamenti dal cliente     │
│  20/08 · bonifico        Nessuna            30 set  pagano entro il 30    │
│           2.360,00                          12 set  richiesta quietanza   │
│                                                                           │
│                                             ( Pagamento predisposto )     │
│                                             ( Richiesta quietanza )       │
│                                             ( Ricevuta dal cliente )      │
│                                             ┌───────────────────────┬───┐ │
│                                             │ Cosa ti ha detto il…  │ ➤ │ │
│                                             └───────────────────────┴───┘ │
│                                                                           │
│  Residuo = 4.440,00 − 2.360,00 − 0,00 = 2.080,00                          │
└───────────────────────────────────────────────────────────────────────────┘
```

**Il campo di scrittura è quello che già usi nei Recall**, identico: si scrive e
si preme Invio. Non è un componente nuovo, è lo stesso portato dove serve.

Le tre etichette sopra sono l'unica aggiunta, e **non sono semplici
scorciatoie di testo**: sono gli esiti tipici di una telefonata, e alcuni
portano con sé una data. Il dettaglio è in R2, perché è lì che quella data
diventa previsionale — il gesto è uno solo.

La ricerca del registro cerca **anche dentro le note**: scrivendo «quietanza»
escono le fatture per cui l'hai chiesta.

**Le note si correggono, e niente si perde.** Una riga sbagliata o una notizia
cambiata si modificano sul posto; l'interfaccia mostra sempre **la versione
buona**, e sotto c'è **Storico** per andare a riprendere quello che c'era prima.

Sotto, la correzione non sovrascrive: scrive una riga nuova che dichiara quale
sostituisce (`invoice_notes.sostituisce_id`). Il diario resta immutabile — è
quello che serve il giorno che si discute con un cliente su chi ha detto cosa —
ma chi lavora vede una lista pulita e può correggere un errore di battitura
senza chiedere il permesso a nessuno.

```
Aggiornamenti dal cliente                              [ storico ]
  30 set  pagano entro il 30            (modificata)   ✎
  12 set  richiesta quietanza                          ✎
```

Aprendo **storico**:

```
  30 set  pagano entro il 30                   MM, oggi 11:04
          ← sostituisce «pagano entro il 20»   MM, 30 set 09:12
```

*Nuovo codice*: pochissimo. `NoteFattura` e `useNoteFattura` esistono e
funzionano: si montano nel dettaglio del Registro, si aggiungono il pallino, gli
esiti rapidi, la ricerca e la correzione. *Nuovo schema*:
`invoice_notes.sostituisce_id`.

**Un difetto da sistemare qui.** Nei Recall, il bottone *Bonifico disposto*
risponde **«Annotato: bonifico disposto, 30 giorni»** — ma non annota niente: è
un messaggio, e nella storia della fattura non resta traccia. Chi lo legge crede
di aver lasciato una nota che non c'è. Quando si farà `fn_registra_esito` (R2)
quel gesto scriverà davvero la sua riga in `invoice_notes`, e il messaggio
diventerà vero.

---

## R2 · La data di incasso attesa — il cuore del previsionale

**Cosa serve.** Una data che dica **quando mi aspetto davvero i soldi**, distinta
dalla scadenza.

> «Non è scadenza, perché scadenza è già scaduta. Mi ha mandato una mail:
> abbiamo fatto il bonifico, lo vedrai addebitato il 30 settembre.»

Si compila a mano quando il cliente lo dice. **Se il cliente non dice una data,
la fattura non entra nel previsionale** — regola esplicita di Francesca. Esistono
già promesse per novembre.

**Cosa c'è già.** `fn_bonifico_disposto(fattura, giorni)` scrive esattamente
questo in `yellow_until` e sospende il rosso. Ma: obbliga
`lifecycle_state = 'in_recall'`, quindi funziona **solo su fatture già scadute**.
Francesca ha promesse su fatture non ancora scadute.

**Cosa manca.** Poter registrare la promessa su una fattura non ancora scaduta.

**Dove vanno i dati.** Una colonna sola su `invoices`:

```
data_incasso_attesa       date
data_incasso_attesa_fonte text  -- 'cliente' | 'bonifico_disposto' | 'stima'
```

`yellow_until` **viene eliminata**: ha zero righe, e tenere due colonne per la
stessa data è il modo in cui fra sei mesi non si sa più quale guardare. Il
vincolo `invoices_giallo_ha_scadenza` si riscrive su `data_incasso_attesa`, e
`fn_bonifico_disposto` diventa il caso particolare — *promessa su fattura
scaduta* — di un gesto più generale.

Il giallo in recall resta **una conseguenza**: è giallo quando c'è una promessa
viva. Non si scrive: si deduce.

**Proposta di soluzione.**

**Un gesto solo, non due.** Non si compila prima una nota e poi un campo data:
si spunta cosa ha detto il cliente, e se quell'esito porta una data la si
scrive lì.

```
Aggiornamento dal cliente

  ( ) Pagamento predisposto        entro il [ 30/11/2026 ]   → previsionale
  ( ) Bonifico disposto            accredito [ __/__/____ ]  → previsionale
  ( ) Richiesta quietanza                                      solo diario
  ( ) Fattura ricevuta dal cliente                             solo diario
  ( ) Altro  [ Cosa ti ha detto il cliente…            ]  [ data facoltativa ]

                                                        [ Registra ]
```

Spuntando una voce con la data, in un colpo solo:

1. nasce la **nota** in `invoice_notes` — *«Pagamento predisposto entro il
   30/11»* — con la sua data e il suo autore;
2. si scrive `data_incasso_attesa` sulla fattura;
3. la fattura **entra nella vista Follow-up** del mese di novembre (R3);
4. se era scaduta, passa in **giallo** e il rosso si sospende.

**Perché non tutti gli esiti portano una data.** «Richiesta quietanza» e
«fattura ricevuta» non sono promesse di pagamento: sono fatti utili al diario,
ma non dicono quando arriveranno i soldi. Se entrassero nel previsionale con una
data inventata, il previsionale direbbe una cifra che nessuno ha promesso — ed è
proprio la regola che hai posto tu: *se non mi scrivono quando, non lo metto nel
previsionale*.

Quindi ogni esito ha due proprietà: **chiede una data** sì/no, ed **entra nel
previsionale** sì/no. Sono le stesse due proprietà, e per questo la casella con
il campo data accanto è anche la spiegazione visiva di cosa succederà.

**La data, quando si sa solo il mese.** Il campo accetta il giorno oppure il
mese:

```
[ 30/11/2026 ]     oppure    [ novembre 2026 ▾ ]
 data esatta                  solo il mese → registra il 30/11, mostra «novembre»
```

L'ultimo giorno del mese è l'ipotesi prudente: non anticipa cassa.

**Cosa serve sotto.** Una funzione sola:

```sql
fn_registra_esito(p_invoice_id, p_esito, p_data, p_testo)
```

e una colonna in più sulle note:

```
invoice_notes.tipo text   -- 'pagamento_predisposto' | 'bonifico_disposto'
                          -- | 'quietanza_richiesta' | 'fattura_ricevuta' | 'libera'
```

Il tipo **non è ricavabile dal testo** — si può sempre scrivere a mano — e serve
a due cose vere: mostrare la pastiglia colorata nella vista Follow-up, e
rispondere alla domanda che conta quando si decide se mandare una pratica al
legale: *quante volte questo cliente ha promesso e non ha pagato?* Oggi quella
domanda non ha risposta.

`fn_bonifico_disposto` resta e diventa una chiamata a questa, così il bottone
che c'è già nei Recall non cambia — e finalmente **annota davvero**, invece di
dire di averlo fatto.

**Quando la promessa scade.** Se arriva la data e il pagamento non c'è, l'avviso
`recall_yellow_expired` — che nel sistema esiste già — riporta la fattura in
rosso. La promessa mancata resta nel diario, ed è quella che conta.

*Nuovo schema*: due colonne su `invoices`, una eliminata, una colonna su
`invoice_notes`, un vincolo riscritto.

---

## R3 · Follow-up del mese — il foglio che Francesca consegna ogni venerdì

**Cosa serve.** La struttura è quella di **`prospetto 1 3.xlsx`**, che ha un
foglio per mese e due forme.

**Previsionale** — *«PROSPETTO FATTURATO IN ENTRATA PREVISIONALE A FINE MESE»*:

| Colonna del foglio | Da dove viene |
|---|---|
| DATA FATTURA | `invoices.issue_date` |
| CLIENTE | `contacts.company_name` |
| N. FATTURA | `invoices.number` |
| PROGETTO | `certifications.name` |
| IMPORTO | `invoices.total` − IVA (l'imponibile) |
| VAT | `invoices.vat_amount` |
| RECALL | SI / NO — calcolato |
| NOTE / INFO | ultima `invoice_notes` (R1) |
| *totale in fondo* | somma degli importi |

**Definitivo** — *«PROSPETTO FATTURATO ENTRATO … DEFINITIVO»*: le stesse
colonne, più **OUTSTANDING** (quello che di quella fattura non è arrivato) e
**DATA PAGAMENTO**.

Due osservazioni dai fogli veri, che valgono più di qualunque descrizione:

**Il totale di settembre è `=SUM(E3:E13)-7500`.** Quel 7.500 è la fattura
H.I.G. Vitoria, che nel foglio di ottobre ricompare. Cioè: una fattura slitta, e
qualcuno deve ricordarsi di sottrarla a mano da un mese e riscriverla nell'altro.
Con l'incasso atteso (R2) **la riga si sposta da sola** e quel `-7500` sparisce
— è il singolo punto in cui il foglio è più fragile.

**In OUTSTANDING ci sono 56,50 e 19,50.** Sono le trattenute bancarie di cui
abbiamo già parlato a settembre: il sistema le conosce come *ammanchi*, le tiene
nel residuo in ambra e sa che vanno riversate sulla fattura dopo. Nel foglio
sono due numeri senza nome.

In più rispetto al foglio, due cose che il foglio non può avere:

- **giorni in recall**, contati dal primo sollecito — il tuo *«ci sono dietro
  letteralmente da due mesi»*, detto dal sistema invece che a memoria;
- **incasso atteso** (R2), che è quello che decide in quale mese la riga cade.

**Cosa c'è già.** Tutti i dati. Nessuno di questi campi è nuovo salvo la nota
(R1), l'incasso atteso (R2) e il conto dei giorni.

**Cosa manca.** La vista `v_followup_fatture` e la pagina che la filtra per mese.

**Dove vanno i dati.** Da nessuna parte: è una vista. **Non** si crea una tabella
«resoconti»: sarebbe una copia che invecchia. Il filtro per mese lavora su
`coalesce(data_incasso_attesa, due_date)` nel previsionale, e su
`invoice_payments.date` nel definitivo. Sono due domande diverse sugli stessi
dati.

**Proposta di soluzione.**

Una scheda nuova dentro Payments, **Follow-up**, con l'interruttore fra le due
forme e il mese — un foglio del tuo file, ma che si compila da solo:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ( Previsionale )  ( Definitivo )      ◂ settembre 2026 ▸   Società: ▾   │
└──────────────────────────────────────────────────────────────────────────┘

 DATA FATT.  CLIENTE                    N. FATTURA   PROGETTO                IMPORTO    VAT  RECALL  NOTE
 12/03/26    Prada USA Corp.            2.956        PRADA Las Vegas Forum    18.350      —    SI    ● pagamento fatto, chiesto agg.
 22/06/26    Audemars Piguet Japan      2.987        AP Tokyo Ginza            8.700      —    SI    ● chiesta quietanza 30/09
 16/07/26    Alexander McQueen          3.002        AMQ Old Bond Street      11.200  2.240    SI    ● pagato, non lo vediamo
 20/08/26    Michael Kors Portugal      3.013        MK Free Port Lisbon       8.400      —    SI    ● riceveremo il 30/09
 21/09/26    Versace Taiwan             3.077        Versace Taipei Breeze    17.300  4.325    NO
 ──────────────────────────────────────────────────────────────────────────────────────────────────
 11 fatture · atteso a settembre 105.950
```

E in **Definitivo**, le due colonne in più:

```
 DATA FATT.  CLIENTE            N. FATTURA  PROGETTO           IMPORTO   VAT  OUTSTANDING  PAGATA IL  RECALL
 21/05/26    Versace USA        2.978       Orlando Millenia   16.693,50   —        56,50  16/09      SI
 23/06/26    Prada Germany      2.991       Prada Munich       21.680,50   —        19,50  07/09      SI
```

**Previsionale** mostra le fatture il cui incasso atteso cade nel mese scelto —
e, come hai chiesto, **solo quelle con una data**: una fattura di cui il cliente
non ha detto niente non compare, perché metterla vorrebbe dire promettere cassa
che nessuno ha promesso.

**Definitivo** mostra gli incassi effettivamente arrivati nel mese, dalla data
del pagamento. È lo stesso mese letto da due parti.

**Il filtro per società emittente** in alto a destra: il tuo altro file si
chiama *«Da recuperare Zmyrna»*, cioè è già diviso per entità. Qui è una tendina
invece che un file separato, e *tutte* è l'impostazione di partenza.

**Le note si aprono sul posto**: il pallino apre la riga con il diario e il
campo per aggiungere, come nel Registro (R1). Nel tuo foglio le note stanno
tutte schiacciate in una cella — *«Pagamento 25/09 controllo, 30/09 chiesta
quietanza»* — e crescendo diventano illeggibili. Qui sono righe con la loro
data, e la cella mostra l'ultima.

I **giorni in recall** contano dal primo sollecito registrato, non dalla
scadenza: misurano quanto ci stai mettendo tu, non quanto ha tardato lui. Se non
c'è ancora nessun sollecito la casella è vuota — un conto che parte da zero
quando nessuno ha ancora chiamato sarebbe un numero falso.

In fondo, **Esporta Excel** con le stesse colonne e lo stesso ordine del tuo
prospetto: il foglio del venerdì si consegna senza ricopiare niente, e chi lo
riceve non si accorge del cambio.

**Le iniziali — LM, MV, FGB — non diventano un campo.** In *EXCEL X RECALL*
quella colonna dice chi ha messo le mani sulla fattura, e il sistema lo sa già:
`created_by` sta su **ogni** riga — fattura, nota, sollecito, incasso. Chi la
segue è **l'ultimo che ci ha lavorato**, e si calcola; scriverlo a mano vorrebbe
dire tenere aggiornata una colonna che dice quello che il registro delle azioni
dice da solo, e che diverge il primo giorno che qualcuno si dimentica.

Nella tabella compare come iniziali, e nei Recall si filtra **«i miei»**.

**Due limiti da sapere, perché oggi quella colonna sarebbe vuota:**

1. Le **69 fatture attuali hanno `created_by` nullo**: sono entrate da
   migrazione, e una migrazione non ha un autore. La traccia parte da qui in
   avanti. Per lo storico l'unico modo è dirlo a mano, se serve davvero.
2. La traccia vale quanto gli **account**. Se Francesca lavora dalla sessione
   `monitoring@fgb-studio.com` — quella in uso oggi — ogni riga dirà
   «monitoring», e LM, MV e FGB diventano la stessa persona. Perché le iniziali
   significhino qualcosa, ognuno deve entrare col proprio accesso.

*Nuovo schema*: una vista.

---

## R4 · Le regole di sollecito, codificate

**Cosa serve.** Oggi i recall si fanno «ogni lunedì e mercoledì», a memoria. Le
regole vere sono tre:

- **7 giorni prima della scadenza** → promemoria *verde*: «sta per scadere».
- **Il giorno dopo la scadenza**, se non è stato registrato un incasso e non c'è
  una promessa viva → *arancione*: fai recall.
- **Da lì in poi, ogni lunedì e ogni mercoledì**, un nuovo recall, settimana
  dopo settimana, **finché non arriva il pagamento**. Se dopo il pagamento resta
  un residuo, la fattura **non torna nella cadenza**: resta **gialla**, e si
  bilancia a fine progetto.

Devono comparire in dashboard, e come campanellino nel Registro Fatture e nei
Recall.

**Cosa c'è già.** `task_alerts` con deduplica (`dedup_key`), `fn_apri_alert`,
`fn_chiudi_alert`, e la dashboard che li mostra. `invoice_reminders` per
registrare il sollecito fatto. Il tipo `recall_yellow_expired` esiste già.

**Cosa manca.** Due valori nell'enum `task_alert_type` —
`recall_pre_scadenza`, `recall_post_scadenza` — e la funzione che li apre e
chiude da sola.

**Dove vanno i dati.** Negli avvisi esistenti. Nessuna tabella nuova. La regola è
codice, non dati: `fn_ricalcola_avvisi_fatture()` chiamata una volta al giorno,
che apre quello che deve esserci e **chiude quello che non serve più** — un
incasso registrato chiude il suo avviso senza che nessuno lo tocchi.

**Proposta di soluzione.**

Una funzione sola che rilegge tutte le fatture aperte e sistema gli avvisi:

```
per ogni fattura con residuo > 0:
    se manca ≤ 7 giorni alla scadenza e non c'è promessa
        → apre  recall_pre_scadenza     «sta per scadere fra N giorni»
    se è scaduta da ≥ 1 giorno e non c'è promessa viva
        → apre  recall_post_scadenza    «scaduta da N giorni · N-esimo sollecito»
        e da lì, ogni lunedi' e ogni mercoledi', ne apre uno nuovo
    se c'è una promessa viva (data attesa ≥ oggi)
        → chiude entrambi                la palla è dal cliente
    se è arrivato un pagamento
        → chiude tutto                   e se resta un residuo: giallo
```

**La cadenza del lunedì e del mercoledì.** Il primo recall nasce il giorno dopo
la scadenza, qualunque giorno sia. Poi il ritmo diventa quello del vostro giro:
ogni lunedì e ogni mercoledì un avviso nuovo, **finché non arriva il pagamento**.

**Quando il pagamento arriva ma non basta.** La cadenza si ferma lo stesso.
Quello che resta scoperto diventa **giallo** e smette di generare avvisi due
volte a settimana: si bilancia a fine progetto. Il meccanismo esiste già ed è
quello degli **ammanchi** costruito a settembre — il residuo in ambra che viene
riversato sulla fattura successiva dello stesso progetto.

Il perché è pratico: nessuno telefona il lunedì e il mercoledì per 19,50 €, ma
nessuno deve nemmeno dimenticarseli. Il giallo è esattamente questo — *aperto,
ma non è un sollecito*.

La deduplica lavora sulla giornata: `dedup_key = 'recall_post:<id>:<data>'`.
Vuol dire che se la funzione gira tre volte lo stesso lunedì l'avviso resta uno,
e che il mercoledì ne nasce comunque uno nuovo.

**Quello vecchio si chiude quando nasce il nuovo.** Altrimenti dopo un mese di
insoluto la dashboard avrebbe nove avvisi per la stessa fattura e nessuno la
guarderebbe più. Resta **un avviso vivo per fattura**, che però **torna a farsi
vedere** ogni lunedì e ogni mercoledì anche se qualcuno l'aveva archiviato — che
è il punto: un sollecito rimandato non deve sparire.

Nel testo dell'avviso c'è il conto: *«Taiwan Corp — 2.612 scaduta da 76 giorni ·
9° sollecito»*. È la stessa cifra che nella registrazione hai chiamato «so che
sono dietro da due mesi», e qui te la dice il sistema invece di farti guardare
le date.

Una cosa che il sistema **non** sa: le feste. Un lunedì di Pasquetta l'avviso
nasce lo stesso. Se vuoi saltarle serve un calendario dei giorni non lavorativi,
che oggi non c'è — dimmi se vale la pena.

**Cosa cambia a schermo:**
- in **Dashboard**, gli avvisi compaiono fra le cose da fare, con il colore che
  già hanno: verde il preavviso, arancione lo scaduto;
- in **Registro Fatture** e **Recall**, un **campanellino** sulla riga, che porta
  al gesto: registra sollecito, oppure registra la promessa (R2);
- premendo «sollecito fatto» si scrive in `invoice_reminders` e l'avviso si
  chiude fino al prossimo giro.

**Da concordare**: chi la fa girare ogni giorno. Il sistema non ha oggi uno
scheduler; la soluzione più semplice è farla partire quando qualcuno apre
Payments — è idempotente, e i pagamenti li guarda qualcuno ogni giorno. Va bene
o preferisci un cron vero?

*Nuovo schema*: due valori d'enum, una funzione.

---

## R5 · I parziali restano finché non si chiudono davvero

**Cosa serve.** Le fatture pagate a metà devono restare **visibili oltre
l'anno**, finché non si dispone il bonifico o si blocca il progetto. Oggi sono 7.

> «Li mandiamo con le cose a fine anno quando mancano le cifrette piccole.»

**Restare visibili non vuol dire restare nella cadenza.** Come detto in R4, un
residuo dopo un pagamento è **giallo**: continua a comparire negli elenchi e nel
follow-up, ma non genera un avviso ogni lunedì e mercoledì. Si bilancia a fine
progetto. Le due regole dicono la stessa cosa da due lati: *non si perde di
vista, non si insegue*.

**Cosa c'è già.** Il residuo è calcolato e `fn_riallinea_fattura` chiude la
fattura solo quando arriva a zero. Quindi un parziale **resta già** in recall: il
comportamento richiesto è quello attuale.

**Cosa manca.** Niente sul motore. Va verificato che nessun filtro
dell'interfaccia le nasconda: il Registro ha un filtro per anno, e i Recall
potrebbero ereditarlo.

**Dove vanno i dati.** Da nessuna parte: nessun dato nuovo.

**Proposta di soluzione.**

Tre accorgimenti nell'interfaccia dei **Recall**:

1. Il filtro per anno **non si applica** ai recall — o meglio, nasce su «tutti».
   Una fattura del 2025 ancora scoperta deve vedersi nel 2026, altrimenti la
   regola giusta del motore viene annullata da una tendina.
2. Una riga di parziale mostra **quanto manca**, non quanto è stato pagato:

```
2.612  Taiwan Corp   11.000,00   incassati 8.500,00   ► mancano 2.500,00   (parziale)
```

più un contrassegno **oltre l'anno** per quelle che trascinano da più di dodici
mesi — sono proprio quelle che vanno nel giro di fine anno.

3. I parziali stanno in una **sezione loro**, sotto quelle da inseguire, con il
   titolo che dice cosa sono: *da bilanciare a fine progetto*. Mescolarle agli
   insoluti veri farebbe sembrare un problema quello che è un'operazione di
   chiusura.

E una prova automatica che tenga ferma la regola: *una fattura con residuo
positivo non esce dai recall per il passare del tempo*. È il genere di cosa che
si rompe per sbaglio con un filtro, sei mesi dopo.

*Nuovo schema*: niente.

---

## R6 · Registrare l'incasso: un filtro, non una pagina

**Cosa serve.** Francesca entra e registra i pagamenti. Serviva una vista delle
sole fatture pendenti.

**Decisione presa nella registrazione**: *non* si fa una pagina nuova.

> «Non stare a farti un'altra da lavorare qua dentro… quindi clicco qua e filtra,
> vabbè la stessa cosa.»

**Cosa c'è già.** Il filtro per stato di pagamento nel Registro Fatture, e il
dialogo che registra l'incasso.

**Cosa manca.** Una scorciatoia visibile che applichi il filtro senza doverlo
comporre.

**Dove vanno i dati.** Da nessuna parte.

**Proposta di soluzione.**

In cima al Registro Fatture, accanto ai chip di stato che già ci sono, **due
riquadri con il conto e la cifra**:

```
┌──────────────────────┐ ┌──────────────────────┐
│  DA INCASSARE        │ │  PARZIALI            │
│  18 fatture          │ │  7 fatture           │
│  46.085,50 €         │ │  12.340,00 €         │
└──────────────────────┘ └──────────────────────┘
```

Cliccabili: applicano il filtro. Non sono una pagina, non sono un calcolo nuovo —
sono i numeri che il registro ha già in fondo, portati in cima dove si guardano.

Nel dialogo di incasso, un solo ritocco: **la data proposta è oggi**, e se la
fattura aveva una promessa (R2) compare sotto, scritta — *«il cliente aveva detto
30/11»* — così chi registra vede subito se è arrivato in ritardo.

*Nuovo schema*: niente.

---

## R7 · Il file di Francesca: le note, agganciate per numero

**Cosa serve.** Caricare prima tutte le fatture (PDF, import già pronto), poi il
file Excel di Francesca con le note e gli aggiornamenti dei clienti,
**agganciando per numero di fattura**.

> «Serve la chiave» — la chiave è il numero.

**Cosa c'è già.** L'import da PDF con OCR e `invoices_numero_per_emittente`
(unico), che è precisamente la chiave.

**Cosa manca.** Niente da costruire. Il travaso si fa **una volta sola**, e una
funzione che serve una volta sola non va messa nell'interfaccia: sarebbe un
bottone che nessuno preme più, da mantenere per sempre.

**Dove vanno i dati.** In `invoice_notes` (R1) per le note, e in
`data_incasso_attesa` (R2) dove il foglio porta una data promessa. Nessuna
colonna nuova: il foglio di Francesca **non è una tabella da ricreare**, è un
travaso in quelle che esistono.

**Proposta di soluzione.**

**Una migrazione, non una pagina.** Leggo il file, abbino per numero, e ti
mostro **qui** l'esito prima di scrivere niente:

```
✓ 2.769  → Kering / Turati 28      nota: «pagano entro il 30»
✓ 2.612  → Taiwan Corp / Taipei    nota: «sollecitato 3 volte»   attesa: 30/09
✗ 2.998  → nessuna fattura con questo numero
⚠ 2.743  → nota identica già presente, viene saltata
```

Le rosse quasi sempre sono fatture non ancora caricate: si risolvono caricando
quel PDF (R7 e l'import già fatto lavorano insieme).

Le note importate portano **la data che hanno nel foglio**, non quella
dell'import: il diario deve raccontare quando il cliente ha detto quella cosa.

**Da lì in avanti il foglio smette di esistere.** Le note si scrivono nel
Registro (R1), l'incasso atteso nel Registro (R2), e il prospetto del venerdì
esce dal Follow-up (R3). Non c'è un secondo travaso: se ci fosse, vorrebbe dire
che qualcuno sta ancora tenendo l'Excel in parallelo, ed è proprio la cosa che
questa specifica serve a far finire.

*Nuovo schema*: niente. *Nuovo frontend*: niente.

---

## R8 · La vista per cliente — quello che Francesca ricostruisce a mano

**Cosa serve.** La struttura è quella di
**`2026_FGB_Projects_Payment_Update`**, che ha due livelli.

**Livello 1 — «Elenco Progetti»**, una riga per progetto:

```
# · Client · Project name · Società intestataria fatturazione · Città · Stato
  · Protocollo · Versione · Livello · Destinazione d'uso
  · Metodo fatturazione previsto
  · Fees Totali · Totale fatturato · % fatturazioni · Residuo da fatturare
  · Totale incassato · Residuo da incassare
  · Project status · PM
  · Agreement/PO/signed quotation? · Invoicing details
  · Invoicing step in agreement with project status
  · Invoicing process completed · Comments
```

**Livello 2 — un foglio per cliente** (Amazon, Louis Vuitton…), dove ogni
progetto è una riga lunga divisa in blocchi:

| Blocco | Colonne |
|---|---|
| Il progetto | Project Code and Project Name · Services Fees · **Monitor Fees** · Total · CONTRACT DATE Services · CONTRACT DATE Monitor · Metodo fatturazione previsto · Comments |
| **PHASE 1** *at the beginning* | Invoiced Amount · Invoice number · Invoice Date · Date payment · days PD · Comments |
| **PHASE 2** *end of design* | le stesse sei |
| **PHASE 3** *end of construction* | le stesse sei |
| Summary | Totale fatturato · % fatturazione · Residuo da fatturare · Totale incassato · Residuo da incassare · commenti |
| Invoicing information | Company and invoicing details · Contact for invoicing |

e tre sezioni in verticale: progetti attivi, **COMPLETED PROJECTS**,
**CANCELLED** — gli stessi tre gruppi della registrazione.

**Cosa c'è già.** Quasi tutto, e ogni numero del sommario è calcolabile:
- *Fees totali* = `certifications.total_fees`
- *Totale fatturato* = somma delle fatture del progetto
- *% fatturazione* = il rapporto fra i due
- *Residuo da fatturare* = tranche senza fattura (oggi 109 in tutto)
- *Totale incassato* = somma degli incassi
- *Residuo da incassare* = fatturato − incassato
- Protocollo, versione, livello, destinazione d'uso, PM, stato: tutti campi che
  la certificazione ha già
- Le fasi 1-2-3 con numero, data e importo: sono le tranche con la loro fattura

**Cosa manca.** La vista, la pagina, e **due dati che il foglio ha e il database
no**:

1. **Monitor Fees separate dalle Services Fees.** La certificazione ha
   `services_fees` e `gbci_fees`, non una voce per il monitoraggio: oggi finisce
   dentro il totale senza un nome.
2. **La data di firma del contratto**, distinta per servizi e per monitoraggio —
   nel foglio di Louis Vuitton c'è scritto *«Approvation via e-mail
   10/09/2026»*. Il sistema ha `quotation_approved_at`, una sola.

**Un difetto del foglio che vale la pena non ereditare.** Nella riga di Louis
Vuitton *Totale incassato* vale 6.750 — ma la colonna *Date payment* è vuota:
quei soldi non sono ancora arrivati. La formula è `=J6`, cioè **copia
l'importo fatturato**. Il foglio non sa distinguere fatturato da incassato, e
chi lo legge crede di avere in cassa una somma che è ancora un credito. Nel
sistema l'incassato è la somma degli incassi registrati, e finché non c'è un
incasso vale zero.

**Dove vanno i dati.** Da nessuna parte. **Nessun totale va scritto**: sono tutti
rapporti fra righe che esistono. Un totale scritto è un totale che un giorno non
torna — e il 6.750 qui sopra è proprio quel giorno.

**Proposta di soluzione.**

**Registro Clienti** diventa a due livelli, come il foglio.

Chiuso, l'**Elenco Progetti**: una riga per progetto, le colonne del tuo primo
foglio, filtrabile e ordinabile:

```
 CLIENTE                        PROGETTO                        FEES     FATTURATO   %     DA FATT.  INCASSATO  DA INC.  STATO
 TPG Architecture × Louis V.    LV Dallas Highland Park       22.500       6.750    30%    15.750      6.750        0    Pre-assessment
 Amazon                         S.I.I.S. Milano                1.500           0     0%     1.500          0        0    Pre-assessment
 Kering Eyewear                 Turati 28 — LEED BD+C         17.000      11.900    70%     5.100      7.460    4.440    In corso
```

Aperto un progetto, le **tre fasi** con la loro fattura, cioè il tuo secondo
foglio girato in verticale perché ci stia a schermo:

```
 ▼ LOUIS VUITTON Dallas – Highland Park Village          LEED ID+C GOLD · Retail
   Fees servizi 22.500 · monitoraggio — · contratto 10/09/26 (e-mail)
   Metodo: step 1 30% inizio · step 2 40% fine design · step 3 30% fine costruzione

   FASE                        IMPORTO   FATTURA   EMESSA     PAGATA    GG      NOTE
   ✓ 1 · inizio        30%      6.750     3.089    29/09/26      —      33  ● in attesa
   ○ 2 · fine design   40%      9.000        —        —          —       —
   ○ 3 · fine costruz. 30%      6.750        —        —          —       —

   Fatturato 6.750 · 30% · da fatturare 15.750 · incassato 0 · da incassare 6.750
   Fatturazione a TPG Architecture, LLP — 132 West 31st Street, New York
```

Le spunte non sono uno stato scritto da nessuno: **✓** è «esiste una fattura per
questa tranche», **○** è «non esiste ancora». È il motivo per cui la percentuale
di fatturazione non va salvata — è il rapporto fra i due simboli.

I **GG** sono i giorni da quando la fattura è scaduta, o quanti ce ne sono voluti
se è stata pagata: il tuo *days PD*.

**Cliente e intestatario, come li scrivi tu.** Nel foglio il cliente è
*«TPG Architecture x Louis Vuitton»*: il pagante e il marchio, insieme, perché
servono entrambi. La vista fa lo stesso — intestatario × brand — e permette di
raggruppare in tutti e due i modi, perché sono due domande legittime: *quanto ho
fatturato a TPG* e *quanto vale il rapporto con Louis Vuitton*. Sommarli in una
colonna sola sarebbe l'unico errore possibile.

Lo stesso dato si raggruppa anche **per società emittente** — *«Francesca vuole
vedere per FGB Italia quanto fatturato»* — e si divide in **attivi / completati /
cancellati** come nel foglio.

In fondo, **Esporta Excel** con i due fogli: elenco e dettaglio per cliente.

**Da decidere insieme**: le **Monitor Fees** diventano un campo a sé sulla
certificazione (oggi finiscono nel totale senza nome), e serve una **seconda
data di firma** per il contratto di monitoraggio? Nel foglio ci sono due colonne
distinte, quindi immagino di sì — ma è schema nuovo e voglio la conferma.

*Nuovo schema*: una vista, più — se confermi — `monitor_fees` e
`contratto_monitor_firmato_il` sulla certificazione.

---

## R9 · Il credito del cliente da progetto cancellato

**Cosa serve.** Quando un progetto si cancella a metà e il cliente ha già pagato
più di quanto è stato fatto, **quella differenza è un credito suo**, da usare su
un progetto futuro.

> «Louis Vuitton cancella il progetto a metà strada. Questi 6.750 mi rimangono a
> credito e lui mi dice: li useremo per un progetto futuro.»

Al momento di cancellare, il sistema chiede: **esiste un credito? quanto?** E
quando Marco fa una nuova quotazione per lo stesso cliente, un avviso glielo
ricorda.

**Cosa c'è già.** `fn_blocca_per_insoluto` e lo sblocco automatico — ma sono
l'opposto (noi verso di loro). Le `credit_notes` sono note di credito su **una
fattura**, cosa diversa: qui il credito sopravvive al progetto che l'ha generato.

**Cosa manca.** Tutto. È l'unico fatto davvero nuovo di questa specifica.

**Dove vanno i dati.** Tabella nuova, perché non esiste un posto dove metterlo:

```
crediti_cliente
  id, contact_id, certification_id_origine, importo, valuta,
  motivo, stato ('aperto'|'usato'|'rimborsato'|'perso'),
  usato_su_certification_id, data, note, created_by
```

Il saldo del cliente è la somma degli aperti — **calcolato**, non scritto.

**Proposta di soluzione.**

Tre momenti.

**Quando si cancella.** Il gesto «Cancella progetto» apre una domanda invece di
eseguire in silenzio. Il sistema sa già quanto è stato incassato e quante tranche
erano state consegnate, quindi **propone** una cifra:

```
Cancelli «Louis Vuitton — Champs-Élysées».

  Incassato dal cliente        15.750,00
  Lavoro consegnato (2 di 4)    9.000,00
  ─────────────────────────────────────
  Differenza a suo favore       6.750,00

  ( ) Nessun credito: trattenuto per intero
  (•) Credito di [ 6.750,00 ] verso Louis Vuitton
      motivo [ progetto cancellato a metà ]
```

La cifra è **proposta, non imposta**: la parte «nostra» la decidi tu, e la
registrazione lo dice chiaro — *«noi ci terremo la parte nostra»*.

**Mentre il credito vive.** Compare nel Registro Clienti accanto al cliente, e
nella scheda anagrafica. Non si cancella: cambia stato.

**Quando torna utile.** Marco apre una quotazione per quel cliente e in cima al
wizard trova una fascia:

```
⚠ Louis Vuitton ha un credito aperto di 6.750,00 € da «Champs-Élysées» (cancellato il 12/03/26)
  [ Tienine conto ]  [ Ignora per questa offerta ]
```

**Non si scala da solo.** Premendo *Tienine conto* si segna il collegamento e il
credito passa a «usato», ma **l'importo dell'offerta lo scrive Marco**:
l'automatismo qui deciderebbe uno sconto al posto di una persona, e uno sconto è
una trattativa. Questo risponde alla domanda aperta — confermi che va bene così?

*Nuovo schema*: una tabella.

---

## R10 · Emettere una fattura — dalle tranche, o da zero

> **R10 e R11 erano la stessa cosa detta da due lati**, e qui diventano una.
> Il percorso completo parte da *Da Emettere*: si spuntano le tranche e si preme
> il bottone. Ma la stessa fattura deve potersi fare **senza un'offerta dietro** —
> un extra, un fuori contratto, un lavoro una tantum — e allora si parte dal
> Registro con il dialogo vuoto. **Un dialogo solo, due porte d'ingresso.**

**Cosa serve.**

Dalla lista di quello che c'è da fatturare: il **nome del progetto** (oggi
manca), delle **caselle di spunta**, e un bottone che da più righe spuntate apra
la fattura già piena.

> «Apple Lead 50% e Apple Brian 50%… spunti queste, premi Invoice, ti si genera
> la fattura intestata a Apple.»

E nel dialogo, quattro cose che oggi non vanno:

| Campo | Oggi | Come deve essere |
|---|---|---|
| IVA | importo a mano | preset **22 / 9 / 13 / Custom**, e l'importo si calcola |
| Termini | giorni a mano | preset **30 / 60 / 90 / 30 fine mese / Custom** |
| Numero commercialista | c'è | **sostituito da numero PO**, scritto a mano |
| Totale | uno solo | **le righe**, una per tranche, con la loro percentuale |
| Società emittente | scelta a mano | **proposta dall'offerta**, sempre modificabile |

> «Se questa cosa è automatizzata, se io scrivo solo step 2, me ne divide lui.»

**Cosa c'è già.** La pagina **Da Emettere** con `due` e `pending` separati e gli
avvisi che ci portano dentro. Il dialogo di emissione. Il numero progressivo per
società (`fn_nuovo_numero_fattura`). L'emittente sulla certificazione
(`certifications.issuer_contact_id`). L'aggancio alla tranche
(`invoices.tranche_id`).

**Cosa manca.** Le spunte, il nome progetto, i preset, il numero PO — e la cosa
di struttura: **una fattura oggi può stare su una sola tranche**, e non può
avere righe libere.

**Dove vanno i dati.**

```
invoice_righe (invoice_id, tranche_id NULL, descrizione, importo, ordine)
```

Una riga **può** appoggiarsi a una tranche, oppure no. È questo che tiene
insieme i due percorsi con un solo modello: la fattura da offerta ha righe con
`tranche_id`, la fattura libera ha righe con solo descrizione e importo, e il
documento (R12) le stampa allo stesso modo.

`invoices.tranche_id` viene **travasata e poi eliminata** (57 fatture da
migrare): due colonne che dicono la stessa relazione, una delle quali sa contare
fino a uno, sono la ricetta per un totale che non torna.

`invoices.total` **resta il fatto** — è quello che dice il documento e quello
che la contabile riconcilia. Quando ci sono righe, un controllo verifica che
sommino all'imponibile: non è una seconda verità, è la stessa verità che deve
tornare. Le 69 fatture storiche non hanno righe e restano come sono.

In più: `invoices.po_riferimento text`. **L'aliquota IVA non si salva**: è
imposta ÷ imponibile, e salvarla creerebbe un terzo numero che può non tornare
con gli altri due.

**Proposta di soluzione.**

**Porta 1 — da Da Emettere.** La lista si raggruppa **per cliente**, perché è
per cliente che si emette:

```
 ▼ Apple                                                    2 righe · 30.000
   ☑  Apple Lead    1ª tranche  50%  alla firma      15.000   esigibile
   ☑  Apple Brian   1ª tranche  50%  alla firma      15.000   esigibile
   ☐  Apple Lead    2ª tranche  50%  alla consegna   15.000   prevista

 ▼ Kering                                                    1 riga · 6.800
   ☐  Turati 28     2ª tranche  40%  fine design      6.800   esigibile

              [ Emetti fattura per le 2 selezionate → 30.000 ]
```

Spuntando righe di **clienti diversi** il bottone si spegne e dice perché: una
fattura ha un intestatario solo.

**Porta 2 — dal Registro.** *Nuova fattura* apre lo stesso dialogo senza righe:
si scelgono cliente ed emittente e si scrivono le righe a mano. Serve per gli
extra e per tutto quello che non nasce da un'offerta.

**Il dialogo, uguale per entrambe:**

```
Chi emette   [ FGB studio * Zmyrna Limited ▾ ]   ← dall'offerta, modificabile
A chi        [ TPG Architecture, LLP        ▾ ]   ← dal progetto, modificabile

Righe
  30%  LEED ID+C GOLD consultancy — LV Dallas          6.750,00   [tranche 1]
  50%  LEED consultancy — Apple Brian                 15.000,00   [tranche 1]
  +  aggiungi riga libera

Imponibile  21.750,00     IVA [ 22% ▾ ]  4.785,00     Totale  26.535,00
Termini     [ 30 ▾ ] giorni  → scadenza 30/11/2026
Numero PO   [                    ]        Valuta [ USD ▾ ]
```

Arrivando da *Da Emettere* le righe ci sono già, con la percentuale e il
progetto; arrivando dal Registro si aggiungono a mano. In tutti e due i casi si
possono correggere: una riga si può cancellare, e una tranche può essere
fatturata per meno di quanto prevedeva senza che nessuno debba mentire.

L'IVA si sceglie in aliquota e **l'importo si calcola sotto gli occhi**; con
*Custom* si scrive l'importo e l'aliquota sparisce, perché su molte fatture
estere non esiste — la 3.089 ne è l'esempio.

I **termini** propongono 30/60/90 e *30 giorni fine mese*: la scadenza si vede
aggiornarsi mentre scegli, così è evidente che è calcolata e non scritta.

**Il progetto della fattura si deduce dalle righe**: se sono tutte dello stesso
progetto è quello, se sono di progetti diversi la fattura non ne ha uno solo e
il legame sta sulle righe. È il motivo per cui `certification_id` sulla fattura
smette di essere il posto dove si guarda.

**Un avviso che il sistema deve dare da solo**: se l'emittente scelto è italiano,
sotto compare in chiaro

> *Le fatture italiane si emettono dal gestionale della fatturazione elettronica.
> Qui puoi registrarla e allegare il PDF.*

così nessuno prova a farla da qui e poi si accorge che non si può.

**Da concordare**: confermi che due progetti dello stesso cliente possono stare
sulla stessa fattura? È l'unica cosa che rende necessaria la tabella delle
righe — e i tuoi documenti dicono di sì (Apple Lead + Apple Brian).

*Nuovo schema*: una tabella (`invoice_righe`), una colonna eliminata
(`tranche_id`), una colonna aggiunta (`po_riferimento`), 57 righe migrate.

---
## R12 · Generare il documento della fattura — in Word

**Cosa serve.** Dalla fattura registrata, produrre **il .docx**, non il PDF, con
lo stesso percorso già collaudato per le offerte e impaginato come il template
di Bottega Veneta 2.946.

E, se serve, **standardizzare le diciture**: una serie di frasi pronte a seconda
dell'offerta, per non riscriverle ogni volta.

**Cosa c'è già.** Tutto il percorso. `genera-offerta` chiama un servizio Python
su Render che ha **LibreOffice e il template Word**: riempie il documento e lo
converte. La edge function sta in mezzo solo per la chiave, che non può vivere
nel bundle. Qui cambia una cosa sola: **ci si ferma al Word**.

C'è anche `invoices.documento_path` e il bucket privato dove conservarlo.

**Cosa manca.** Il template della fattura nel servizio, la mappatura dei campi,
e — se lo vuoi — il catalogo delle diciture.

**Dove vanno i dati.** Il documento generato va nello stesso archivio di quelli
importati, e il suo percorso in `invoices.documento_path`. Una fattura ha **un**
documento, che sia stato generato o caricato.

**Proposta di soluzione.**

**Il template è il tuo, campo per campo.** Dal .docx di Bottega Veneta:

```
  February 27th, 2026                           ← issue_date, formato inglese
  Bottega Veneta Inc                            ← contacts: intestatario
  150 Totowa Road
  Wayne, NJ 07470
  Tax ID: 13-2704379                            ← vat_number o tax_code

  BOTTEGA VENETA                                ← brand del progetto
  Honolulu – The Royal Hawaiian Center          ← nome del sito

  Invoice No. 2.946                             ← invoices.number
  WBS: W-INV-2010-13-26401-101                  ← po_riferimento (R10)

  Description of service provided: LEED ID+C Gold consultancy   ← dal catalogo

  50% LEED GOLD                        8.750,00 Euro   ┐
  50% EU Taxonomy                      2.250,00 Euro   │ invoice_righe
  50% Sustainability Check-up          2.500,00 Euro   │ (R10)
  #Reimbursement for Bank & GBCI Fees  3.650,00 Euro   ┘
  Total                               17.150,00 Euro

  Payment Terms: 30 days                        ← payment_terms_days
  Due by: March 30th, 2026                      ← due_date (generata)

  The amount invoice is net, all bank fees have to be paid by the payer
  Bank HSBC London Bridge Branch                ← contacts dell'emittente
  Account Name FGB studio * Zmyrna Limited  Account Number 76185988
  Iban GB52 HBUK 4012 7676 1859 88   Bic HBUKGB4B
  ─────────────────────────────────────────────────── piè di pagina
  FGB studio * Zmyrna limited
  The Shrubberies - George Lane - London E18 1BD – UK
  VAT GB 215421643
```

Questo documento **conferma R10**: quattro righe, di cui una — il rimborso delle
GBCI fees — non è la percentuale di nessuna tranche. Senza righe libere quella
fattura non si potrebbe fare.

**Perché Word e non PDF.** Il servizio produce il .docx e poi lo converte: qui
ci si ferma prima e si consegna il Word, perché è quello che vi serve poter
ritoccare. Nell'archivio dell'ENTRATE ogni cartella ha **tutti e due i file**,
quindi il PDF continuate a farlo voi — oppure lo chiediamo al servizio con un
secondo bottone, visto che la conversione la sa già fare.

---

### Le diciture, ricavate dalle 166 fatture vere

Ho letto l'archivio: **173 cartelle, 166 documenti Word leggibili** (7 hanno
solo il PDF). Quello che ne esce dice da solo perché standardizzare serve.

**156 diciture distinte** — ma i concetti veri sono una quindicina. La stessa
cosa scritta in cinque modi:

```
  11x  50% LEED ID + C GOLD
   6x  50% LEED GOLD Consultancy
   5x  50% LEED GOLD
   5x  50% LEED ID+C GOLD
   3x  50% LEED ID+C Gold
```

```
  17x  #Reimbursement for GBCI Fees
  10x  #Reimbursement for Bank & GBCI Fees
   6x  100% Reimbursement GBCI fees
   6x  #Reimbursement for GBCI & Bank fees
   5x  #Reimbursement for GBCI & Bank Fees
   3x  100% #Reimbursement forGBCI, shipping & bank fees
```

L'ultima ha anche uno spazio mancante — *«forGBCI»* — ed è finita su una
fattura vera, tre volte.

**I termini di pagamento** sono già quasi standard, e confermano i preset di R10:

```
 138x  30 days          ← il caso normale
  14x  30 GG DFFM       ← il «30 giorni fine mese» che avevi chiesto
   6x  immediate / Immediate
   3x  60 days / 60 GG DFFM
   1x  30 days D.F.F.M.
   1x  30 days Due by: October 16th, 2026   ← due campi finiti in uno solo
```

L'ultima riga è un errore del template compilato a mano: *Payment Terms* si è
mangiato il *Due by*. È il genere di cosa che non succede più quando il campo lo
riempie il sistema.

**Il riferimento PO/WBS** c'è su **44 fatture su 166**, circa una su quattro:
esattamente il *«ogni cinque fatture almeno due ce l'ho»* di Francesca. Conferma
che va messo (R10) e che deve poter restare vuoto.

**La valuta** è scritta *«Euro»* in 304 righe su 305. Nel documento si scrive per
esteso come fate voi, non il codice ISO.

**Dove vanno le diciture.** Sono di tre specie, e ognuna ha già il suo posto —
o quasi:

| Specie | Esempio | Dove sta |
|---|---|---|
| **Servizio** | `LEED ID+C GOLD` · `EU Taxonomy` · `Energy Model` | `cert_catalog.dicitura_fattura` — il catalogo **è** l'elenco dei servizi |
| **Evento della tranche** | `30% at the beginning` · `At installation` · `50% after the installation` | `cert_payment_milestones.name` — c'è già |
| **Rimborso e voci ricorrenti** | `#Reimbursement for GBCI & Bank Fees` · `Additional call out` | tabella nuova, cortissima: `diciture_fattura` |

Così la riga della fattura si compone da sé: `<percentuale>% <dicitura del
servizio>` per le tranche, e la dicitura pronta per i rimborsi. Chi emette
sceglie da un elenco invece di ricordarsi come l'ha scritta l'ultima volta — e
fra sei mesi non ci sono sei modi di chiamare le GBCI fees.

Restano tutte **modificabili**: la dicitura è un punto di partenza, non una
gabbia.

**Una cosa che l'archivio regala.** Quelle 166 fatture in Word sono testo
pulito, non scansioni: numero, cliente, progetto, righe, totale, termini si
leggono senza OCR. È lo stesso lavoro di R7 e R14 — **posso caricarle da qui**,
e il registro passerebbe da 69 fatture a tutto il 2026. Dimmi se lo facciamo.

*Nuovo schema*: `cert_catalog.dicitura_fattura` e una tabella corta di diciture
ricorrenti. *Servizio*: il template .docx da caricare su Render.

---

## R13 · Dashboard quotazioni

**Cosa serve.** Una dashboard di Quotations che oggi non esiste, con i solleciti
sulle offerte pendenti (**33 oggi**, di cui Marco non sa quali siano state
approvate) e l'avviso sul credito del cliente (R9).

**Cosa c'è già.** La pagina Quotations con i suoi stati e le sue schede;
`task_alerts` per gli avvisi; `quotation_sent_date` sulla certificazione.

**Cosa manca.** La dashboard e la regola: dopo quanti giorni dall'invio
un'offerta senza risposta va sollecitata?

**Dove vanno i dati.** Negli avvisi esistenti. Nessuna tabella: «offerta da
sollecitare» è una domanda sulle date che ci sono già.

**Proposta di soluzione.**

Una scheda **Dashboard** in cima a Quotations:

```
┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│ IN ATTESA     │ │ DA SOLLECITARE│ │ APPROVATE MESE│ │ VALORE APERTO │
│ 33            │ │ 11            │ │ 4             │ │ 412.000 €     │
└───────────────┘ └───────────────┘ └───────────────┘ └───────────────┘

Da sollecitare
  Amazon — Seattle HQ      inviata 12/08   48 giorni   28.000
  Louis Vuitton — Roma     inviata 03/09   26 giorni    9.500

Crediti dei clienti da tenere a mente
  Louis Vuitton  6.750 €  da «Champs-Élysées» cancellato
```

*Nuovo schema*: niente, oltre alla regola dei giorni.

**Da concordare**: dopo quanti giorni dall'invio?

---

## R14 · Caricare le quotazioni storiche di Marco

**Cosa serve.** Amazon, Louis Vuitton e le altre non sono nel sistema. Marco
fornisce **PDF + data di approvazione**, e si caricano.

> «Non c'è da stare a impazzire: mi date la quotazione PDF e la data di
> approvazione, io le carico a DB.»

**Cosa c'è già.** Il meccanismo di lettura da PDF appena fatto per le fatture:
stessa struttura, altro estrattore. E il wizard di quotazione, che da due giorni
si riapre in modifica pieno dei propri dati.

**Cosa manca.** Niente da costruire — **confermato**: come R7, il caricamento si
fa da qui. Cade quindi anche l'estrattore lato server che avevo previsto: i PDF
li leggo direttamente, come ho appena fatto con l'offerta di Louis Vuitton
Dallas.

**Dove vanno i dati.** In `certifications` e `cert_payment_milestones`, cioè dove
vanno tutte le altre: una quotazione importata è una quotazione, non una specie
diversa. Si marca `origine` come per le fatture, così si sa che viene da fuori.

**Proposta di soluzione.**

Mi mandi i PDF con le date, leggo, e **ti mostro qui cosa ho capito** prima di
scrivere: cliente, progetto, protocollo, totale, e soprattutto le tranche
ricavate dalla riga degli step. Tu correggi quello che serve, poi scrivo la
migrazione.

L'offerta di Louis Vuitton Dallas mostra che tutto quello che serve sta sul
documento:

| Sul PDF | Dove va |
|---|---|
| `LOUIS VUITTON` | brand |
| `Dallas – Highland Park Village` | sito |
| `LEED ID+C Retail GOLD` | scheme, rating, medaglia |
| l'elenco dei servizi inclusi | descrizione |
| `FGB Air Quality Monitoring System`, `Desk Light`, `Mini Fan` | monitoraggi inclusi |
| `TOTAL 22.500 USD` | `total_fees` + valuta |
| `PAYMENT TERMS 30 days` | giorni di pagamento |
| `step 1. 30% at the beginning`<br>`step 2. 40% at the completion of design`<br>`step 3. 30% at the completion of construction` | **le tranche**: percentuale + evento |

**Quella riga degli step è la parte che vale.** È già uno schema di pagamento
scritto in inglese, e il sistema ha le tranche con percentuale, ordine e
trigger: leggerla vuol dire che la quotazione importata arriva con le sue tre
tranche pronte, e il ciclo riparte da solo. Senza, resterebbe un totale e basta.

In più due campi che il PDF non può sapere: **data di invio** e **data di
approvazione**. Se la seconda c'è, la quotazione nasce già approvata e le sue
tranche finiscono subito in *Da Emettere*.

**Una cosa da decidere.** L'offerta dice *«the pricing includes in the fees
also: FGB Air Quality Monitoring System, Desk Light, Mini Fan»*: hardware dentro
il prezzo della consulenza. Nel sistema i monitoraggi sono quantità sulla
certificazione (`quoted_iaq_quantity` e compagne). L'estrattore prova a
riconoscerli, ma le quantità dal testo spesso non si ricavano — le confermi tu
nel wizard.

**Serve**: i PDF e le date.

**La conseguenza vera, che non è tecnica.** Se le quotazioni vecchie entrano da
qui e basta, vuol dire che **da domani Marco le fa nel wizard**. Finché continua
a farle fuori, ogni tanto servirà un altro travaso, e la piattaforma resterà
indietro di qualche settimana su quello che è stato promesso ai clienti — che è
poi il motivo per cui oggi Amazon e Louis Vuitton non ci sono.

Il caricamento risolve il passato. Il presente lo risolve l'abitudine.

*Nuovo schema*: una colonna `origine` su `certifications`, come per le fatture.
*Nuovo frontend*: niente.

---
## R15 · Le tre società che emettono, e i loro template

**Cosa serve.** Le offerte si emettono da **tre** società, ognuna col suo
master: ITA, UK, CHINA. Servono le anagrafiche complete e i tre template
associati alla società giusta.

**Cosa c'è già.** `contacts` con `kind='issuer'`, e l'estrazione automatica
dell'anagrafica dall'intestazione di una fattura. Il campo `entity_code`
distingue le entità nei raggruppamenti.

**Cosa manca.** Niente: **è già fatto**. I tre master portavano in fondo
l'anagrafica completa, ed è la fonte che non può sbagliare — è quello che i
clienti leggono.

| | Società | Dov'è | Stato |
|---|---|---|---|
| `it` | FGB STUDIO ITALY SRL · Via Monte Napoleone 23, 20121 Milano · P. IVA 12634970961 | c'era | + codice SDI `USAL8PV` |
| `uk` | FGB STUDIO * ZMYRNA LTD · 3 The Shrubberies, George Lane, London E18 1BD · VAT GB 215421643 · HSBC London Bridge | c'era, completa | invariata |
| `cn` | FGB STUDIO CHINA · Room 2855, 28th Floor, No. 550 Yan'an East Road, Huangpu, Shanghai | **non c'era** | creata |

**Dove vanno i dati.** In `contacts`, dove stanno già le altre.

**Proposta di soluzione** — *fatta, migrazione `20260930143040`*.

**Una cosa che i template dicono e il database non sapeva:**

**Il FAPIAO.** Le offerte cinesi non finiscono col totale: `TOTAL 204.500 RMB →
FAPIAO (6%) 12.270 → GRAND TOTAL 216.770`. È un'imposta che si somma, come
un'IVA, ma con un nome e un'aliquota suoi. Nel sistema è `vat_amount` con
l'aliquota 6% fra i preset di R10 — **purché sul documento cinese si stampi
«FAPIAO» e non «VAT»**, perché è quello che il cliente si aspetta di leggere.

**Una frase da non sopravvalutare.** Il master italiano scrive *«Tutti i
pagamenti dovranno essere effettuati presso la nostra entità FGB studio con sede
in UK»*: è una condizione **dell'offerta**, non una regola di fatturazione.
Quale società poi emette la fattura, e con quali coordinate, si decide al
momento — e il dialogo di R10 lo lascia scegliere. Ogni fattura porta la banca
del **suo** emittente, come fa la 2.946 di Bottega Veneta con l'HSBC di Zmyrna.

**Cosa resta da chiedere**: partita IVA cinese e coordinate bancarie di FGB
studio China. Escono dalla prima fattura emessa da quella società, oppure me le
dai tu.

---

### Quello che i tre master insegnano sulle offerte

I template non servono solo all'anagrafica. Confrontandoli si vede come sono
fatte davvero le vostre offerte, e due cose toccano R10 e R14.

**L'offerta ha due prezzi.** `Total 23.000 Euro 21.000 Euro`: listino e prezzo
praticato, uno accanto all'altro, su ogni blocco. Il sistema li ha già —
`quotation_list_price` e `total_fees` — ed è la conferma che la colonna esiste
per una ragione vera: **lo sconto si vede**, non si nasconde nel totale.

**L'offerta è fatta di blocchi, e ogni blocco ha il suo schema di pagamento.**
Dal master UK:

```
  Services fees up to LEED PLATINUM ID+C          Total 23.000 → 21.000
  Services fees for EU TAXONOMY                   Total  5.000 →  4.500
  FGB Monitoring System (CLAIR, GREENY, Green Power)
  Reimbursement fees (GBCI + Shipping)            Total  4.375 →  3.600
  ───────────────────────────────────────────────────────────────────
  TOTAL                                                 32.375 → 29.100

  PAYMENT TERMS 30 days
    LEED:              step 1. 30% · step 2. 40% · step 3. 30%
    FGB MONITORING:    step 1. 100% at the beginning
    GBCI Fees:         step 1. 100% at the beginning
```

**Questa è la cosa da guardare bene.** Le percentuali **non sono del totale**:
il 30% è del blocco LEED, il 100% è del blocco monitoraggio. Oggi
`cert_payment_milestones.tranche_pct` è una percentuale — ma di cosa? Se la base
è il totale dell'offerta, le tranche generate da un'offerta come questa sarebbero
sbagliate.

E si vede anche nelle fatture vere: `50% LEED GOLD 8.750,00` e `50% EU Taxonomy
2.250,00` sulla stessa fattura sono metà di due blocchi diversi.

Le strade sono due, e la decisione è tua:

1. **La tranche porta il suo blocco** — una colonna che dice a quale componente
   si riferisce (servizi, monitoraggio, rimborsi), e la percentuale si applica a
   quello. È fedele all'offerta, e il documento si genera da solo.
2. **La tranche porta solo l'importo** e la percentuale resta un'etichetta. Più
   semplice, ma la prima volta che un blocco cambia prezzo le percentuali
   mentono.

Propendo per la prima, ed è schema nuovo (`cert_payment_milestones.componente`
più `monitor_fees` già chiesta in R8). Ma è una scelta che cambia il wizard, e
la voglio detta da te.

*Nuovo schema*: niente per le anagrafiche — **fatto**. Per i blocchi, se
confermi: una colonna sulla tranche.

---

---

# Le modifiche allo schema, in tutto

Poche, e ognuna perché quel fatto oggi non ha un posto.

| # | Modifica | Per | Perché |
|---|---|---|---|
| 1 | `invoices.data_incasso_attesa` + `_fonte`; **via** `yellow_until` | R2 | una data, un posto |
| 1b | `invoice_notes.tipo` + `fn_registra_esito` | R1+R2 | un gesto solo: l'esito porta la data |
| 2 | `invoices.po_riferimento` | R10 | il PO non è ricavabile |
| 3 | `invoice_righe` (nuova); **via** `invoices.tranche_id` | R10 | righe da tranche o libere |
| 4 | `crediti_cliente` (nuova) | R9 | il solo fatto davvero nuovo |
| 5 | `task_alert_type` + 2 valori | R4 | le due regole di sollecito |
| 6 | `certifications.origine` | R14 | quotazioni importate |
| 7 | `contacts.numero_iniziale` | R15 | serie di una società nuova |
| 7c | `cert_catalog.dicitura_fattura` + `diciture_fattura` | R12 | 156 modi di scrivere 15 cose |
| 7d | `cert_payment_milestones.componente` | R15 | la percentuale è del blocco, non del totale |
| 7b | `certifications.monitor_fees` + data firma monitoraggio | R8 | il foglio le tiene distinte |
| 8 | `v_followup_fatture` (vista) | R3 | — |
| 9 | `v_cliente_fatturato` (vista) | R8 | — |
| 10 | `fn_registra_esito` (assorbe `fn_bonifico_disposto`) | R1+R2 | — |
| 11 | `fn_ricalcola_avvisi_fatture` | R4 | — |
| 12 | `fn_emetti_fattura` accetta più righe | R10 | — |

**Nessuna colonna nuova** per: totali fatturati, percentuali, residui, stati di
pagamento, conteggi di sollecito per cliente, saldo crediti. Sono tutti rapporti
fra righe che esistono già, e vanno calcolati ogni volta.

---

# Cosa NON fare

- **Nessuna tabella «resoconto»** o «follow-up»: è una vista.
- **Nessuna pagina «pagamenti»** separata dal Registro: è un filtro.
- **Nessun totale scritto** dove si può sommare.
- **Nessuna copia** di nome cliente, partita IVA o indirizzo sulla fattura:
  stanno in `contacts`, e una fattura che se li porta dietro mente il giorno che
  l'anagrafica cambia.
- **Nessuna aliquota IVA salvata**: è imposta ÷ imponibile.
- **Nessuno stato di recall scritto a mano**: si deduce da residuo, scadenza e
  promessa.

---

# Ordine di lavoro proposto

Dall'interno verso l'esterno: prima i fatti, poi le viste, poi le pagine.

1. **R2** data di incasso attesa + **R1** note esposte → sbloccano R3 e R4
2. **R3** vista follow-up del mese (il foglio del venerdì di Francesca)
3. **R4** regole di sollecito negli avvisi + **R5** verifica sui parziali
4. **R6** scorciatoie «da incassare» + **R8** vista per cliente
5. **R10** emissione rifatta: righe, spunte in Da Emettere, preset, PO
6. **R12** template documento — viene subito dopo, perché è il documento delle
   righe appena costruite
7. **R9** credito cliente + **R13** dashboard quotazioni
8. **R15** società nuove

I primi quattro punti valgono già il venerdì di Francesca. Gli ultimi dipendono
da file che ancora non ho.

**Fuori dall'ordine, perché non è codice**: **R7** (le note dal foglio di
Francesca) e **R14** (le quotazioni vecchie di Marco) si fanno da qui, in
qualunque momento. R7 dopo R1 e R2, perché servono i posti dove mettere note e
date; R14 anche subito.

---

# Cosa mi serve da voi

**File**
- Il **foglio Excel di Francesca** (fatture + note) → R7
- Partita IVA e coordinate bancarie di **FGB studio China** → R15
- Le **quotazioni PDF di Marco** + le date di approvazione → R14
- Una **fattura di esempio** delle nuove società emittenti, o i loro dati → R15

**Decisioni**
1. Mese senza giorno → si registra l'ultimo del mese. *(R2)*
2. Il credito del cliente **non** si scala da solo: promemoria a Marco. *(R9)*
3. Due progetti dello stesso cliente su una fattura sola: confermato? *(R10)*
4. Dopo quanti giorni si sollecita un'offerta senza risposta? *(R13)*
5. `yellow_until` si elimina — ha zero righe. Confermi? *(R2)*
6. Le regole di sollecito girano all'apertura di Payments o serve un cron? *(R4)*
7. I recall del lunedì e del mercoledì saltano le feste? Servirebbe un
   calendario dei giorni non lavorativi, che oggi non c'è. *(R4)*
8. Da quale numero riparte la serie di FGB studio China? *(R15)*
9. Le **Monitor Fees** diventano un campo distinto dalle Services Fees, con la
   loro data di firma? Nel foglio sono due colonne separate. *(R8)*
10. Nella vista per cliente si raggruppa per **intestatario della fattura** o per
    **brand del progetto**? La proposta li tiene entrambi, come fai tu
    scrivendo «TPG Architecture × Louis Vuitton». *(R8)*
11. Le tranche portano il **blocco** a cui la percentuale si riferisce (servizi,
    monitoraggio, rimborsi)? Nei master le percentuali sono del blocco, non del
    totale. *(R15)*
12. Carico le **166 fatture in Word** dell'archivio ENTRATE? Sono testo pulito,
    non serve OCR: il registro passerebbe da 69 a tutto il 2026. *(R12)*
13. Sul documento cinese si stampa **FAPIAO** al posto di VAT? *(R15)*
