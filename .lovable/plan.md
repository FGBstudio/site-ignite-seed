## Cosa manca davvero

Le tre schermate che hai allegato provengono da **tabelle che nel turno precedente NON sono state toccate**. Le ho identificate una per una:

| Screenshot | Componente reale | Stato attuale header | Da fare |
|---|---|---|---|
| 1. Admin Dashboard → Projects | `src/pages/CeoDashboard.tsx` → `TabProgetti` (righe 430-486) | `ID · Name · Client · Status · Start Date · Handover · PM · Progress` | Riordinare + aggiungere `City` |
| 2. Operations → Projects | `src/pages/Projects.tsx` (righe 624-673) | **Già** `Client · City · Project · Region · …` in codice — lo screenshot è cache stantia della build precedente | Verificare in preview dopo hard-reload |
| 3. Quotations → Pending | `src/pages/Quotations.tsx` (righe 319-327) | **Già** `Client · City · Project · Region · …` in codice — anche questo è cache stantia | Verificare in preview dopo hard-reload |

Audit esteso: ho trovato **altre 3 tabelle multi-progetto** ancora sbagliate che erano state saltate nel turno scorso:

- `src/pages/Inventory.tsx` (r. 379-381): `Project · Client · Region · …`
- `src/pages/Monitor.tsx` (r. 212+): prima colonna `Project`
- `src/components/dashboard/HoursAnalytics.tsx` (r. 62-63): `Project · Client · …`

---

## Piano di intervento (solo frontend)

### 1. `CeoDashboard.tsx` — `TabProgetti`
Header nuovo (nell'ordine): **Client · City · Project · Status · Start Date · Handover · PM · Progress**. La colonna `ID` (hash da 6 char) viene rimossa: era rumore, e "Client · City · Project" è già l'identità del progetto.

Data source: `projects` locale del componente è alimentato via `useCeoDashboardData`. Devo estendere la query di quel hook per includere `sites ( city )` sulla `certifications` (root entity) e propagare `city` nell'oggetto di riga. Se il hook già seleziona `sites(name)` — aggiungo `city`; se non seleziona `sites`, aggiungo il nested select.

Render riga:
```tsx
<TableCell className="font-semibold text-foreground">{p.client}</TableCell>
<TableCell className="text-muted-foreground">{p.city ?? "—"}</TableCell>
<TableCell className="text-foreground">{p.name}</TableCell>
```

### 2. `Inventory.tsx`
Header: da `Project · Client · Region · …` → **Client · City · Project · Region · …**. Le righe sono progetti/allocations aggregati; la query che li alimenta va estesa con `certifications ( sites ( city ) )` per esporre `city`.

### 3. `Monitor.tsx`
Prima colonna `Project` → inserire **Client** e **City** prima. Le righe già hanno il site collegato → basta aggiungere `city` al select e due `<Th>`/`<Td>` in testa.

### 4. `HoursAnalytics.tsx`
Header attuale `Project · Client` → **Client · City · Project`. Aggiungere `city` alla query o al mapping (già passa da certifications).

### 5. Verifica screenshot 2 e 3
Il codice è già conforme. Dopo il deploy di questo turno, il preview mostrerà `Client · City · Project` anche per Operations→Projects e Quotations→Pending. Se rimangono vecchi, è solo cache browser.

---

## Fuori scope

- Nessuna modifica DB.
- Nessuna modifica ai flussi di scrittura.
- Nessun redesign visuale oltre riordino colonne e aggiunta `City`.
- Le tabelle Invoices, SupplierOrders, ProjectPayments, PMPortal, Reports, Procurement, QuotationsToInvoicePanel non vengono ritoccate: nell'ultimo turno erano già state riordinate, e non compaiono negli screenshot che hai segnalato.

---

## Ordine di esecuzione

1. Estendere hook/query per portare `city` dove manca (`useCeoDashboardData`, `Inventory`, `Monitor`, `HoursAnalytics`).
2. Aggiornare header + celle in ordine `Client · City · Project` (uso il componente `ProjectContextCells` esistente dove la tabella è basata su shadcn `<Table>`; per le tabelle `<table>` native scrivo i tre `<th>/<td>` direttamente con la stessa formattazione: client bold, city muted, project normale).
3. Rimozione colonna `ID` rumorosa in `CeoDashboard.TabProgetti`.
4. `tsgo` + verifica render con Playwright su `/ceo-dashboard`, `/projects`, `/quotations`, `/inventory`, `/monitor`.

Confermi e procedo?