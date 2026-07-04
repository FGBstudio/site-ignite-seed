## Obiettivo

1. Uniformare tutte le tabelle (Operations, Projects, Energy, Air, Quotations) al formato **CLIENT | CITY | PROJECT NAME**.
2. Rendere `issued_date` opzionale (solo anno) e usarla come flag "certificato", ma può anche compilarsi quando il PM segna attraverso la wizard timeline il progetto come certificato e poi posso comunque mettere anche mese e giorno, semplicemnete fai in modo che si accetti anche solo l'anno.
3. Decidere come mostrare `city` in tabella nel modo più performante.

---

## 1. Ordinamento colonne tabelle

Tutte le tabelle progetti riordinate a tre colonne principali fissate a sinistra, nell'ordine:

```
CLIENT (brand/holding)  |  CITY (dal site)  |  PROJECT NAME (certifications.name)
```

Applicato in: `PMProjectsBoard`, `Projects.tsx`, `AirTable`, Energy monitoring table, `Quotations.tsx`, viste admin (AdminTimeline / AdminTasks se mostrano progetti).

---

## 2. Autocompilazione Project Name = Site Name

Nei wizard (`NewQuotationWizard`, `ProjectCreateWizard`, `SiteProjectOnboardingForm`):

- Quando l'utente inserisce/seleziona il **site name**, il campo `certifications.name` viene precompilato automaticamente con lo stesso valore.
- Il campo resta editabile: se il PM ha bisogno di un nome diverso, lo modifica manualmente e l'auto-fill non sovrascrive più.
- Nessun trigger DB: gestito solo lato form (evita magia lato server e mantiene la modifica libera).

---

## 3. Issued date → solo anno + flag "certificato"

- `issued_date` resta `date` in DB ma diventa **nullable-friendly**: se l'utente inserisce solo l'anno, salviamo `YYYY-01-01` (convenzione interna).
- UI: input dedicato "Certification Year" (numero a 4 cifre) invece di date-picker giorno/mese/anno. Placeholder: "e.g. 2026".
- **Regola derivata**: `isCertified = issued_date IS NOT NULL`. Rimuoviamo ogni check tipo `issued_date <= today` (in `useAdminCalendarData`, `useAdminTasksData`, ecc.) e sostituiamo con "ha issued_date → certificato".
- Lo status "certificato" viene calcolato/aggiornato di conseguenza (nessun vincolo su giorno/mese).

---

## 4. City in tabella: lookup dal site (NON duplicare)

**Raccomandazione: leggere `city` dal `site` via join, NON duplicarla su `certifications`.**

Motivi:

- **Prontezza frontend**: Supabase fa già il join in una singola query (`select("*, sites(name, city, country)")`) — il costo è trascurabile e già utilizzato ovunque (es. `useProjectDetails`, `useAdminCalendarData`).
- **Coerenza dati**: la città è una proprietà fisica del sito. Duplicarla su `certifications` significa dover mantenere sincronizzati due campi ad ogni update del site (trigger extra, rischio drift).
- **Nome progetto ≠ città**: il nome è concettualmente separabile (il PM può volerlo diverso dal site), la città no — geograficamente il progetto **è** dove sta il sito.
- Nessun calcolo lato client: `sites.city` arriva già nel payload della query esistente.

Quindi: **duplichiamo `name` (già fatto de facto con l'auto-fill), NON duplichiamo `city**`.

Cambio pratico nelle tabelle: aggiungere/rinominare la colonna e mappare `row.sites?.city` (o `row.city` dove già flattenato). Dove la query non include ancora `sites(city)`, la estendiamo.

---

## 5. Dettagli tecnici

- **Migration**: nessuna modifica strutturale su `certifications` (niente colonna `city` duplicata). Solo eventuale allentamento validazioni su `issued_date` se presenti.
- **Componente input anno**: piccolo helper `<YearInput>` riusabile che scrive `YYYY-01-01` in DB e mostra solo `YYYY` in UI.
- **Refactor letture certificato**: sostituire ovunque la logica `status === "certificato" || (status === "active" && issued_date <= today)` con `!!issued_date`.
- **Query hooks**: dove serve `city` in tabella e non è già presente, estendere il `.select` a `sites(name, city, country)`.

---

## Out of scope

- Nessun redesign visuale delle tabelle oltre riordino colonne.
- Nessuna modifica alle logiche di monitoring/allocation.
- Nessuna nuova pagina admin.