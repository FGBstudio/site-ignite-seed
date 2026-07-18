## Diagnosi

La tab "Capacity" era stata aggiunta erroneamente in `CeoDashboard.tsx` (pagina Admin Dashboard, `/ceo-dashboard`). La sezione **Operations** che vedi in screenshot vive invece in `src/pages/Projects.tsx` (`/projects`), dove i tab attuali sono: Projects · Timeline · Device Demand Analysis · Reports. Ecco perché non vedevi nulla.

## Piano

1. **Spostare "Capacity" in `src/pages/Projects.tsx**` (accessibile solo ad Admin):
  - Aggiungere `<TabsTrigger value="capacity">` **dopo** Reports (icona `Users` o `Gauge`).
  - Aggiungere `<TabsContent value="capacity"><CapacityDashboard /></TabsContent>` che monta il componente già esistente `src/components/dashboard/capacity/CapacityDashboard.tsx` (con i 3 livelli Tactical / Operational / Strategic).
  - Nascondere il trigger per i non-admin: la pagina `/projects` è condivisa Admin+PM, quindi wrappare la tab con un check sul ruolo dall'`AuthContext` (`role === "ADMIN"`).
2. **Rimuovere la tab duplicata da `CeoDashboard.tsx**`:
  - Eliminare `<TabsTrigger value="capacity">` e il relativo `TabsContent` per evitare duplicazione con la nuova posizione in Operations.
3. **Nessuna modifica DB**: tabelle (`pm_calendar_slots`, `change_requests`) e viste (`view_user_weekly_capacity`, `view_user_monthly_capacity`) sono già create e con RLS/GRANT corretti dalla migrazione `20260717144542_*`.
4. **Verifica**: dopo il rebuild, in `/projects` come Admin dovresti vedere la 5ª tab **Capacity** dopo Reports, con la stessa esperienza descritta in precedenza.

## Nota su lato PM

La tab **PM Planner** su `PMProjectsBoard.tsx` (accessibile dal PM Portal) è già presente e corretta; inverti le tab 1 · Contract Overview con 3 · Weekly Scheduler . poi aggiungi la possibilità di modificare la viuew su base invece che settimanale anche mensile e annuale modificando poi le ore (e mezzore in giorni e poi in settimane). aggiungi poi sempre filtri temporali e possibilità di muoversi avanti e indietro nell'orizzonte temporale e di selezionarlo 