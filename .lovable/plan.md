
Obiettivo: ripristinare il flusso corretto. Il PM non deve più vedere il bottone/fallback “Puoi crearla automaticamente”; deve vedere la certificazione già associata dall’Admin, con timeline e milestone corrette.

Diagnosi verificata
- Il problema principale non è la lettura lato PM: oggi `certifications` ha già una policy `SELECT USING (true)`, quindi il PM può leggere.
- Il problema reale è che per almeno un progetto il record in `certifications` non esiste proprio.
- Verifica sul DB: il progetto `Casa FGB` ha `cert_type = LEED` e `cert_rating = ID+C v.4`, ma non ha nessuna riga corrispondente in `certifications`.
- Nel form `SiteProjectOnboardingForm.tsx` l’inserimento della certificazione è stato aggiunto, ma se fallisce viene solo loggato con `console.warn(...)` e il flusso continua come se fosse andato tutto bene.
- In `PMProjectConfigModal.tsx` è ancora presente il fallback `MissingCertificationFallback` con il messaggio falso e il bottone di auto-creazione.
- In `usePMDashboard.ts` l’associazione progetto → certificazione è troppo larga: oggi collega per solo `site_id`, quindi su siti con più certificazioni può prendere quella sbagliata.

Piano di correzione
1. Rimuovere il fallback sbagliato lato PM
- Eliminare `MissingCertificationFallback` da `PMProjectConfigModal.tsx`.
- Ripristinare la visuale precedente del modal.
- Se manca davvero il record DB, mostrare solo un messaggio neutro/non operativo, senza CTA di creazione automatica.

2. Correggere l’associazione progetto-certificazione nel flusso PM
- In `usePMDashboard.ts`, non usare più solo `site_id`.
- Associare la certificazione giusta con questa priorità:
  - `site_id` uguale al progetto
  - `cert_type` uguale al progetto
  - `level` uguale a `cert_rating` del progetto
- Se esistono più record compatibili, scegliere quello più recente o più coerente col progetto.
- Passare al modal solo la certificazione corretta, così Timeline e Scorecard usano l’ID giusto.

3. Rendere obbligatorio e affidabile il salvataggio della certificazione in onboarding
- In `SiteProjectOnboardingForm.tsx`, l’inserimento in `certifications` deve diventare parte obbligatoria del salvataggio.
- Se la certificazione non viene creata:
  - niente toast di successo
  - niente chiusura del dialog
  - errore mostrato esplicitamente all’Admin
- Rimuovere il `console.warn` silenzioso.
- Salvare coerentemente: `site_id`, `cert_type`, `level = cert_rating`, `status = in_progress`.

4. Sistemare il DB dove serve, ma in modo mirato
- Non aprire indiscriminatamente le tabelle: qui non serve “togliere tutte le restrizioni”.
- Verificare e normalizzare le policy su `certifications` e `certification_milestones` usando lo stesso schema già adottato nel progetto (`has_role(...)` / `is_cert_pm(...)`), perché oggi quest’area è incoerente rispetto al resto.
- Garantire in modo esplicito:
  - Admin: insert/update/select su `certifications`
  - PM assegnato: select/update sulla propria certificazione e all milestones collegate
- Questo evita che l’Admin “associ” una certificazione nel form ma il record non venga realmente persistito.

5. Backfill dei dati già rotti
- Inserire i record mancanti in `certifications` per i progetti già creati che hanno `cert_type`/`cert_rating` sul progetto ma nessuna certificazione reale.
- Priorità immediata: `Casa FGB`.
- Fare il backfill usando i dati del progetto:
  - `site_id`
  - `cert_type`
  - `cert_rating -> level`
  - `status = in_progress`

6. Verifica end-to-end
- Admin:
  - crea un nuovo sito/progetto con certificazione (es. LEED ID+C v.4)
  - conferma che il record esista davvero in `certifications`
- PM:
  - apre “I miei cantieri”
  - clicca “Configura Progetto”
  - vede la certificazione corretta, non il fallback
  - può inizializzare/vedere timeline e milestone del template corretto
- Verifica anche un progetto esistente già rotto (`Casa FGB`) dopo il backfill.

Dettagli tecnici
- File da aggiornare:
  - `src/components/projects/PMProjectConfigModal.tsx`
  - `src/hooks/usePMDashboard.ts`
  - `src/components/projects/SiteProjectOnboardingForm.tsx`
  - migration SQL per policy mirate su `certifications`
- Nota importante:
  - oggi il bug non è “il PM non è autorizzato a leggere”, ma “la riga certificazione manca oppure viene risolta male”.
  - inoltre esistono già duplicati in `certifications` su altri siti, quindi la risoluzione per solo `site_id` va corretta subito per evitare associazioni sbagliate.

Risultato atteso
- Visuale PM pulita come prima.
- Niente più messaggio falso “Puoi crearla automaticamente”.
- La certificazione associata dall’Admin viene davvero registrata.
- Il PM vede la certificazione giusta per quel progetto e può lavorare subito sulla timeline con le milestone corrette.
