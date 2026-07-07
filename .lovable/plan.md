## Obiettivo

Aggiungere filtri per colonna alla tabella "Projects" mostrata in:

1. **Admin Dashboard** → tab "Projects" (`CeoDashboard.tsx` → `TabProgetti`)
2. **PM Dashboard** (`PMProjectsBoard.tsx`) — attualmente ha solo Search + 3 Select (Client/Region/City): sostituirli con lo stesso sistema per-colonna della sezione Operations.

La sezione **Operations** (`src/pages/Projects.tsx`) già usa il filtro stile Excel (sort ASC/DESC, ricerca testuale + checklist di valori distinti) tramite il componente `ColumnFilter` interno. Verrà estratto e riusato.

## Piano

### 1. Estrarre `ColumnFilter` come componente condiviso

- Nuovo file: `src/components/common/ColumnFilter.tsx`
- Sposta il componente `ColumnFilter` + i tipi `ColFilterState` / `SortConfig` da `src/pages/Projects.tsx` senza cambiare comportamento.
- `Projects.tsx` continua a funzionare importandolo dal nuovo path.

### 2. Filtri nell'Admin Dashboard – tab Projects

File: `src/pages/CeoDashboard.tsx`, funzione `TabProgetti`.

- Stato locale: `colFilters` (record per colonna) + `sortConfig`.
- Header colonne (Client, City, Project, Status, Start Date, Handover, PM) avvolti con `ColumnFilter`, con `uniqueValues` calcolati dai dati della tabella.
- Colonna "Progress" resta senza filtro (valore numerico calcolato).
- Applicazione filtri + sort prima del render, identica a Operations.

### 3. Filtri nella PM Dashboard

File: `src/components/projects/PMProjectsBoard.tsx`.

- Rimuovere i tre Select (Client / Region / City) e la Search bar attuali (o mantenerli, da confermare — vedi domanda in fondo).
- Poiché la vista PM è **Kanban** (card) e non tabella, il filtro per-colonna Excel-style non si applica direttamente. Due opzioni:
  - **(a)** aggiungere una vista "Table" (nuova tab accanto a Kanban / Global Planner) con le stesse colonne dell'Admin Dashboard e i filtri per colonna;
  - **(b)** convertire i Select esistenti in filtri multi-select per: Client, City, Region, Status, PM, con ricerca — mantenendo il layout Kanban.

Attendo la tua conferma sull'opzione preferita (vedi domanda finale).

---

## Sorgente dati per ciascuna colonna (tabella Admin Dashboard / Operations)

Hook: `useActiveProjects()` in `src/hooks/useCeoDashboardData.ts` — query su `certifications` con join a `sites` e `profiles`.


| Colonna    | Sorgente                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------ |
| Client     | `certifications.client`                                                                                      |
| City       | `certifications.sites.city` (join `sites` via `site_id`)                                                     |
| Project    | `certifications.name`                                                                                        |
| Status     | `certifications.status` (valori: `da_configurare`, `in_corso`, `certificato`, `completato`, `on_hold`, ecc.) |
| Start Date | Calcolato: minimo `start_date` tra i `cert_tasks` della certificazione (nessuna colonna dedicata)            |
| Handover   | `certifications.handover_date`                                                                               |
| PM         | `profiles.display_name` / `full_name` risolto da `certifications.pm_id`                                      |
| Progress   | Calcolato: `cert_tasks` completati / totali della certificazione                                             |


Nota: in PM Dashboard le stesse colonne provengono da `usePMDashboard()` (stessa tabella `certifications`, filtrata per `pm_id = auth.uid()`), con `project_allocations` e `certification_milestones` in join per lo stato di setup (Timeline / Hardware / Scorecard).

---

## Domanda per procedere

Nella **PM Dashboard**, vuoi:

- **(a)** una nuova vista tabella (nuova tab, con filtri per colonna identici ad Admin Dashboard), lasciando invariata la vista Kanban, **oppure**
- **(b)** trasformare gli attuali Select in filtri multi-select con ricerca, mantenendo solo Kanban + Global Planner?  
  
B