# Glossario — rinomine v1.1

La v1.1 §1 rinomina le etichette in tutta l'interfaccia. Gli identificatori
interni **restano quelli della v1** (`cronoprogrammi`, `cronoprogramma_eventi`,
route `/portafoglio` e `/projects/:id/cronoprogramma`): rinominare tabelle
applicate in produzione e rotte già distribuite romperebbe link salvati e
storico senza aggiungere nulla. La scelta è quindi: **etichette nuove,
identificatori vecchi**, e questo file è la mappa.

| Cosa vede l'utente | Dove | Identificatore interno |
|---|---|---|
| **PROJECTS** | Admin · sezione (ex CANTIERI) | route `/portafoglio`, file `PortafoglioCantieri.tsx`, componente `ProjectsAdmin` |
| **SERVICES** | Admin · dentro la sezione (tab e breadcrumb); nel menu principale resta OPERATIONS | route `/projects`, `Projects.tsx`, `TopNavbar` |
| **PROJECT TIMELINE** | PM · configurazione progetto (ex Cronoprogramma) | tabelle `cronoprogrammi` / `cronoprogramma_eventi`, route `/projects/:id/cronoprogramma` |
| **HQ FGB TIMELINE** | PM · sezione che portava il nome della certificazione | `certification_milestones` (`milestone_type = 'timeline'`) |

La parola «cronoprogramma» non compare più come nome di sezione; resta nel
testo descrittivo dove serve («timeline di cantiere fornita dal GC») e nel
codice come identificatore.

## Tipi di progetto (v1.1 §2)

| Tipo | Dove vive | Effetto |
|---|---|---|
| `design_construction` | `cronoprogrammi.tipo` | Template BDC (o IDC per il retail); gate attivo |
| `construction` | `cronoprogrammi.tipo` | Template CONSTRUCTION; gate attivo |
| `existing` | `certifications.project_tipo` (override) | Nessuna PROJECT TIMELINE, nessun gate |

Il tipo è **proposto dal catalogo** (`proponiTipo` in
`src/lib/projectTimelineTemplates.ts`) e il PM può cambiarlo; l'override si
scrive in `certifications.project_tipo` solo quando diverge dalla proposta.
