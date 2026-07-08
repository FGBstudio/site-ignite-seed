## Diagnosi

Per i progetti **WELL** (e in generale per molte certification importate dagli store LensCrafters / Sunglass Hut / Grandvision / Salmoiraghi & Viganò) la colonna `certifications.client` è **vuota** nel DB. Verificato con query:

```
name: 0803 Lane Avenue Shopping Center → client: "" | sites.city: Upper Arlington | brand: LensCrafters
name: 0700 5805 Frantz Road           → client: "" | sites.city: Dublin           | brand: LensCrafters
name: 0401 Plymouth Meeting Mall      → client: "" | sites.city: Plymouth Meeting | brand: LensCrafters
```

Il *brand* corretto esiste sempre tramite `sites.brand_id → brands.name`. La colonna CLIENT nella tabella Operations mostra quindi stringa vuota (o, per il fallback UI, ricade sulla città). Il campo `brand_name` è già calcolato in `useAdminPlannerData` ma **non viene mai usato come sorgente del `client`** — è per questo che i WELL non emergono.

## Sorgenti dati (per la tabella Projects)

| Colonna       | Sorgente attuale                                             |
|---------------|--------------------------------------------------------------|
| CLIENT        | `certifications.client` (spesso NULL per WELL)               |
| CITY          | `sites.city` (via `certifications.site_id`)                  |
| PROJECT       | `certifications.name` (fallback `cert_type`)                 |
| REGION        | `certifications.region`                                      |
| CERTIFICATION | `certifications.cert_type`                                   |
| RATING        | `certifications.cert_rating` / `level`                       |
| SUBTYPE       | `certifications.project_subtype`                             |
| PM            | `profiles.display_name/full_name/email` via `pm_id`          |
| HANDOVER      | `certifications.handover_date` (o `issued_date` in Certified)|
| CONFIG STATUS | derivato: presenza Timeline / Scorecard / Hardware           |
| HARDWARE      | `project_allocations` aggregato                              |

## Strategia di fix (frontend-only, nessuna migrazione)

Il `brand` è, semanticamente, il vero cliente commerciale (LensCrafters, Sunglass Hut, ...). Uso un **fallback deterministico** nella sorgente unica dei dati, così tutte le tabelle a valle (Operations, Admin Dashboard, PM Dashboard) ereditano il fix.

### 1. `src/hooks/useAdminPlannerData.ts`

Definire un helper locale:

```ts
const resolveClient = (c: any, brandsMap: Map<string,string>): string => {
  const raw = (c.client ?? "").trim();
  if (raw) return raw;
  const brand = c.sites?.brand_id ? brandsMap.get(c.sites.brand_id) : null;
  return brand || "—";
};
```

Sostituire **ogni** `client: c.client` nel `.map(...)` (righe ~151 e ~290) con `client: resolveClient(c, brandsMap)`. Fare la stessa sostituzione nel `subLabel` dei `plannerData` (righe 159 e 268) per coerenza col Gantt.

### 2. Verifica a valle
- `Projects.tsx` legge `project.client` per: render cella, filtro colonna, ricerca globale, sort → tutto ok, riceve già il valore risolto.
- `CeoDashboard.tsx` e `PMProjectsBoard.tsx` consumano lo stesso hook (o replicano lo stesso shape); l'unica cosa da controllare è che nessuno faccia un secondo override tipo `client: c.client`. Se presente, applicare lo stesso helper.
- `ProjectContextCells.tsx` (usato da altre tabelle) legge `row.certifications?.client || row.client`. Aggiungere lì un fallback simmetrico a `row.certifications?.sites?.brand?.name` **solo** dove i join lo espongono già; altrimenti lasciare invariato (le tabelle Operations/Admin/PM passano dal hook e sono già coperte).

### 3. Non toccare
- Nessuna scrittura sul DB (i valori restano vuoti come sono).
- Nessuna modifica alla colonna CITY.
- Nessun cambio di stile: l'`uppercase` già presente farà apparire "LENSCRAFTERS", "SUNGLASS HUT", ecc.

## Risultato atteso

Nelle righe screenshot la colonna CLIENT mostrerà **LENSCRAFTERS** (o il brand corretto), la colonna CITY resta **UPPER ARLINGTON / DUBLIN / PLYMOUTH MEETING**, e il filtro/ordinamento su Client userà il valore risolto.
