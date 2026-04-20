

## Invoicing Schemes Tied to Project Timeline + Confirmation Workflow

### Goal
Admins pick an **invoicing scheme** when creating a quotation. The system auto-generates the payment milestones, links each tranche to a **timeline trigger** (quotation signed / design end / construction end), fires **alerts to PM + Admin** before each billing moment, and lets the **Admin** (only) confirm "Invoice sent" and "Payment received" — each confirmation writes an entry in the **Project Canvas** and the **Payments timeline**. PMs keep read-only view + alerts for follow-up.

### Predefined schemes

| Scheme | Tranches | Triggers |
|---|---|---|
| `quotation_construction_50_50` | 50% / 50% | Quotation signed → Construction end |
| `quotation_design_construction_30_40_30` | 30% / 40% / 30% | Quotation signed → Design end → Construction end |
| `bdc_sal_custom` | N tranches (manual) | Each tranche linked manually to any timeline milestone |

---

### 1. Database migration

Add to `cert_payment_milestones`:
- `payment_scheme TEXT` (denormalised on each row, identifies the parent scheme — same value across rows of one cert)
- `tranche_pct NUMERIC` — share (e.g. 50, 30, 40)
- `tranche_order INT` — ordering inside the scheme
- `trigger_event TEXT` — `quotation_signed | design_end | construction_end | manual_sal`
- `invoice_sent_date DATE` (Admin confirms invoice sent)
- `invoice_sent_by UUID`
- `payment_received_date DATE` (Admin confirms payment received)
- `payment_received_by UUID`

Status flow widened to: `Pending → Due → Invoiced → Paid` (+ existing `Overdue`). `Due` = trigger event reached but not yet invoiced.

Add to `task_alerts.alert_type` enum: **`billing_due`** (new value).

Trigger `trg_payment_status_from_timeline` on `certification_milestones` UPDATE: when a milestone matching the trigger event reaches `achieved`/`completed_date`, flip the matching `cert_payment_milestones` row from `Pending → Due` and create a `billing_due` alert escalated to Admin (and visible to PM). When a payment row stays `Due` for >7 days without `invoice_sent_date`, a daily cron-style check (or query-time computation) flags it and renews/refreshes the alert.

Helper function `apply_payment_scheme(cert_id, scheme, total_amount)`: deletes existing pending tranches and inserts new ones according to the scheme.

### 2. Scheme generator helper — `src/lib/paymentSchemes.ts` (new)

```ts
export type PaymentSchemeId =
  | "quotation_construction_50_50"
  | "quotation_design_construction_30_40_30"
  | "bdc_sal_custom";

export const PAYMENT_SCHEMES = {
  quotation_construction_50_50: {
    label: "50% Quotation / 50% Construction End",
    tranches: [
      { pct: 50, trigger: "quotation_signed", name: "50% on Quotation Signature" },
      { pct: 50, trigger: "construction_end", name: "50% on Construction End" },
    ],
  },
  quotation_design_construction_30_40_30: {
    label: "30% / 40% Design End / 30% Construction End",
    tranches: [
      { pct: 30, trigger: "quotation_signed", name: "30% on Quotation Signature" },
      { pct: 40, trigger: "design_end",       name: "40% on Design End" },
      { pct: 30, trigger: "construction_end", name: "30% on Construction End" },
    ],
  },
  bdc_sal_custom: {
    label: "BD+C — Custom SAL (defined per project)",
    tranches: [], // populated in the wizard
  },
};

export function generateTranches(scheme, totalAmount, certId) { /* returns rows for cert_payment_milestones */ }
```

### 3. Quotation wizard — Admin-only scheme picker

Modify **`src/components/projects/NewQuotationWizard.tsx`** (Step 2, "Services & Quote"):

- New section **"Invoicing Scheme"** with:
  - radio cards for the 3 schemes (above)
  - if `bdc_sal_custom` → repeatable rows (`% | Trigger milestone | Name`) — `+ Add SAL`, `Remove`. Sum must = 100%.
- On save: after the certification(s) is inserted, call `generateTranches(scheme, total_fees, certId)` and bulk-insert into `cert_payment_milestones`. The first tranche (`quotation_signed`) is created already in `Due` status when `quotation_sent_date` is set and signed (or stays `Pending` if not yet signed — Admin flips it via the same confirm flow).

Apply the same picker in **`src/pages/ProjectCreateWizard.tsx`** Step 3 (per-certification) so projects created outside the quotation wizard also support the schemes.

### 4. Payments view — split visibility & actions

Replace **`src/components/projects/ProjectPayments.tsx`** to read from `cert_payment_milestones` (currently it reads from the deprecated `payment_milestones`). New layout:

```
Scheme: 30/40/30 — Total €120,000          [Edit scheme] (Admin only)
─────────────────────────────────────────────────────────────────────
#1  30% — Quotation Signature       Due 12 Jan    [Pending]   —
#2  40% — Design End                Due 04 Apr    [Due]       [Mark invoice sent] (Admin)
#3  30% — Construction End          Due 18 Sep    [Pending]   —
─────────────────────────────────────────────────────────────────────
Bars:  ▓▓▓▓░░░░░░  Invoiced 30%   Paid 0%   Due 70%
```

- **Admin** sees two action buttons per row when applicable:
  - **"Confirm invoice sent"** → opens dialog (date defaulted today, optional invoice number/note) → updates row to `Invoiced` + writes `invoice_sent_date/by` + inserts a **canvas entry** (entry_type `payment_invoice_sent`) + resolves the related `billing_due` alert.
  - **"Confirm payment received"** → opens dialog (date defaulted today, optional note) → updates row to `Paid` + writes `payment_received_date/by` + inserts a **canvas entry** (entry_type `payment_received`).
- **PM** sees the same table but **without** action buttons (read-only badges only). PM still receives the alerts in the inbox.

### 5. Canvas integration

Extend `ENTRY_TYPE_CONFIG` in **`src/components/projects/ProjectCanvas.tsx`** with two new types:
- `payment_invoice_sent` — green/€ icon, label "Invoice issued"
- `payment_received` — emerald/check icon, label "Payment received"

Both entries auto-generated on Admin confirmation include the tranche name, amount, and date so the canvas becomes the financial timeline of the project.

### 6. Alerts to PM + Admin (billing follow-up)

New alert type `billing_due`:
- Created by the DB trigger when the linked timeline milestone is reached.
- `escalate_to_admin = true` (Admin sees it in CEO inbox)
- Inserted **also** for the PM by inserting a duplicate row with `created_by = pm_id` so PM's existing inbox query (`created_by = auth.uid()`) picks it up — same pattern already used by `usePMDashboard`.
- Labels added in `src/hooks/useTaskAlerts.ts`:
  - `billing_due`: "Billing Due" — emerald color, `Receipt` icon.
- Auto-resolved when Admin clicks **"Confirm invoice sent"**.

The `useFinancialAlerts` hook already aggregates Overdue + Extra-Canone — extend it to also count `billing_due` open alerts under a new "Awaiting invoice" bucket so both Overview widgets (CeoDashboard, PMPortal) show the new category.

### 7. Files modified / created

| File | Change |
|---|---|
| **Migration** | New columns on `cert_payment_milestones`, new enum value `billing_due`, trigger `trg_payment_status_from_timeline`, helper function `apply_payment_scheme` |
| `src/lib/paymentSchemes.ts` | **NEW** — scheme registry + `generateTranches` |
| `src/components/projects/NewQuotationWizard.tsx` | Add scheme picker + custom-SAL editor in Step 2; insert tranches on save |
| `src/pages/ProjectCreateWizard.tsx` | Same scheme picker in Step 3 (per-cert) |
| `src/components/projects/ProjectPayments.tsx` | Rewrite against `cert_payment_milestones`; Admin-only action buttons; bars; status flow Pending→Due→Invoiced→Paid |
| `src/hooks/usePaymentMilestones.ts` | Repoint queries from `payment_milestones` to `cert_payment_milestones`; add `confirmInvoiceSent` / `confirmPaymentReceived` mutations that also write canvas entries |
| `src/components/projects/ProjectCanvas.tsx` | Add `payment_invoice_sent` and `payment_received` entry-type configs |
| `src/hooks/useTaskAlerts.ts` | Add `billing_due` to enum + label + color |
| `src/hooks/useFinancialAlerts.ts` | Add "awaiting invoice" bucket (open `billing_due` alerts) |
| `src/pages/CeoDashboard.tsx` / `src/pages/PMPortal.tsx` | Surface the new bucket in the Financial Alerts widget |

### Notes
- All mutations role-gated client-side **and** by RLS: only Admins can update `invoice_sent_date` / `payment_received_date` (existing `Admin full access` policy on `cert_payment_milestones` already covers this; PM policy stays read-only on these new columns through column-level UPDATE check via trigger).
- The deprecated `payment_milestones` table stays untouched for backward compatibility with `MyTasks.tsx` blocking-payment lookups.
- No automatic date changes anywhere — Admin confirmations only.

