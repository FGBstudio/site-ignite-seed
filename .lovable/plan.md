

# Integrazione Scorecard Templates dal JSON

## Cosa cambia

Il file JSON fornisce scorecard per tutte le tipologie di certificazione: LEED (5 varianti per subtype), BREEAM (4 varianti), WELL (1 universale). Attualmente `certificationTemplates.ts` ha scorecard solo per LEED BD+C e O+M, mentre BREEAM e WELL mostrano "scorecard non disponibile".

## Mappatura chiavi JSON → sistema esistente

| Chiave JSON | cert_type | cert_rating | project_subtype | Note |
|---|---|---|---|---|
| LEED_BD+C_NC | LEED | BD+C | New Construction | Default per BD+C |
| LEED_BD+C_CS | LEED | BD+C | Core & Shell | |
| LEED_BD+C_Healthcare | LEED | BD+C | Healthcare | |
| LEED_ID+C_CI | LEED | ID+C | (tutti) | Stessa scorecard per CI/Retail/Hospitality |
| LEED_O+M_EB | LEED | O+M | (tutti) | |
| BREEAM_UK_NC_2018_Fully_Fitted | BREEAM | New Construction | — | Default per NC |
| BREEAM_UK_NC_2018_Simple_Buildings | BREEAM | New Construction | Simple Buildings | Variante semplificata |
| BREEAM_InUse_V6_Asset_Performance | BREEAM | In-Use Part 1 | — | |
| BREEAM_InUse_V6_Management_Performance | BREEAM | In-Use Part 2 | — | |
| WELL_v2 | WELL | (tutti) | — | Unico template per tutti i rating WELL |

## Piano tecnico

### 1. Aggiornare `src/data/certificationTemplates.ts`
- Sostituire le scorecard hardcoded con i dati dal JSON
- Ogni entry del JSON diventa una `ScorecardCategory` con `category = category_code`, `requirement = requirement_label`, `max_score`
- Aggiungere chiavi con subtype nel registry: `"LEED|BD+C|Core & Shell"`, `"LEED|BD+C|Healthcare"`, etc.
- Per BREEAM NC aggiungere entrambe le varianti (Fully Fitted come default)
- Per WELL usare lo stesso template per tutti i rating
- Rimuovere il vecchio `LEED_TEMPLATE` import e le scorecard dettagliate per credito singolo

### 2. Aggiornare `getCertificationTemplate()` e `getTemplateOrFallback()`
- Aggiungere parametro opzionale `subtype?: string`
- Logica di lookup: prima `cert_type|rating|subtype`, poi fallback a `cert_type|rating`, poi `cert_type`
- Per WELL: il template è unico, quindi `"WELL|*"` match qualsiasi rating

### 3. Aggiornare `PMProjectConfigModal.tsx`
- In `useProjectTemplate()`: passare anche `project.project_subtype` alla funzione di lookup
- Il resto del flusso (inizializzazione, salvataggio in `certification_milestones`, aggiornamento score su `certifications`) resta identico

### 4. Aggiungere `project_subtype` al tipo `PMProject`
- In `usePMDashboard.ts`, aggiungere `project_subtype?: string | null` all'interfaccia `PMProject`
- Il campo è già fetchato dalla query (`SELECT *`) ma non tipizzato

### 5. Rimuovere `src/data/leedTemplate.ts` (opzionale)
- Non più necessario: le scorecard sono tutte definite in `certificationTemplates.ts`
- Il file è usato anche da `ScorecardEditor.tsx` per `getLeedLevel` e `LEED_MAX_TOTAL` → spostare queste utility in `certificationTemplates.ts` o lasciarle in `leedTemplate.ts`

## File coinvolti
1. `src/data/certificationTemplates.ts` — nuovi dati scorecard + lookup con subtype
2. `src/components/projects/PMProjectConfigModal.tsx` — passare subtype al template resolver
3. `src/hooks/usePMDashboard.ts` — tipizzare `project_subtype`

## Risultato
- PM clicca "Genera Griglia Scorecard" → ottiene la scorecard corretta per il suo specifico tipo/sottotipo di certificazione
- Le righe vengono scritte in `certification_milestones` con `milestone_type = 'scorecard'`, immediatamente visibili anche lato cliente (Showroom)
- BREEAM e WELL non mostrano più "scorecard non disponibile"

