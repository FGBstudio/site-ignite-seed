# Ripristino distinzione Completed vs Certified

## Obiettivo

Ripristinare la mappatura originale:
- `certifications.status = 'completato'` → tab **Completed** (`setup_status = 'completato'`)
- `certifications.status = 'certificato'` (o `active` + `issued_date` <= oggi) → tab **Certified** (`setup_status = 'certificato'`)

## Modifiche

### 1. `src/hooks/useAdminPlannerData.ts`
- Separare la condizione:
  - `isCompleted = c.status === 'completato'`
  - `isCertified = c.status === 'certificato' || (c.status === 'active' && issued_date <= today)`
- Aggiornare l'assegnazione di `setup_status`:
  ```
  if (isCertified) → 'certificato'
  else if (isCompleted) → 'completato'
  else if (hasTimeline) → 'in_corso'
  else → 'da_configurare'
  ```
- Nel plannerData, trattare anche `completato` come stato finale (actualEnd valorizzato, status label "Completed").

### 2. `src/hooks/useAdminCalendarData.ts`
- Stessa separazione tra `isCompleted` e `isCertified`.
- `setup_status = 'completato'` quando applicabile.

Nessun'altra modifica: `Projects.tsx` ha già il tab Completed e il contatore che filtra su `'completato'`, quindi tornerà a popolarsi automaticamente.

## Fuori scope

- Nessuna modifica al DB.
- Nessuna modifica al flusso di transizione (chi/come setta `completato` o `certificato` resta invariato).
- `usePMDashboard.ts` non ha la distinzione Completed nel Board PM (che usa solo 3 stati) e resta invariato.