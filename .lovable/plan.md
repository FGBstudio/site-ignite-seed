## Obiettivo

Aggiungere, nella sezione "Services & Quote" del wizard di nuova quotazione (`NewQuotationWizard`, Step 2), un Accordion che permette all'admin di scegliere tra due modalità di compilazione del campo **Totale Quotazione (€)**:

1. **Direct Input** — comportamento attuale: digitazione diretta del valore.
2. **FTE & Budget Builder** — pannello guidato che calcola un valore suggerito da effort, costi e markup, con bottone *"Use this value"* che popola il campo di Modalità 1.

Nessuna modifica al database: il calcolatore è puramente frontend e produce un singolo numero che finisce in `total_fees` (come oggi). se utilizzato deve generare un record nella "storia" del progetto quotato visibile solo admin in modo che sia sempre consultabile.  
il totale di budget del PM poi è lo stesso che deve essere associato per il calcolo del fatto che il PM stia o meno sforando il budget a sua disposizione per il progetto.

---

## UX dell'Accordion

```text
┌─ Quotation Value ─────────────────────────────────┐
│  ◉ Direct Input                                   │
│     Total Quotation (€)  [ 15000 ]                │
│                                                   │
│  ○ FTE & Budget Builder                           │
│     [ Calcola budget stimato ▼ ]                  │
│       └─ pannello con sezioni 1–7 + Riepilogo    │
└───────────────────────────────────────────────────┘
```

Toggle a radio (o due trigger di Accordion mutuamente esclusivi). La modalità attiva determina la sorgente del valore salvato in `services.totalFees`.

### Sezioni del Budget Builder

1. **Project Effort (per ruolo)** — tabella con righe dinamiche:
  - Ruolo (select: Partner, CxA, PM, Senior Specialist, Junior Specialist, Energy Modeler, Document Manager)
  - Giornate allocate (number)
  - Costo standard giornaliero € (precompilato per ruolo, editabile)
  - Subtotale riga = giornate × costo
  - Bottoni "+ Aggiungi ruolo" / "✕ rimuovi"
2. **Spese Vive (OPE)** — Trasferte e Logistica (singolo importo €).
3. **Hardware / Attrezzature** — campo calcolato in automatico in base ai flag delle certificazioni selezionate:
  - Se almeno una cert ha `flags.iaq` → costo ClAir = (prezzo più alto da `products` con categoria air/IAQ) × *N sensori IAQ stimati* (input numerico).
  - Se almeno una cert ha `flags.energy` → costo Greeny = (1 × bridge LAN) + (12 × sensore PAN12) + (1 × Mango), prezzi presi da `products`.
  - Valori mostrati in sola lettura con breakdown; un toggle "override manuale" consente di forzare un importo.
4. **Tasse di Registrazione/Certificazione (GBCI/IWBI fees)** — input €. Il valore inserito qui popola anche il campo esistente `services.gbciFees`.
5. **Servizi Esterni e Subappalti** — lista dinamica di righe `{ descrizione (text), importo (€) }` con "+ Aggiungi voce".
6. **Costi indiretti**:
  - Overhead aziendale: % editabile (default 20%).
  - Contingency: % editabile (default 10%).  
   Applicati sul subtotale costi diretti (1+2+3+4+5).
7. **Margine di Profitto** — % libera (default 25%) applicata sul totale costi (diretti + indiretti).

### Riepilogo + Apply

Card finale con:

- Subtotale Effort, OPE, Hardware, Fees, Subappalti
- Overhead, Contingency, Costi totali
- Markup, **Quotazione suggerita €**
- Bottone primario **"Usa questo valore"** → scrive il totale in `services.totalFees` e chiude il pannello (o resta aperto in sola lettura, mostrando "Valore applicato").

---

## Dettagli Tecnici

### File toccati

- `src/components/projects/NewQuotationWizard.tsx` — aggiungere stato `quoteMode: "direct" | "builder"` e `builder: BudgetBuilderState`; renderizzare l'Accordion al posto / sopra il campo `totalFees` attuale in Step 2.
- `src/components/projects/QuotationBudgetBuilder.tsx` *(nuovo)* — componente isolato che riceve `flags` aggregati delle certs selezionate + callback `onApply(value: number)`.
- `src/lib/quotationBudget.ts` *(nuovo)* — funzioni pure: `computeBudget(state) → { subtotal, overhead, contingency, totalCost, markup, suggested }` + costanti default per `ROLE_RATES`.
- `src/lib/productPricing.ts` *(esistente)* — riusare per leggere prezzi ClAir/Greeny/Mango; se mancano helper specifici, aggiungere `getIaqMaxPrice()` e `getGreenyKitPrice()`.

### Sorgenti dati hardware

Query a `products` filtrando per categoria/SKU noti (Greeny bridge, PAN12, Mango, sensori aria). Cache via TanStack Query (`useQuery(["products-pricing"])`). In assenza di prezzo: mostrare warning "prezzo non disponibile, inserisci manualmente".

### Componenti UI

Accordion / RadioGroup / Card / Input / Button da shadcn già presenti. Niente nuove dipendenze.

### Persistenza

- `total_fees` ← valore applicato (da Direct o da Builder).
- `gbci_fees` ← se in modalità Builder, valore della sezione 4; altrimenti come oggi.
- Lo stato del Builder NON viene salvato sul DB in questa iterazione (solo client). Eventuale persistenza in `quotation_notes` come JSON è fuori scope; se richiesta, va aperta come iterazione successiva.

### Validazione

- Se `quoteMode === "direct"` → `totalFees > 0`.
- Se `quoteMode === "builder"` → richiedere che l'utente abbia premuto "Usa questo valore" almeno una volta (cioè `totalFees` popolato).

---

## Fuori scope

- Salvare il dettaglio del Builder sul DB.
- Editare i `ROLE_RATES` da UI admin (per ora costanti nel codice; in futuro eventuale tabella `role_daily_rates`).
- Ricalcolo automatico del valore quando cambiano i flag dopo l'apply (l'utente dovrà ripremere "Usa questo valore").