
## Problema

I dati anagrafici del sito (city, country, region, address, timezone) inseriti durante l'onboarding non si propagano in modo coerente alle tabelle/viste di Projects. La radice non è il DB (i siti recenti hanno tutti i campi popolati), ma tre punti del codice frontend:

### Cause identificate

1. **`SiteProjectOnboardingForm.tsx` (ProjectFormModal)** — la modale "New Project on Site" della pagina Projects, quando l'utente sceglie "+" per creare un sito al volo, esegue:
   ```ts
   supabase.from("sites").insert({ name, brand_id })
   ```
   Tutti gli altri campi (city/country/region/address/timezone) **non sono nemmeno raccolti**: il sito nasce monco.

2. **`ProjectCreateWizard.tsx`** — quando si sceglie un sito **esistente**, `certifications.region` viene scritto col valore di `draft.region` (default "Europe") invece di derivarlo da `sites.region`. La vista Projects (che mostra `region` della cert) risulta incoerente col sito.

3. **`ProjectCreateWizard.tsx`** — un sito esistente con campi mancanti (es. `address` NULL) non è correggibile dal wizard: non c'è UI per fare update.

## Interventi

### A. ProjectFormModal — raccolta completa quando si crea un sito inline
File: `src/components/projects/SiteProjectOnboardingForm.tsx`

- Estendere il blocco "+ New Site" con i campi: City *, Country *, Region, Address, Timezone (default `Europe/Rome`).
- Validare city/country come required prima del submit.
- All'insert dei `sites`, passare tutti i campi raccolti (oltre a `name` e `brand_id`).
- Dopo la creazione, usare la `region` del nuovo sito per la `certifications.region`.

### B. ProjectCreateWizard — coerenza region cert↔site
File: `src/pages/ProjectCreateWizard.tsx`

- Quando l'utente seleziona un sito esistente (step 1), pre-popolare `draft.region` con `sites.region`.
- In `handleSubmit`, al ramo "sito esistente", leggere `region` (e `timezone`) dalla riga `sites` selezionata e usarli per la insert delle `certifications`, invece di affidarsi al solo `draft.region`.
- Mostrare nello step Review una riga "Site Region" derivata dal sito selezionato, non dal draft.

### C. ProjectCreateWizard — possibilità di completare un sito esistente
File: `src/pages/ProjectCreateWizard.tsx`

- Quando viene selezionato un sito esistente con campi mancanti (city / country / address / timezone NULL o vuoti), mostrare un piccolo pannello "Complete site details" pre-compilato con i valori attuali, editabile.
- Al submit, se i campi sono stati modificati, eseguire un `update` sulla riga `sites` selezionata prima di creare le certifications.

### D. Verifica letture downstream (solo controllo, nessuna modifica se ok)
Hooks già corretti: `useAdminPlannerData` e `usePMPortalData` joinano `sites(name, city, country, brand_id)` via `certifications_site_id_fkey` — una volta che il sito ha i dati, vengono visualizzati correttamente in tabelle/filtri di Projects e PM board. Nessuna modifica necessaria.

## Note tecniche

- Nessuna migrazione DB: lo schema `sites` ha già tutte le colonne.
- RLS: l'update di `sites` per completare un esistente è coperto dalle policy attuali (PM/admin sui propri siti).
- Strict TS, niente `as any` nuovi.

## Out of scope

- Non tocco la pagina `ProjectDetail` o l'edit del sito da Settings.
- Non rinomino/normalizzo colonne esistenti.
- Non aggiungo nuovi campi al DB.
