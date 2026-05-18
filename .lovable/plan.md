# Team Workspace — Kanban condivisa per riunioni e attività trasversali

Sì, ha senso. L'idea si integra bene con quello che già esiste (`project_tasks`, `MyTasks`, `ProjectCanvas`) senza duplicare entità: estendiamo il task come **single source of truth** e aggiungiamo il concetto di **Team / Work Group** + **Sprint settimanale** come contenitori organizzativi.

## 1. Modello concettuale

Un task vive in tre dimensioni opzionali:

- **Progetto** (`certification_id`) — se presente, compare nel Project Canvas/WBS di quel progetto. Se NULL → task generale/aziendale.
- **Assegnatario** (`assigned_to`) — compare nella to-do personale di quella persona (MyTasks).
- **Team + Sprint** (`team_id`, `sprint_id`) — compare nella board del team e raggruppa le attività decise in una specifica riunione/settimana.

Stesso record, tre viste. Nessun doppio inserimento.

```text
                    ┌──────────────────┐
                    │   team_tasks     │  (estensione di project_tasks)
                    │  - cert_id?      │
                    │  - assignee?     │
                    │  - team_id?      │
                    │  - sprint_id?    │
                    │  - kind: project│ general
                    └────────┬─────────┘
            ┌────────────────┼────────────────┐
            ▼                ▼                ▼
     Team Board        Project Canvas      My Tasks
   (filtri risorsa     (solo task con      (Project Tasks
    e progetto)         cert_id)            + General Tasks)
```

## 2. Nuove entità

- **teams** — gruppi di lavoro creati liberamente (es. "Energy Squad", "Documentation"). Campi: `name`, `description`, `color`, `created_by`.
- **team_members** — chi appartiene al team, con ruolo nel team (`lead`, `member`). Un utente può stare in più team.
- **team_sprints** — periodi di lavoro (settimana o riunione). Campi: `team_id`, `label` (es. "Settimana 21/2026"), `start_date`, `end_date`, `meeting_notes` (rich text opzionale, qui il PM/Admin annota da quale riunione nasce lo sprint).

## 3. Estensione di `project_tasks`

Per evitare di creare una tabella parallela, estendiamo `project_tasks`:

- `certification_id` → reso **nullable** (oggi è NOT NULL).
- Nuovi campi: `team_id`, `sprint_id`, `task_kind` (`project` | `general`), `title` (rinomina logica di `task_name`), `description`, `priority`, `due_date`.
- Indici su `team_id`, `sprint_id`, `assigned_to`.

Compatibilità: tutto il codice che oggi filtra per `certification_id NOT NULL` continua a funzionare (Project WBS/Canvas). Le viste nuove leggono dalla stessa tabella con filtri diversi.

## 4. Visibilità (RLS)

- ADMIN → tutto.
- Membri del team → vedono e scrivono i task del proprio team (anche se senza `certification_id`).
- PM → continua a gestire i task delle proprie certificazioni; in più vede/edita i task dei team di cui fa parte.
- Operativi → vedono i task assegnati a loro + quelli dei loro team.

## 5. UI/UX — dove vive

### A) Nuova pagina `/team-board` (Admin + PM + operativi)

Voce in sidebar **Team Board**, sotto "My Tasks".

- Selettore Team in alto + selettore Sprint (con freccia avanti/indietro per navigare settimane).
- Kanban a 4 colonne: **To Do · In Progress · Review · Done**.
- Filtri rapidi: risorsa (avatar chips), progetto, "Solo generali".
- **Quick Add bar** stile Linear: digiti il titolo + invio. Suggerimenti inline tipo `@mario` (assegnatario), `#prada` (progetto, opzionale), `!alta` (priorità).
- Drag&drop tra colonne aggiorna lo `status`.
- Pannello laterale: "Meeting notes" dello sprint corrente (editor markdown) — qui Admin/PM scrive il verbale, da cui sono nate le card.
- Pulsante "Nuovo sprint da riunione" che crea uno sprint con label = data + note vuote.

### B) `MyTasks.tsx` — due sezioni

- **Project Tasks** — card con badge progetto (link al Project Detail).
- **General / Team Tasks** — card con badge team (colore del team) e link allo Sprint che le ha originate.
- Ordinamento per `due_date` e `priority`.

### C) `ProjectCanvas.tsx` — invariato funzionalmente

I task creati dal Team Board con `certification_id` compaiono automaticamente nella sezione tasks del progetto, con un piccolo badge "from {team_name} — sprint {label}" per tracciare l'origine.

### D) Admin — Tasks page

Nella pagina `/admin-tasks` aggiungiamo un tab "Team Activity" con riepilogo per team/sprint (throughput, % done, carico per risorsa) — utile per leggere a colpo d'occhio le attività "invisibili" non fatturabili.

## 6. Suggerimenti interattivi

Per rendere la compilazione veloce in riunione:

- Auto-suggerisce di **collegare uno sprint a una riunione** quando l'utente apre la pagina e l'ultimo sprint è chiuso.
- Quick Add con parser inline (`@`, `#`, `!`).
- "Promuovi a project task" su una card generale: dropdown di progetti recenti.
- "Generale" è il default quando non si seleziona progetto — niente attriti.

## 7. Vantaggi

- Single source of truth: scrivi una volta, compare ovunque (project canvas, my tasks, team board).
- Visibilità delle attività **non fatturabili** che oggi sono invisibili.
- Ogni risorsa esce dalla riunione con la to-do list già popolata.
- Storia tracciabile: ogni task sa da quale sprint/riunione è nato.

## 8. Dettagli tecnici (per chi implementa)

Migration 1 — schema:
- `ALTER TABLE project_tasks ALTER COLUMN certification_id DROP NOT NULL`.
- Aggiunta colonne: `team_id uuid REFERENCES teams`, `sprint_id uuid REFERENCES team_sprints`, `task_kind text DEFAULT 'project'`, `priority text`, `due_date date`, `description text`.
- Creazione tabelle `teams`, `team_members`, `team_sprints` + RLS + trigger `updated_at`.
- Helper RPC `is_team_member(_user_id, _team_id)` SECURITY DEFINER.
- Aggiornamento policy `project_tasks`: viewable se ADMIN ∨ assignee ∨ PM della cert ∨ team member; writable secondo le stesse regole.

Frontend:
- Nuova route `/team-board` + voce sidebar (visibile a tutti i ruoli autenticati, escluso `viewer`).
- Hook `useTeamTasks(teamId, sprintId)`, `useTeams()`, `useTeamSprints(teamId)`.
- Componente `TeamKanbanBoard` con dnd-kit (già nelle deps tramite shadcn? altrimenti `@hello-pangea/dnd`).
- Quick Add con regex parsing dei token `@`, `#`, `!`.
- Aggiornare `MyTasks.tsx` per dividere in due sezioni e leggere anche i task `team_id IS NOT NULL AND certification_id IS NULL`.
- Aggiornare `useProjectTasks` per mostrare nel Project Canvas il badge "from team/sprint" quando presente.

Realtime: subscription Supabase su `project_tasks` filtrato per `team_id` per aggiornamento live durante le riunioni.

## 9. Fuori scope (per ora)

- Commenti/thread sulle card.
- Time tracking sulle card generali (resta sul timesheet esistente).
- Notifiche push (resta su task_alerts esistente).
