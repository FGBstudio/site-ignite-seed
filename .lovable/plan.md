## Pre-Sales / Quotation Flow Integration

### What it does

Adds a "Quotation" phase before the operational phase. New projects start as commercial quotes (no PM assigned), and only transition to operational status when confirmed by Admin. Adds "Canceled" status for rejected quotes.   
Nuove Tab: Aggiungere nella sezione dove sono presenti To Configure (n), In Progress (n), Certified (n) due nuove sezioni: "Quotation" (posizionata come prima tab a sinistra) e "Canceled" (posizionata per ultima a destra).

### Database Changes (Migration)

**Add columns to `certifications` table:**


| Column              | Type    | Default |
| ------------------- | ------- | ------- |
| sqm                 | numeric | null    |
| fgb_monitor         | boolean | false   |
| services_fees       | numeric | null    |
| gbci_fees           | numeric | null    |
| total_fees          | numeric | null    |
| quotation_notes     | text    | null    |
| quotation_sent_date | date    | null    |
| po_sign_date        | date    | null    |


No new `status` column needed — the existing `status` column (text) already holds free-form values. We add two new values: `quotation` and `canceled` to the application logic.

### Type Changes

`**src/hooks/usePMDashboard.ts**`: Extend `SetupStatus` to include `quotation` and `canceled`:

```ts
export type SetupStatus = "quotation" | "da_configurare" | "in_corso" | "certificato" | "canceled";
```

### Hook: `useAdminPlannerData.ts`

Update the `setup_status` derivation logic:

- If `c.status === "quotation"` → `setup_status = "quotation"`
- If `c.status === "canceled"` → `setup_status = "canceled"`
- Then existing logic for certificato / in_corso / da_configurare
- Skip `missing` checks for quotation/canceled projects

### `ProjectFormModal.tsx` — Multi-mode form

Add a `mode` prop: `"create_quotation" | "confirm_project" | "edit"` (default: `"edit"`).

**Mode `create_quotation`:**

- Show: Site selection, Name, Client, Region, Handover Date, Certification toggles (type/rating/level/subtype)
- Show NEW: sqm, fgb_monitor, services_fees, gbci_fees, total_fees, quotation_notes, quotation_sent_date
- Hide: PM selector, Hardware allocations, Status field
- On submit: insert with `status = "quotation"`, `pm_id = null`

**Mode `confirm_project`:**

- Show: Read-only overview of project data (name, client, cert type, fees)
- Show EDITABLE: PM selector (required), po_sign_date
- Hide: everything else
- On submit: update `pm_id`, `po_sign_date`, `status = "in_progress"` → triggers `setup_status = "da_configurare"`

**Mode `edit`:**

- Current behavior, unchanged. PM selector visible as today.

### `Projects.tsx` — Dashboard tabs

Update the status tabs from 4 to 6:

```
Quotation | To Configure | In Progress | Certified | Canceled
```

- **Quotation tab**: Rows show project name, client, cert type, fees summary, quotation_sent_date. Instead of "Edit/Details" buttons, show:
  - "Confirmed" (green) → opens `ProjectFormModal` in `confirm_project` mode
  - "Canceled" (red) → updates status to `canceled` directly
- **Canceled tab**: Read-only list of canceled projects.
- Update `SETUP_STATUS_META` to include `quotation` and `canceled` entries.
- Update badge counts to include the two new statuses.

### Files Modified


| File                                           | Change                                                                       |
| ---------------------------------------------- | ---------------------------------------------------------------------------- |
| DB migration                                   | Add 8 columns to `certifications`                                            |
| `src/hooks/usePMDashboard.ts`                  | Extend `SetupStatus` type                                                    |
| `src/hooks/useAdminPlannerData.ts`             | Handle `quotation`/`canceled` in setup_status logic                          |
| `src/components/projects/ProjectFormModal.tsx` | Add `mode` prop, conditional field rendering, quotation fields, confirm mode |
| `src/pages/Projects.tsx`                       | Add Quotation/Canceled tabs, Confirmed/Canceled action buttons               |
