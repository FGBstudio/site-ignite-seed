
# Restore Reports layout + realign PortfolioFollowUp to Status Breakdown

## 1. Restore original Reports page

In `src/components/projects/ProjectsReports.tsx`, put back the header blocks removed in the previous pass, **above** the new `<PortfolioFollowUp />` and the existing drilldown cards:

- **KPI tiles row** (6 tiles, `KpiTile`): Total Active, In Progress, Late, On Hold, Critical (<15D), Certified — same tones as before (`primary` / `destructive` / `warning` / `success`).
- **Status Breakdown card**: existing `Donut` with the six segments (Late, On Hold, In Progress, To Configure, Quotation, Certified).
- **Macro Phase Distribution card**: horizontal bars for Design / Construction / Certification / Certified / Other, using `macroMax` for scaling.

Final page order:

```text
[ KPI tiles row ]
[ Status Breakdown ]   [ Macro Phase Distribution ]
[ PortfolioFollowUp — FGB Follow Up table ]
[ Late Projects ]
[ On Hold — Reasons ]
[ Critical Deadlines ]
```

No behavior change to any card besides adding the table in the middle.

## 2. Align `PortfolioFollowUp` legend to Status Breakdown

Rework the legend inside `src/components/projects/PortfolioFollowUp.tsx` so it mirrors the six statuses shown in the Status Breakdown donut, using the same design tokens (`hsl(var(--success))` for Certified — the FGB green already used in the donut, `hsl(var(--destructive))` for Late, `hsl(var(--warning))` for To Configure, `hsl(var(--primary))` for In Progress, `hsl(var(--muted-foreground))` for On Hold, `hsl(var(--accent-foreground))` for Quotation).

Update the per-row traffic-light function to return one of those six statuses (same rules as `ProjectsReports` counts, so the KPIs and the table stay consistent):

```text
issued_date != null || setup_status == "certificato" → Certified
lateByCert.has(id)                                    → Late
on_hold                                               → On Hold
setup_status == "quotation"                           → Quotation
setup_status == "da_configurare"                      → To Configure
otherwise                                             → In Progress
```

The tracker keeps only the meaningful counters (Ongoing, Completed, Total) but they now compute from these statuses.

## 3. Highlight Certified rows in FGB green

- Certified rows: `bg-[hsl(var(--success)/0.12)] hover:bg-[hsl(var(--success)/0.18)]` with a leading `CheckCircle2` in `text-success` so they stand out clearly with the FGB green tone that's already the brand color for `--success` in `index.css`.
- Late rows keep the soft rose tint.
- All other statuses render a colored dot only, no row tint (matches Excel).

## Technical notes

- Files edited: `src/components/projects/ProjectsReports.tsx` (re-add tiles + donut + macro card, keep table + drilldown cards), `src/components/projects/PortfolioFollowUp.tsx` (legend, `computeLight`, row styling).
- `lateByCert` is already available in `ProjectsReports`; expose the same lookup inside `PortfolioFollowUp` via the shared `useLateCertMilestones` hook (already wired).
- No DB, RLS, or hook signature changes.
