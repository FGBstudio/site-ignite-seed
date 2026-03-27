

# Analisi Architetturale v1.0 — Risposte alle 5 Domande Strategiche

## Risposta 1: Le Tabelle che Alimentano Timeline e Scorecard

La tabella chiave è **`certification_milestones`**. Sia la Timeline che la Scorecard vivono nella stessa tabella, differenziate dalla colonna `milestone_type`:

```text
certification_milestones
├── id (uuid PK)
├── certification_id (uuid FK → certifications.id)  ← LINK CHIAVE
├── milestone_type ("timeline" | "scorecard")        ← DISCRIMINATORE
├── category (text)         — es. "Timeline" o "EA"
├── requirement (text)      — es. "Fase di Design" o "Energia e Atmosfera"
├── order_index (int)
├── start_date (date)       — solo per timeline
├── due_date (date)         — solo per timeline
├── completed_date (date)   — solo per timeline
├── status (text)           — "pending" | "in_progress" | "achieved"
├── score (numeric)         — solo per scorecard
├── max_score (numeric)     — solo per scorecard
├── evidence_url (text)
└── notes (text)
```

La tabella padre è **`certifications`**, collegata al sito fisico tramite `site_id`:

```text
certifications
├── id, site_id, cert_type, level, status
├── score (totale aggregato), target_score
├── issued_date, expiry_date
└── categories (jsonb)
```

Il PM deve riempire: `start_date`, `due_date`, `completed_date`, `status` (per timeline) e `score` (per scorecard) nelle righe di `certification_milestones`.

## Risposta 2: Template — Stato Attuale

I template sono già definiti in codice in `src/data/certificationTemplates.ts` e `src/data/leedTemplate.ts`. Supportano:

- **LEED BD+C**: 17 step timeline + ~40 credit scorecard (da `leedTemplate.ts`)
- **LEED ID+C Retail**: 17 step timeline + scorecard BD+C (approssimata)
- **LEED O+M**: 11 step timeline + 30+ credit scorecard
- **Fallback generico**: 7 step timeline

Quando sei pronto, carica il JSON e lo integreremo nel `TEMPLATE_REGISTRY`. La struttura attesa è `{ scorecard: [{category, requirement, max_score}], timeline: [{name, order_index}] }`.

## Risposta 3: Lo "Switch" di Visualizzazione su Reproduce-Recreate

Non esiste un trigger esplicito nel database (nessun flag `has_certification` o trigger SQL). Lo switch è **implicito e basato sui dati**:

1. La tabella `certifications` ha una riga con `site_id` = sito dell'utente
2. La colonna `status` nella certificazione determina la visibilità (`in_progress` o `active`)
3. La presenza di righe in `certification_milestones` con `certification_id` corrispondente popola i widget

Quindi il "trigger" è: **la semplice esistenza di record validi in `certifications` + `certification_milestones` per quel `site_id`**. Non serve toccare il DB — basta che il PM salvi i dati tramite il `PMProjectConfigModal`.

## Risposta 4: Ciclo di Vita del Progetto — Stato Attuale vs Desiderato

**Attualmente** nel codice (`usePMDashboard.ts`, righe 84-112), la classificazione è calcolata client-side:

| Stato | Condizione attuale |
|---|---|
| `da_configurare` | Manca almeno uno tra: Hardware, Timeline (milestone con date), Scorecard |
| `in_corso` | Tutti e tre presenti |
| `certificato` | Cert con `status = "active"` OPPURE progetto con `status = "Completed"` |

**Desiderato** (dalla tua specifica):

| Stato | Nuova condizione |
|---|---|
| Da Configurare | Mancano date nella timeline o scorecard non compilata |
| In Corso | Tutte le date compilate + timeline confermata |
| Certificato | Data di certificazione ≤ oggi + PM ha flaggato "Certified" |

### Piano di adeguamento (solo frontend, nessuna modifica DB)

1. **Modificare la logica in `usePMDashboard.ts`**: Rimuovere il vincolo Hardware dalla classificazione. `in_corso` scatta quando tutte le milestone timeline hanno `start_date` + `due_date` compilate E almeno una riga scorecard esiste.
2. **Per "Certificato"**: Verificare che `certifications.issued_date <= today` E `certifications.status === "active"`. Il PM imposta questo tramite un'azione esplicita nel `PMProjectConfigModal` (un bottone "Segna come Certificato" che aggiorna `certifications.status` → `"active"` e `issued_date`).

## Risposta 5: Tabella Profili e PM

I PM **non** sono salvati con un campo `role` nella tabella `profiles`. Il sistema usa una tabella separata `user_roles`:

```text
user_roles
├── id (uuid PK)
├── user_id (uuid FK → auth.users)
├── role (app_role enum: 'ADMIN' | 'PM' | 'document_manager' | 'specialist' | ...)
└── UNIQUE(user_id, role)
```

Il codice in `useProjectManagers.ts` fa esattamente:
1. Query `user_roles` dove `role = 'PM'` → ottiene lista `user_id`
2. Query `profiles` con quei `user_id` → ottiene `full_name` per il dropdown

La tabella `profiles` contiene: `id, email, full_name, display_name, first_name, last_name, company, job_title, phone, avatar_url`.

---

## Riepilogo Architetturale

```text
┌─────────────────────────────────────────────────────┐
│                  SUPABASE (Cervello)                 │
│                                                     │
│  sites ──→ certifications ──→ certification_milestones │
│              (site_id)          (certification_id)   │
│                                 milestone_type:      │
│                                 "timeline"|"scorecard"│
│                                                     │
│  projects ──→ pm_id (user_roles.user_id)            │
│           ──→ site_id                                │
│                                                     │
│  project_allocations (hardware)                      │
│  user_roles (ADMIN, PM, ...)                        │
│  profiles (anagrafica utenti)                        │
└─────────────────────────────────────────────────────┘
        ↑                              ↑
  Site-Ignite-Seed              Reproduce-Recreate
  (Admin + PM scrivono)         (User legge)
```

Sono pronto per ricevere il JSON dei template. Caricalo quando vuoi.

