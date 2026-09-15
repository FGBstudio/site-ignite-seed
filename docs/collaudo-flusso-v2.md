# Collaudo del flusso v2 — come avviarlo e cosa provare

Riferimento unico: `docs/specs/specifica-flusso-v2.md`. Questo file è il modo
di eseguirne lo **script §6**, sedici passi, sul software vero. Un passo che
non supera lo script è una consegna non finita: se qualcosa non torna,
fermati lì e segnalalo — non serve arrivare in fondo.

---

## Come si avvia

**1 · I dati di prova.** Esegui `supabase/seed-test/cronoprogramma.sql`. Crea
la holding `ZZ TEST — Cronoprogramma` e sotto di essa i tre siti dello script:

| Sito | Tipo | Certificazioni | PM |
|---|---|---|---|
| **ZZ TEST — Palazzo Aurora** (Milano) | Design+Construction | LEED BD+C · WELL NC | Matteo · pmtest |
| **ZZ TEST — Metro Pontedera** (PI) | Construction | LEED GC Support | Matteo |
| **ZZ TEST — Torre Levante** (Milano) | Existing | WELL EB | pmtest |
| **ZZ TEST — Uffici Corso Re** (Torino) | — | Greeny appeso al solo sito | Matteo |

Ordinano in fondo a ogni elenco e si riconoscono a colpo d'occhio. Per
annullare tutto: `supabase/seed-test/cronoprogramma_pulizia.sql`, una
cancellazione sola che non tocca nulla di reale.

**Le project timeline non sono precompilate, ed è voluto:** il passo 1 dello
script è proprio aprire un progetto e trovare l'ossatura da riempire.

**2 · I due ruoli.** Lo script alterna Marco (LEED) e Sara (WELL) sullo stesso
sito. Nel seed sono l'utenza `m.martignoni` e `pmtest`. Se hai un solo accesso,
entra come admin: vedi entrambe le certificazioni e puoi eseguire tutto, ma il
passo 11 («Sara apre e trova la ① già compilata») perde il suo senso — falla
aprire davvero da un secondo accesso, è il criterio che conta di più.

**3 · Le fixture da importare** stanno in `docs/specs/fixtures/`:
`GANTT_LCP_METRO_Pontedera_PI_R01.pdf`, `20260623_Grand_Vespucci…pdf`,
`20260209_GW_XD_Ergou_R2.xlsx`, `bou_almathy.png`. Per il png serve rete: i
modelli OCR si scaricano al primo uso.

**4 · Dove si entra.** PM: *Projects → My projects*, la card del sito. Admin:
*Projects* (`/portafoglio`).

---

## Lo script §6, passo per passo

| # | Cosa fare | Esito atteso |
|---|---|---|
| **1** | Marco apre **Palazzo Aurora** da My projects | La ① è **già popolata** con l'ossatura Design+Construction, tutte le righe senza data tranne **Handover 15/03/27 · Quotation**; fascia esplicativa e **«Importa da file»** visibili; la ② è bloccata con la frase «Si sblocca compilando la project timeline» |
| **2** | Leggi le righe della ① | Sono quelle del template BDC — concept/developed/detailed design, permessi, tender, long-lead, consegna aree, construction start, strutture, impianti, finiture, commissioning, handover — con la **famiglia** sotto il nome e le ancore marcate **●**. Nessun elenco generico (V1) |
| **3** | Elimina due righe, aggiungine una, data quattro righe | Il pannello a destra si popola nodo per nodo. Al **primo** gesto la timeline diventa il record condiviso del sito (toast). Ogni modifica successiva mostra «Salvato» con **Annulla** |
| **4** | Chiudi la sezione | La ① collassa nel **riepilogo compatto** (tipo · eventi · prima data · handover · ultimo aggiornamento); la ② si sblocca |
| **5** | «Genera dalla scaletta Palazzo Aurora — LEED BD+C» | **13 passi**, e solo quelli: Pre-assessment → LEED Certification Attainment. Construction Start e Handover **ereditati, in sola lettura**, con «← … · project timeline» nella colonna Ancorato a |
| **6** | Su un passo calcolato apri **«si calcola da ▾»** | Il menu elenca **le righe della ① di questo sito** con la loro data — non passi di certificazione. Passando sulle voci il nodo si accende sul pannello. Scegli, regola l'offset con −/+, e **leggi la data risultante prima di confermare**. Dopo: la data prende la **tinta del servizio con la catena ⛓**, e sotto la riga compare la frase di conseguenza. **«Sgancia»** avvisa, mantiene il valore e toglie catena e colore; **«Riaggancia»** riapre lo stesso selettore |
| **7** | Metti *FGB Design Guidelines* **dopo** il Tender | Avviso ambra in tabella e sul pannello. Correggi la data → l'avviso sparisce |
| **8** | Apri **Metro Pontedera**; senza toccare nulla premi «Importa da file» e carica il gantt Metro | Passo 2 con **22 attività, tutte con le date**: Consegna aree **22/04/24**, Impianti elettrici e meccanici **29/08/24 → 01/01/25**, Consegna lavori **15/03/25** mappata su **Handover**. Togli la spunta a «Celle Frigo» e «Guardiania e Recinzioni» → spariscono dalla timeline a destra (restano barrate in elenco) e il contatore scende a 20 |
| **9** | Passo 3 → **«Indietro»**; poi chiudi con la **X** | Indietro conserva selezioni e mapping. La X salva la bozza: riaprendo la sezione compare **«Riprendi import (passo 2)»** (o «scarta») |
| **10** | Riprendi e conferma | Il pulsante dice **«Conferma e inserisci 20 righe»**; toglie il mapping dell'handover e diventa inattivo **con il motivo scritto accanto**. Alla conferma: toast e ① popolata |
| **11** | **Sara** apre Palazzo Aurora | La ① è **già compilata, in riepilogo** — non ricompila niente. Genera la sua WELL NC; sotto la ② vede la LEED di Marco in sola lettura, nella tinta LEED, con il lucchetto |
| **12** | Marco cambia l'**handover** di Palazzo Aurora in linea nella ① (30/04/27) | Anteprima della cascata: si spostano **solo** i passi ancorati all'handover, di **entrambe** le certificazioni; verdetto contrattuale; conferma → il registro nomina **«Handover»** con la voce monetizzata, e i passi di Sara restano «in attesa di conferma» |
| **13** | Importa l'**xlsx greco** su un progetto di prova | Il wizard dichiara che il file parla per **durate in mesi** e chiede la **data di ancoraggio** prima di procedere; poi converte i mesi in date |
| **14** | Admin apre **Projects** | KPI in testa → barra filtri → tabella. Click su **«Da attenzionare»** filtra e compare il **chip**; l'header resta visibile scrollando |
| **15** | Espande **Palazzo Aurora** | Colonna sinistra ferma; corsia **Project** a tre segmenti con le date alle giunzioni e i **separatori tratteggiati** che attraversano le corsie LEED (verde) e WELL (blu). Torre Levante espanso mostra la corsia senza project timeline |
| **16** | Toggle **Scorri** | Trascinamento fluido, **«Oggi»** riporta alla linea rossa, nessuna etichetta sovrapposta in nessuna delle due modalità |

---

## I divieti V1–V7, come si verificano

| | Come |
|---|---|
| **V1** | Passo 2: le righe sono del template del tipo. Apri anche Metro Pontedera: ossatura **Construction**, più corta |
| **V2** | Cerca «storico» e «stantio» nell'interfaccia: non esistono più da nessuna parte |
| **V3** | Ogni servizio nella sua tinta (LEED verde, WELL blu), project timeline in **scala pietra**, ambra **solo** sugli avvisi. I colori vengono tutti da `src/lib/serviceColors.ts` |
| **V4** | Passo 5: la ② mostra i 13 passi della LEED e nient'altro. L'unico altro elenco della schermata sono le righe della ① nel selettore dell'ancora |
| **V5** | Passo 10: il pulsante spento ha sempre il motivo accanto |
| **V6** | Passo 9: la X non perde niente. E l'ossatura diventa record al primo gesto, così non esiste un momento in cui il lavoro sta solo nel browser |
| **V7** | Passi 15 e 16: nessun testo sotto soglia, nessuna etichetta troncata senza tooltip |

---

## Tre divergenze dichiarate rispetto alla demo

Non sono sviste: la governance dice che le scalette vere sono quelle del PDF,
e la demo semplifica per stare in una pagina.

1. **WELL NC ha 19 passi, non 9.** La demo ne mostra nove per brevità; la
   scaletta reale ne ha diciannove, e il software usa quella.
2. **Il gantt Metro contiene 22 attività, non ~30.** Il §6.8 dice «~30» come
   stima; il file ne ha ventidue e vengono estratte tutte, con i tre valori
   attesi esatti.
3. **Il Vespucci rende 40 attività**, inclusa una riga che è il titolo del
   documento con la sua data: si esclude al passo 2, ed è anche un buon modo
   di provare l'esclusione.

---

## Cosa resta aperto, e non l'ho deciso io

Le decisioni del v1 §11 restano tue. Dove servivano per procedere ho messo un
default, segnalato qui:

- **Periodo parziale della serie report** — oggi si contano i mesi interi fra
  construction start e handover. Dieci mesi e dodici giorni fanno dieci
  report, non undici. È una regola di fatturazione, non un arrotondamento.
- **Perimetro di lettura del PM** — oggi vede i siti dove ha almeno una
  certificazione. È un parametro, non una riscrittura.
- **Quali scalette sono vendute anche da sole** (Tassonomia, IAQ, GC Support,
  Cx, PTA): determina se ereditano il cronoprogramma o lo agganciano da sé.
- **Chi può marcare «Fatto»** e con quale reversibilità — è un fatto di SAL,
  quindi un fatto contabile.

E una domanda nuova, nata costruendo: **«Consegna aree di cantiere» e
«Cantierizzazione e inizio lavori» sono due righe distinte a tre giorni di
distanza nel gantt Metro.** Ho tenuto `construction_start` sulla seconda e
lasciato la prima libera, perché confonderle darebbe al construction start la
data sbagliata. Se per voi l'inizio lavori è la consegna delle aree, si cambia
una riga del lessico.
