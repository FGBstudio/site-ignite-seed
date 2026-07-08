## Obiettivo

Aggiungere alla tabella **Monitor → Air Quality** le prime tre colonne `CLIENT | CITY | PROJECT` allineate al layout già in uso su Energy e Water (e su Quotations / Operations).

## Stato attuale

`src/components/projects/AirMonitoring/AirTable.tsx` ha come intestazioni (nell'ordine):

```
Project Name (sticky) | Brand Name | Monitor Typology | Region | Country | PM | Sensors | POs | Handover | Shipment | [Financials…] | Notes | Status
```

- Il "Client" (brand) esiste ma sta in seconda colonna con etichetta "Brand Name".
- La "City" non è mostrata come colonna: appare solo come sottotitolo nella cella "Project Name" (riga con `r.city`).
- Non c'è quindi allineamento visivo con Energy (`Client | City | Project`) né con Water.

Il dato è già disponibile in `AirMonitorRow`: `brand_name`, `city`, `project_name` sono tutti popolati da `useAirRows` via `loadIdentityMaps` (sites + brands + certifications).

## Cambiamenti

### `src/components/projects/AirMonitoring/AirTable.tsx`

Riordinare l'header e le celle riga in questo modo (prime 3 colonne uniformi al resto):

```
CLIENT (sticky) | CITY | PROJECT | Monitor Typology | Region | Country | PM | Sensors | POs | Handover | Shipment | […] | Notes | Status
```

Dettagli:

1. **Header row 2** (intorno alle righe 742-770):
   - Sostituire la cella "Project Name" sticky con **Client** sticky (`colKey="brand_name"`, sortable/filterable via `ExcelHeaderCell`).
   - Aggiungere subito dopo **City** (`colKey="city"`, nuovo entry in `getUniqueValues` / `matchRowValue`).
   - Terza cella **Project** (`colKey="project_name"`).
   - Rimuovere la vecchia colonna dedicata "Brand Name" (ora è la prima).
   - Aggiornare l'header raggruppato riga 1 (`<th colSpan=…>`) per riflettere il nuovo count: la sticky-shadow resta sulla prima cella (Client) e il colSpan del gruppo "site info" resta identico perché il totale di colonne site rimane invariato (si perde "Brand Name", si guadagna "City" — pareggio).

2. **Body row** (funzione `Row` più in basso nel file, riga ~950+): riordinare le `<td>` corrispondenti. La cella Client diventa sticky-left con lo stesso shadow che oggi ha "Project Name". Rimuovere il sottotitolo `r.city` dalla cella project (ridondante, ora è colonna dedicata).

3. **Helpers**:
   - `getUniqueValues` e `matchRowValue`: aggiungere il case `city` (leggere `r.city || '(Blanks)'`); il case `brand_name` esiste già.
   - Blocco filtro `filter.search` (riga ~407): `project_name` non deve più includere `${r.city}` nella string search (ora esiste il filtro `city` dedicato).

4. **Sticky styling**: applicare `sticky left-0 z-20 bg-slate-50/80 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.12)]` alla **cella Client** invece che a Project. Le altre due (City, Project) restano non-sticky come in Energy.

5. **Export CSV** (riga 586-624): riordinare le colonne dell'header e delle righe in `Client, City, Project, Monitor Typology, …` così che l'export riflette il nuovo layout.

## Verifica

- Aprire Monitor → tab **Air Quality**: le prime tre intestazioni sono **Client · City · Project**, con lo stesso font/uppercase/tracking di Energy e Water.
- Filtri e sort funzionano su tutte e tre le nuove colonne.
- Il record di "HIG Streem INOFYTA A" mostra `HIG | Oinofyta | HIG Streem INOFYTA A` invece di sovrapporre progetto + città.
- Nessuna colonna persa: Brand era già "Client", City guadagna una colonna, il sottotitolo city sotto Project sparisce (l'informazione è ora nella colonna dedicata).

## Fuori scope

- Modifiche a `useAirRows` (i dati sono già presenti).
- Modifiche a Energy / Water (già conformi).
- Cambi al DB.
