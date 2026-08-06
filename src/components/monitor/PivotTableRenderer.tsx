// Layer 4 – Passive pivot renderer. Horizon bands carry their own hardware
// breakdown, so the quarter numbers are readable without expanding anything.
import { Fragment, useState } from "react";
import { Plus, Minus, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import type { PivotDate, PivotDomain, PivotTotals, PivotBucket } from "@/lib/monitorPivot";
import { BUCKET_LABEL, TYPOLOGY_LABEL, typologyFromProductName } from "@/lib/monitorPivot";
import { flattenPivot, grandTotals, exportPivotExcel, exportPivotPdf } from "@/lib/monitorExport";
import { useToast } from "@/hooks/use-toast";

interface Props {
  tree: PivotDate[];
  domain?: PivotDomain;
  valueHeader?: string;
  /** Active filters, summarised for the export header. Empty when unfiltered. */
  filterSummary?: string;
}

/** Only the numeric totals are renderable as a column — `byProduct` is a map. */
type NumericTotalKey = {
  [K in keyof PivotTotals]: PivotTotals[K] extends number ? K : never;
}[keyof PivotTotals];

interface NumCol {
  key: NumericTotalKey;
  label: string;
  head: string;   // header colour
  cell: string;   // body colour
  /** Top-level group this column sits under, when the header is two rows deep. */
  group?: string;
  /** Distinguishes the two halves of a group in the second header row. */
  sub?: "assigned" | "toProduce";
}

interface ColFamily {
  group: string;
  assigned: NumericTotalKey;
  toProduce: NumericTotalKey;
  head: string;
  cell: string;
}

/** Splits a family into its assigned / to-produce pair of columns. */
function familyCols(families: ColFamily[]): NumCol[] {
  return families.flatMap((f) => [
    { key: f.assigned, label: `${f.group} assigned`, head: f.head, cell: f.cell, group: f.group, sub: "assigned" as const },
    { key: f.toProduce, label: `${f.group} to produce`, head: f.head, cell: "text-orange-600", group: f.group, sub: "toProduce" as const },
  ]);
}

const ENERGY_FAMILIES: ColFamily[] = [
  { group: "Bridges", assigned: "bridges", toProduce: "bridgesToProduce", head: "text-blue-600", cell: "text-blue-600" },
  { group: "Pan-10", assigned: "pan10", toProduce: "pan10ToProduce", head: "text-emerald-600", cell: "text-emerald-600" },
  { group: "Pan-12", assigned: "pan12", toProduce: "pan12ToProduce", head: "text-indigo-600", cell: "text-indigo-600" },
  { group: "Pan-14", assigned: "pan14", toProduce: "pan14ToProduce", head: "text-purple-600", cell: "text-purple-600" },
  // Requested units the allocation did not attribute to a bucket — Mango,
  // Greeny, or a generic placeholder. They have no column of their own but must
  // stay in the breakdown, or the columns stop adding up to the total.
  { group: "Other", assigned: "unassigned", toProduce: "unassignedToProduce", head: "text-slate-500", cell: "text-slate-500" },
];

const ENERGY_COLS: NumCol[] = familyCols(ENERGY_FAMILIES);

// Every typology splits in two: what already exists and what still has to be
// built. A device only has an id once it has been produced, so an assignment is
// proof of production and the remainder of the request is the production order.
//
// CO-CO2 is a distinct sensor, not a CO2 finish, so it keeps its own group. The
// "black" variants stay inside their family and are broken out per SKU in the
// expanded project row.
const AIR_FAMILIES: ColFamily[] = [
  { group: "LEED", assigned: "leed", toProduce: "leedToProduce", head: "text-blue-600", cell: "text-blue-600" },
  { group: "WELL", assigned: "well", toProduce: "wellToProduce", head: "text-amber-600", cell: "text-amber-600" },
  { group: "CO2", assigned: "co2", toProduce: "co2ToProduce", head: "text-emerald-600", cell: "text-emerald-600" },
  { group: "CO-CO2", assigned: "coco2", toProduce: "coco2ToProduce", head: "text-teal-600", cell: "text-teal-600" },
  { group: "Unassigned", assigned: "unassigned", toProduce: "unassignedToProduce", head: "text-slate-500", cell: "text-slate-500" },
];

const AIR_COLS: NumCol[] = familyCols(AIR_FAMILIES);

function skuEntries(byProduct: Record<string, number> | undefined): Array<[string, number]> {
  return Object.entries(byProduct ?? {})
    .filter(([, qty]) => qty > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/**
 * SKUs worth calling out next to the project name. A family column says "CO2",
 * which does not tell production whether to build "CO2 ClAir" or "CO2 ClAir
 * black" — a different SKU. Anything that is not the family's base
 * "<FAMILY> ClAir" product is surfaced explicitly.
 *
 * This is a display heuristic over the catalogue's naming, not a data rule: the
 * exact per-SKU quantities live in `byProduct` and the full breakdown is always
 * in the tooltip, so the worst case here is one extra chip.
 */
function variantSkus(byProduct: Record<string, number> | undefined): Array<[string, number]> {
  return skuEntries(byProduct).filter(([name]) => {
    const family = typologyFromProductName(name);
    if (!family) return false;
    return name.trim().toLowerCase() !== `${TYPOLOGY_LABEL[family].toLowerCase()} clair`;
  });
}

function skuTooltip(byProduct: Record<string, number> | undefined): string | undefined {
  const entries = skuEntries(byProduct);
  if (entries.length === 0) return undefined;
  return entries.map(([name, qty]) => `${qty}× ${name}`).join("\n");
}

/** Bands that are informational rather than committed production demand. */
const SOFT_BUCKETS: PivotBucket[] = ["past", "tbd"];

function bandTone(bucket: PivotBucket): string {
  switch (bucket) {
    case "past": return "bg-destructive/5 text-destructive";
    case "current": return "bg-amber-500/10 text-amber-700 dark:text-amber-400";
    case "next": return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
    case "long": return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
    case "tbd": return "bg-muted text-muted-foreground";
  }
}

function statusBadge(rawSt: string): { style: string; label: string } {
  const st = rawSt.toLowerCase();
  if (st.includes("in_corso") || st.includes("in_progress"))
    return { style: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300", label: "In Progress" };
  if (st.includes("da_configurare"))
    return { style: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300", label: "To Configure" };
  if (st.includes("quotation_approved"))
    return { style: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300", label: "Quotation Approved" };
  if (st.includes("quotation"))
    return { style: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300", label: "Quotation" };
  if (st.includes("potential"))
    return { style: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300", label: "Potential" };
  if (st.includes("installed"))
    return { style: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300", label: "Installed" };
  // Shipment statuses arrive already canonicalised by monitorPivot, so matching
  // on the plain word is enough — no counts are embedded in the label any more.
  if (st.includes("delivered"))
    return { style: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300", label: "Delivered" };
  if (st.includes("transit"))
    return { style: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300", label: "In Transit" };
  if (st.includes("assigned"))
    return { style: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300", label: "Assigned" };
  if (st.includes("requested"))
    return { style: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300", label: "Requested" };
  if (st.includes("certificato") || st.includes("completato"))
    return { style: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300", label: "Certificato" };
  return { style: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300", label: rawSt || "Upcoming" };
}

export function PivotTableRenderer({ tree, domain = "energy", valueHeader, filterSummary = "" }: Props) {
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());
  const [collapsedRegions, setCollapsedRegions] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);
  const { toast } = useToast();

  if (tree.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        No data matches the current filters.
      </div>
    );
  }

  const breakdown = domain === "energy" ? ENERGY_COLS : domain === "air" ? AIR_COLS : [];
  const totalLabel =
    domain === "energy" ? "Total Units" : domain === "air" ? "Total Monitors" : valueHeader || "Sum of n°";
  const cols: NumCol[] = [
    ...breakdown,
    { key: "value", label: totalLabel, head: "text-foreground", cell: "font-semibold" },
  ];
  // name + numeric columns + handover + notes
  const colCount = cols.length + 3;

  // Header groups: a family spans its two halves, everything else stands alone.
  const headerGroups: Array<{ label: string; head: string; span: number }> = [];
  for (const c of cols) {
    const last = headerGroups[headerGroups.length - 1];
    if (c.group && last && last.label === c.group) last.span += 1;
    else headerGroups.push({ label: c.group ?? c.label, head: c.head, span: 1 });
  }
  const hasSubHeader = cols.some((c) => c.sub);

  const toggleDate = (dateKey: string) => {
    setCollapsedDates((prev) => {
      const next = new Set(prev);
      if (next.has(dateKey)) next.delete(dateKey);
      else next.add(dateKey);
      return next;
    });
  };

  const toggleRegion = (regKey: string) => {
    setCollapsedRegions((prev) => {
      const next = new Set(prev);
      if (next.has(regKey)) next.delete(regKey);
      else next.add(regKey);
      return next;
    });
  };

  const toggleAll = (collapse: boolean) => {
    if (collapse) {
      setCollapsedDates(new Set(tree.map((d) => d.dateKey)));
      setCollapsedRegions(new Set(tree.flatMap((d) => d.regions.map((r) => `${d.dateKey}::${r.region}`))));
    } else {
      setCollapsedDates(new Set());
      setCollapsedRegions(new Set());
    }
  };

  const grand = cols.map((c) => tree.reduce((s, d) => s + (d[c.key] ?? 0), 0));

  // Exports mirror the screen: same columns, same filters, same rows expanded.
  const runExport = async (format: "excel" | "pdf") => {
    setExporting(format);
    try {
      const rows = flattenPivot(tree, cols, collapsedDates, collapsedRegions);
      const meta = {
        domain: domain.charAt(0).toUpperCase() + domain.slice(1),
        filterSummary,
        generatedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
      };
      const args = [rows, cols, grandTotals(tree, cols), meta] as const;
      if (format === "excel") await exportPivotExcel(...args);
      else await exportPivotPdf(...args);
    } catch (e) {
      // The libraries are loaded on demand, so a failure here is worth surfacing
      // rather than leaving the button spinning with nothing downloaded.
      console.error("Monitor report export failed:", e);
      toast({
        title: "Export failed",
        description: e instanceof Error ? e.message : "Could not generate the file.",
        variant: "destructive",
      });
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-end gap-2 text-xs">
        <button
          onClick={() => runExport("excel")}
          disabled={exporting !== null}
          title="Download the table exactly as shown: same filters, same expanded rows"
          className="text-muted-foreground hover:text-foreground font-semibold flex items-center gap-1 px-2 py-1 rounded bg-slate-100 dark:bg-slate-900 disabled:opacity-50"
        >
          {exporting === "excel" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileSpreadsheet className="h-3 w-3" />} Excel
        </button>
        <button
          onClick={() => runExport("pdf")}
          disabled={exporting !== null}
          title="Download the table exactly as shown: same filters, same expanded rows"
          className="text-muted-foreground hover:text-foreground font-semibold flex items-center gap-1 px-2 py-1 rounded bg-slate-100 dark:bg-slate-900 disabled:opacity-50"
        >
          {exporting === "pdf" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />} PDF
        </button>
        <span className="w-px bg-border/70 my-0.5" aria-hidden />
        <button
          onClick={() => toggleAll(false)}
          className="text-muted-foreground hover:text-foreground font-semibold flex items-center gap-1 px-2 py-1 rounded bg-slate-100 dark:bg-slate-900"
        >
          <Plus className="h-3 w-3" /> Expand All
        </button>
        <button
          onClick={() => toggleAll(true)}
          className="text-muted-foreground hover:text-foreground font-semibold flex items-center gap-1 px-2 py-1 rounded bg-slate-100 dark:bg-slate-900"
        >
          <Minus className="h-3 w-3" /> Collapse All
        </button>
      </div>

      {/*
        The header is `sticky top-0`, but sticky resolves against the nearest
        ancestor with a non-visible overflow — this container. Without a height
        cap that container never scrolls: the page does, and header and table
        leave the screen together. Capping the height makes the table itself the
        scrolling element, which is what makes the header actually stay put.
      */}
      <div className="overflow-auto border border-border/60 rounded-xl max-h-[70vh]">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead className="sticky top-0 z-20 bg-muted/95 backdrop-blur-md shadow-[0_1px_0_0_hsl(var(--border))]">
            <tr>
              <th rowSpan={hasSubHeader ? 2 : 1} className="text-left px-3.5 py-2.5 border-b border-border font-bold align-bottom">
                Level / Name
              </th>
              {headerGroups.map((g, i) => (
                <th
                  key={`${g.label}-${i}`}
                  colSpan={g.span}
                  rowSpan={hasSubHeader && g.span === 1 ? 2 : 1}
                  className={`px-3.5 py-2.5 border-b border-border font-bold ${g.head} ${
                    g.span > 1 ? "text-center border-l border-border/50" : "text-right align-bottom"
                  }`}
                >
                  {g.label}
                </th>
              ))}
              <th rowSpan={hasSubHeader ? 2 : 1} className="text-left px-3.5 py-2.5 border-b border-border font-bold align-bottom">
                Handover
              </th>
              <th rowSpan={hasSubHeader ? 2 : 1} className="text-left px-3.5 py-2.5 border-b border-border font-bold align-bottom">
                Notes
              </th>
            </tr>
            {hasSubHeader && (
              <tr>
                {cols.filter((c) => c.sub).map((c) => (
                  <th
                    key={c.key}
                    title={
                      c.sub === "assigned"
                        ? "Units that already exist: a device gets an id only once it has been produced"
                        : "Requested but never assigned an id — still to be produced"
                    }
                    className={`text-right px-3.5 py-1.5 border-b border-border text-[10px] font-bold uppercase tracking-wide ${
                      c.sub === "assigned" ? "text-muted-foreground" : "text-orange-600"
                    } ${c.sub === "assigned" ? "border-l border-border/50" : ""}`}
                  >
                    {c.sub === "assigned" ? "assigned" : "to produce"}
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {tree.map((d, di) => {
              const isDateCollapsed = collapsedDates.has(d.dateKey);
              const showBucketHeader = di === 0 || tree[di - 1].bucket !== d.bucket;
              // Band totals span every period node of the same horizon.
              const bandTotals = showBucketHeader
                ? tree.filter((p) => p.bucket === d.bucket)
                : [];

              return (
                <Fragment key={d.dateKey}>
                  {showBucketHeader && (
                    <tr className={bandTone(d.bucket)}>
                      <td className="px-3.5 py-2 border-b border-border text-[10px] font-extrabold uppercase tracking-wider">
                        {BUCKET_LABEL[d.bucket]}
                      </td>
                      {cols.map((c) => {
                        const v = bandTotals.reduce((s, p) => s + (p[c.key] ?? 0), 0);
                        return (
                          <td
                            key={c.key}
                            className="px-3.5 py-2 text-right border-b border-border tabular-nums text-xs font-extrabold"
                          >
                            {v ? v.toLocaleString("en-US") : "—"}
                          </td>
                        );
                      })}
                      <td className="border-b border-border" colSpan={2} />
                    </tr>
                  )}

                  {/* Period row (Level 1) — day, month or 6-month block */}
                  <tr
                    onClick={() => toggleDate(d.dateKey)}
                    className="bg-slate-100/90 dark:bg-slate-900/90 hover:bg-slate-200/80 cursor-pointer transition-colors font-bold"
                  >
                    <td className="px-3.5 py-2 border-b border-border flex items-center gap-2">
                      <span className="h-4 w-4 flex items-center justify-center rounded bg-slate-200 dark:bg-slate-800 text-[10px] shrink-0 font-mono">
                        {isDateCollapsed ? "+" : "−"}
                      </span>
                      <span>{d.dateLabel}</span>
                      {d.granularity === "month" && (
                        <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">
                          grouped by month
                        </span>
                      )}
                    </td>
                    {cols.map((c) => (
                      <td
                        key={c.key}
                        className={`px-3.5 py-2 text-right border-b border-border tabular-nums font-bold ${c.key === "value" ? "font-extrabold" : c.cell}`}
                      >
                        {c.key === "value" ? d.value.toLocaleString("en-US") : (d[c.key] || "—")}
                      </td>
                    ))}
                    <td className="border-b border-border" colSpan={2} />
                  </tr>

                  {/* Region rows (Level 2) */}
                  {!isDateCollapsed &&
                    d.regions.map((r) => {
                      const regKey = `${d.dateKey}::${r.region}`;
                      const isRegCollapsed = collapsedRegions.has(regKey);
                      return (
                        <Fragment key={regKey}>
                          <tr
                            onClick={() => toggleRegion(regKey)}
                            className="bg-muted/40 hover:bg-muted/60 cursor-pointer transition-colors font-semibold"
                          >
                            <td className="px-3.5 py-1.5 pl-8 border-b border-border/60 flex items-center gap-2">
                              <span className="h-3.5 w-3.5 flex items-center justify-center rounded bg-slate-200 dark:bg-slate-800 text-[9px] shrink-0 font-mono">
                                {isRegCollapsed ? "+" : "−"}
                              </span>
                              <span className="text-foreground/90">{r.region}</span>
                            </td>
                            {cols.map((c) => (
                              <td
                                key={c.key}
                                className={`px-3.5 py-1.5 text-right border-b border-border/60 tabular-nums ${c.key === "value" ? "font-bold" : `${c.cell}/90`}`}
                              >
                                {c.key === "value" ? r.value.toLocaleString("en-US") : (r[c.key] || "—")}
                              </td>
                            ))}
                            <td className="border-b border-border/60" colSpan={2} />
                          </tr>

                          {/* Project rows (Level 3) */}
                          {!isRegCollapsed &&
                            r.projects.map((p) => {
                              const badge = statusBadge(p.status || "");
                              const rowBgStyle = p.isEstimated
                                ? "bg-purple-100/70 dark:bg-purple-950/50 hover:bg-purple-200/70 text-purple-950 dark:text-purple-100"
                                : "hover:bg-muted/30 text-foreground/80";

                              return (
                                <tr key={`${regKey}::${p.projectName}`} className={`text-xs transition-colors ${rowBgStyle}`}>
                                  <td className="px-3.5 py-1.5 pl-14 border-b border-border/40 font-medium flex items-center justify-between gap-2">
                                    <span className="flex items-center gap-1.5 flex-wrap">
                                      <span title={skuTooltip(p.byProduct)}>{p.projectName}</span>
                                      {variantSkus(p.byProduct).map(([name, qty]) => (
                                        <span
                                          key={name}
                                          title={`${qty}× ${name} — distinct production SKU`}
                                          className="text-[9px] font-bold px-1.5 py-0.5 rounded border border-border bg-background text-muted-foreground uppercase tracking-tight shrink-0"
                                        >
                                          {qty}× {name}
                                        </span>
                                      ))}
                                      {p.isEstimated && (
                                        <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded border border-purple-400 bg-purple-200 text-purple-900 dark:bg-purple-800 dark:text-purple-100 dark:border-purple-600 uppercase tracking-tight shrink-0">
                                          ESTIMATED
                                        </span>
                                      )}
                                      {/*
                                        A "REQUESTED" chip used to sit here for rows with
                                        nothing assigned. It said the same thing twice: the
                                        status badge on the right already reads "Requested"
                                        now that statuses are canonicalised, and the
                                        "to produce" columns state it as a number.
                                      */}
                                      {p.typologySource === "none" && (p.unassigned ?? 0) > 0 && (
                                        <span
                                          title="No monitor typology assigned: neither Monitoring nor the original request names a product"
                                          className="text-[9px] font-extrabold px-1.5 py-0.5 rounded border border-slate-300 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 uppercase tracking-tight shrink-0"
                                        >
                                          NO TYPOLOGY
                                        </span>
                                      )}
                                    </span>
                                    {p.status && (
                                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-tight shrink-0 ${badge.style}`}>
                                        {badge.label}
                                      </span>
                                    )}
                                  </td>
                                  {cols.map((c) => (
                                    <td
                                      key={c.key}
                                      className={`px-3.5 py-1.5 text-right border-b border-border/40 tabular-nums ${c.key === "value" ? "font-semibold" : c.key === "unassigned" ? "text-slate-500" : ""}`}
                                    >
                                      {c.key === "value" ? p.value.toLocaleString("en-US") : (p[c.key] || "—")}
                                    </td>
                                  ))}
                                  <td className="px-3.5 py-1.5 text-[11px] text-muted-foreground border-b border-border/40 whitespace-nowrap">
                                    {p.dates.length ? p.dates.join(", ") : "TBD"}
                                    {p.hasFallbackDate && (
                                      <span
                                        title="Date not confirmed by Operations: derived from shipment/installation"
                                        className="ml-1 text-amber-600 font-bold"
                                      >
                                        ~
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3.5 py-1.5 text-xs text-muted-foreground border-b border-border/40">
                                    {p.notes.length ? p.notes.join(" • ") : ""}
                                  </td>
                                </tr>
                              );
                            })}
                        </Fragment>
                      );
                    })}
                </Fragment>
              );
            })}

            {/* Grand total */}
            <tr className="bg-primary/10 font-black">
              <td className="px-3.5 py-2.5 text-foreground">Grand Total</td>
              {cols.map((c, i) => (
                <td key={c.key} className="px-3.5 py-2.5 text-right tabular-nums text-foreground">
                  {grand[i].toLocaleString("en-US")}
                </td>
              ))}
              <td colSpan={2} />
            </tr>
            {SOFT_BUCKETS.some((b) => tree.some((p) => p.bucket === b)) && (
              <tr>
                <td colSpan={colCount} className="px-3.5 py-2 text-[10px] text-muted-foreground italic">
                  Grand Total includes overdue and undated rows. Use the header flags to exclude them
                  from the planning figures.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
