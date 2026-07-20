
## Stato attuale (verificato)

- Il PM può già creare **Milestones** (`cert_wbs_phases`) e **Attività** (`cert_tasks`) tramite `TimelineSetupWizard.tsx` e le hook in `usePMPortalData.ts`.
- **Non esiste** alcun sistema di invito/collaborazione tra PM (nessun match per "collaborator/invite/guest" nel codice).
- RLS attuale: l'accesso PM alle certificazioni passa da `is_cert_pm()` che controlla `certifications.pm_id` (singolo owner).

Da costruire quindi da zero: modello dati collaborazioni, workflow approvazione Admin, aggiornamento RLS per accesso condiviso, UI di invito lato PM e UI di governance lato Admin.

---

## 1. Modello Dati (migrazione Supabase)

Nuova tabella `cert_collaborations`:

- `certification_id` → FK certifications
- `owner_pm_id` → chi invita (uuid)
- `guest_pm_id` → chi è invitato (uuid)
- `scope` → enum: `certification` | `phase` | `tasks` (granularità dell'accesso)
- `phase_ids` uuid[] (nullable, se scope=phase)
- `task_ids` uuid[] (nullable, se scope=tasks)
- `estimated_hours` numeric
- `message` text (motivazione al PM invitato + note per Admin)
- `status` enum: `pending` | `approved` | `rejected` | `changes_requested` | `revoked`
- `admin_id` (chi ha deciso), `admin_note`, `decided_at`
- `created_at`, `updated_at`

Grants standard + RLS:
- INSERT: `owner_pm_id = auth.uid()` e il chiamante è PM della cert (`is_cert_pm`).
- SELECT: owner OR guest OR admin.
- UPDATE (decisione): solo `is_admin(auth.uid())`.
- UPDATE (revoca/edit draft): solo owner mentre `status='pending'`; admin sempre.

Helper security-definer `public.is_cert_collaborator(cert_id, uid)` → true se esiste una `cert_collaborations` approvata dove `guest_pm_id = uid` per quella cert.

Aggiornamento RLS (senza toccare le policy owner esistenti, aggiunte in OR):

- `certifications` SELECT: aggiungere policy "guest collaborator can read" via `is_cert_collaborator`.
- `cert_wbs_phases` / `cert_tasks` SELECT: idem (lettura contesto).
- `cert_tasks` UPDATE: consentita al guest **solo** sui task dove `assignee_id = auth.uid()` (scrittura ristretta ai propri task, come da specifica).
- Tabelle correlate al progetto già lette in modo derivato (milestones, checklists) → aggiungere SELECT via `is_cert_collaborator` dove necessario.

Tabella `audit_logs`: log automatico su insert/decisione tramite trigger (integra con AuditTrail esistente).

---

## 2. Notifiche

Riusiamo il pattern `task_alerts` esistente:
- Alla creazione richiesta → alert per tutti gli Admin (`kind='collab_request'`).
- Alla decisione → alert per l'owner e il guest.
- All'approvazione → alert al guest con link al progetto.

---

## 3. UI — PM Owner (in `TimelineSetupWizard` / vista Timeline PM)

Nuova sezione **"Collaborators"** nel dettaglio progetto PM:

- Bottone **"Invite collaborator"** sopra la lista task/milestones.
- Multi-select task/milestone (o "intera certificazione") già presente nella timeline (aggiungiamo checkbox riga).
- Dialog `InviteCollaboratorDialog.tsx`:
  - Select PM (lista utenti con ruolo PM esclusi owner corrente).
  - Scope calcolato dalla selezione (cert/phase/tasks).
  - Input ore stimate + textarea messaggio.
  - Submit → insert in `cert_collaborations` (status pending).
- Pannello "Pending / Active collaborators" con stato badge e possibilità di revocare/annullare draft.

---

## 4. UI — Admin Governance

Nuova tab **"Collaboration Requests"** dentro `AdminTasks.tsx` (e badge counter nel TopNavbar per pending):

- Tabella con: Owner PM, Guest PM, Project (Client · City · Project), Scope (con lista task/milestone), Estimated hours, Message, Created.
- Azioni per riga: **Approve**, **Reject**, **Request changes** (dialog con nota obbligatoria).
- Filtri: stato, PM, progetto.
- Integrazione in `AuditTrail.tsx`: mostra eventi `collaboration.*`.

---

## 5. UI — PM Guest

- In `PMProjectsBoard.tsx` la query "my certifications" viene estesa: unisce cert dove `pm_id = me` OR esiste collaborazione approvata → certificazioni "guest" visibili con badge **"Collaborator"**.
- Nella vista progetto per il guest: read-only ovunque, tranne i task dove è `assignee_id` (usa già `useCertTasksByAssignee`).
- Banner in alto: "You're collaborating on this project. Owner: <PM name>".

---

## 6. Hook & servizi

- `src/hooks/useCollaborations.ts`:
  - `useMyCollaborationRequests()` (owner view)
  - `useGuestCollaborations()` (guest view, per estendere lista progetti)
  - `usePendingCollabAdmin()` (admin queue)
  - `useCreateCollabRequest`, `useDecideCollabRequest`, `useRevokeCollabRequest`.
- Estensione `usePMProjects` per includere le cert dove sono guest approvato (UNION).

---

## 7. Dettagli tecnici

- Tutte le mutation invalidano le query keys standardizzate (`cert-tasks-*`, `pm-projects`, `admin-collab-requests`).
- Trigger `updated_at` + trigger che, all'approvazione, inserisce `task_alerts` per owner+guest.
- Nessuna rimozione di RLS esistenti; nuove policy additive con `is_cert_collaborator`.
- Fissiamo controllo su edge case: se il task cambia `assignee_id` dopo l'approvazione, il guest perde il write sul task (comportamento voluto).
- Revoca collaborazione: admin o owner → aggiorna `status='revoked'` e le policy smettono di dare accesso al guest.

---

## 8. Ordine di implementazione

1. Migrazione (tabella `cert_collaborations`, enum, funzione `is_cert_collaborator`, policy additive, trigger audit+alert).
2. Hook `useCollaborations.ts` + estensione `usePMProjects`.
3. UI PM Owner: `InviteCollaboratorDialog` + sezione Collaborators nella pagina progetto PM.
4. UI Admin: tab "Collaboration Requests" in `AdminTasks` + integrazione AuditTrail.
5. UI PM Guest: badge "Collaborator", banner read-only, gating write sui task propri.
6. QA end-to-end: create → pending → approve → guest vede progetto → guest edita solo propri task → revoca.
