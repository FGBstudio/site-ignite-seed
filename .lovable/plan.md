

## Fix "Financial Alerts" Widget — Bind to Real Financial Data + Click-Through Detail

### Problem identified

1. **PMPortal "Financial Issues" widget** currently filters projects whose `missing` array contains `"Hardware"` — that's a **setup gap**, not a financial alert. It is NOT linked to the real financial-alerts pipeline (overdue payment milestones, Extra-Canone handover delays).
2. **CeoDashboard "Financial Issues" widget** correctly uses `computeOverduePayments()` from `cert_payment_milestones`, but the card is not clickable and has no detail drill-down (unlike the "Alerts / Tasks" card which navigates to `/admin-tasks`).

### Goal

Make both Overview widgets (Admin & PM) reflect **real financial alerts** and behave like the "Alerts / Tasks" card: show summary + per-category indicators, click → land on the detailed view where the issues live.

### Definition of "Financial Alert"

A unified financial-issue model combining two existing data sources:

| Source | Meaning | Severity |
|---|---|---|
| `cert_payment_milestones` where `status = 'Overdue'` | Unpaid invoice past due date | High (€) |
| `task_alerts` where `alert_type = 'extra_canone'` and `is_resolved = false` | Handover postponed → contractual extra-fee impact | High |

### Implementation

#### 1. New shared helper hook — `src/hooks/useFinancialAlerts.ts`

Aggregates the two sources into one indicator set:
```ts
{
  totalCount,                   // overdue payments + open extra_canone
  overduePayments: { count, totalAmount, projects: [{certId, name, daysOverdue, amount}] },
  extraCanone:     { count, projects: [{certId, name, title, createdAt}] },
  byProject: Map<certId, { name, paymentDelay, paymentAmount, extraCanone }>
}
```
- For ADMIN: query both tables globally.
- For PM: filter both by certifications where `pm_id = auth.uid()`.

Reuses existing `computeOverduePayments` logic from `useCeoDashboardData.ts` and reuses `useTaskAlerts` filtering on `extra_canone`.

#### 2. Refactor PMPortal widget — `src/pages/PMPortal.tsx`

Replace the broken "Hardware-missing" data source with `useFinancialAlerts()`. Restyle the card to match the "Alerts / Tasks" pattern:

```text
┌──────────────────────────────┐
│ Financial Alerts        →    │  (clickable, hover shadow)
│         3                    │
│ open financial issues        │
│ [Overdue: 2] [Extra-Canone:1]│
└──────────────────────────────┘
```
On click → `navigate("/projects?filter=financial")` (PM) — opens My Projects with a financial filter applied (highlights only projects flagged in `byProject`).

For PM specifically, also link the card to a new query-string `?tab=payments` on the project detail when only one project is impacted; otherwise list view.

#### 3. Refactor CeoDashboard widget — `src/pages/CeoDashboard.tsx`

- Make the existing "Financial Issues" card clickable: `onClick={() => setActiveTab("payments")}` (the `Payments` tab in the same dashboard already shows the detailed overdue list with bars).
- Add per-category badges below the bar chart (Overdue count, Extra-Canone count) — same visual pattern as `Alerts / Tasks` card.
- Rename title `Financial Issues` → `Financial Alerts` for consistency with the user's wording.

#### 4. Highlight in detail view

- **CeoDashboard `payments` tab** (already shows project-by-project overdue bars) — no changes needed, lands here directly from the click.
- **PM Projects board** (`PMProjectsBoard.tsx`): support `?filter=financial` query param → only show cards flagged in `useFinancialAlerts().byProject`. Add a small `Financial alert` badge on those cards (same style as existing `Critical deadline` badge).

### Files Modified

| File | Change |
|---|---|
| `src/hooks/useFinancialAlerts.ts` | **NEW** — aggregates overdue payments + extra_canone alerts, role-scoped |
| `src/pages/PMPortal.tsx` | Replace `financialData` (Hardware) with `useFinancialAlerts`; restyle widget like "Alerts/Tasks" with count + category badges; make clickable → `/projects?filter=financial` |
| `src/pages/CeoDashboard.tsx` | Make Financial card clickable → switch to `payments` tab; add category badges; rename to "Financial Alerts" |
| `src/components/projects/PMProjectsBoard.tsx` | Read `?filter=financial`; filter list and add `Financial alert` badge to flagged cards |

No DB migration. No type changes (uses existing `cert_payment_milestones` and `extra_canone` alert type already in place).

