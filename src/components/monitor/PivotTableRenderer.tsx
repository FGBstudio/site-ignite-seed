// Layer 4 – Passive pivot renderer. Multi-column hardware breakdowns and expandable (+ / -) rows.
import { Fragment, useState } from "react";
import { ChevronRight, ChevronDown, Plus, Minus } from "lucide-react";
import type { PivotDate, PivotDomain } from "@/lib/monitorPivot";
import { BUCKET_LABEL } from "@/lib/monitorPivot";

interface Props {
  tree: PivotDate[];
  domain?: PivotDomain;
  valueHeader?: string;
}

export function PivotTableRenderer({ tree, domain = "energy", valueHeader }: Props) {
  // Set to track collapsed date & region nodes
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());
  const [collapsedRegions, setCollapsedRegions] = useState<Set<string>>(new Set());

  if (tree.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        No data matches the current filters.
      </div>
    );
  }

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
      const regKeys = tree.flatMap((d) => d.regions.map((r) => `${d.dateKey}::${r.region}`));
      setCollapsedRegions(new Set(regKeys));
    } else {
      setCollapsedDates(new Set());
      setCollapsedRegions(new Set());
    }
  };

  const grandTotal = tree.reduce((s, d) => s + d.value, 0);
  const grandBridges = tree.reduce((s, d) => s + d.bridges, 0);
  const grandPan10 = tree.reduce((s, d) => s + d.pan10, 0);
  const grandPan12 = tree.reduce((s, d) => s + d.pan12, 0);
  const grandPan14 = tree.reduce((s, d) => s + d.pan14, 0);
  const grandLeed = tree.reduce((s, d) => s + d.leed, 0);
  const grandWell = tree.reduce((s, d) => s + d.well, 0);
  const grandCo2 = tree.reduce((s, d) => s + d.co2, 0);
  const grandUnassigned = tree.reduce((s, d) => s + (d.unassigned ?? 0), 0);

  return (
    <div className="space-y-2">
      <div className="flex justify-end gap-2 text-xs">
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

      <div className="overflow-x-auto border border-border/60 rounded-xl">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-md">
            <tr>
              <th className="text-left px-3.5 py-2.5 border-b border-border font-bold">Level / Name</th>
              {domain === "energy" ? (
                <>
                  <th className="text-right px-3.5 py-2.5 border-b border-border font-bold text-blue-600">Bridges</th>
                  <th className="text-right px-3.5 py-2.5 border-b border-border font-bold text-emerald-600">Pan-10</th>
                  <th className="text-right px-3.5 py-2.5 border-b border-border font-bold text-indigo-600">Pan-12</th>
                  <th className="text-right px-3.5 py-2.5 border-b border-border font-bold text-purple-600">Pan-14</th>
                  <th className="text-right px-3.5 py-2.5 border-b border-border font-bold text-foreground">Total Units</th>
                </>
              ) : domain === "air" ? (
                <>
                  <th className="text-right px-3.5 py-2.5 border-b border-border font-bold text-blue-600">LEED</th>
                  <th className="text-right px-3.5 py-2.5 border-b border-border font-bold text-amber-600">WELL</th>
                  <th className="text-right px-3.5 py-2.5 border-b border-border font-bold text-emerald-600">CO2</th>
                  <th className="text-right px-3.5 py-2.5 border-b border-border font-bold text-slate-500">Unassigned</th>
                  <th className="text-right px-3.5 py-2.5 border-b border-border font-bold text-foreground">Total Monitors</th>
                </>
              ) : (
                <th className="text-right px-3.5 py-2.5 border-b border-border font-bold">{valueHeader || "Sum of n°"}</th>
              )}
              <th className="text-left px-3.5 py-2.5 border-b border-border font-bold">Notes</th>
            </tr>
          </thead>
          <tbody>
            {tree.map((d, di) => {
              const isDateCollapsed = collapsedDates.has(d.dateKey);
              const showBucketHeader = di === 0 || tree[di - 1].bucket !== d.bucket;
              return (
                <Fragment key={d.dateKey}>
                  {showBucketHeader && (
                    <tr className="bg-primary/5">
                      <td
                        colSpan={domain === "energy" ? 7 : domain === "air" ? 7 : 3}
                        className="px-3.5 py-1.5 border-b border-border text-[10px] font-extrabold uppercase tracking-wider text-primary"
                      >
                        {BUCKET_LABEL[d.bucket]}
                      </td>
                    </tr>
                  )}
                  {/* Date Header Row (Level 1) */}
                  <tr
                    onClick={() => toggleDate(d.dateKey)}
                    className="bg-slate-100/90 dark:bg-slate-900/90 hover:bg-slate-200/80 cursor-pointer transition-colors font-bold"
                  >
                    <td className="px-3.5 py-2 border-b border-border flex items-center gap-2">
                      <span className="h-4 w-4 flex items-center justify-center rounded bg-slate-200 dark:bg-slate-800 text-[10px] shrink-0 font-mono">
                        {isDateCollapsed ? "+" : "−"}
                      </span>
                      <span>{d.dateLabel}</span>
                    </td>

                    {domain === "energy" ? (
                      <>
                        <td className="px-3.5 py-2 text-right border-b border-border tabular-nums font-bold text-blue-600">{d.bridges || "—"}</td>
                        <td className="px-3.5 py-2 text-right border-b border-border tabular-nums font-bold text-emerald-600">{d.pan10 || "—"}</td>
                        <td className="px-3.5 py-2 text-right border-b border-border tabular-nums font-bold text-indigo-600">{d.pan12 || "—"}</td>
                        <td className="px-3.5 py-2 text-right border-b border-border tabular-nums font-bold text-purple-600">{d.pan14 || "—"}</td>
                        <td className="px-3.5 py-2 text-right border-b border-border tabular-nums font-extrabold">{d.value.toLocaleString("en-US")}</td>
                      </>
                    ) : domain === "air" ? (
                      <>
                        <td className="px-3.5 py-2 text-right border-b border-border tabular-nums font-bold text-blue-600">{d.leed || "—"}</td>
                        <td className="px-3.5 py-2 text-right border-b border-border tabular-nums font-bold text-amber-600">{d.well || "—"}</td>
                        <td className="px-3.5 py-2 text-right border-b border-border tabular-nums font-bold text-emerald-600">{d.co2 || "—"}</td>
                        <td className="px-3.5 py-2 text-right border-b border-border tabular-nums font-bold text-slate-500">{d.unassigned || "—"}</td>
                        <td className="px-3.5 py-2 text-right border-b border-border tabular-nums font-extrabold">{d.value.toLocaleString("en-US")}</td>
                      </>
                    ) : (
                      <td className="px-3.5 py-2 text-right border-b border-border tabular-nums font-extrabold">{d.value.toLocaleString("en-US")}</td>
                    )}
                    <td className="border-b border-border" />
                  </tr>

                  {/* Region Rows (Level 2) */}
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

                            {domain === "energy" ? (
                              <>
                                <td className="px-3.5 py-1.5 text-right border-b border-border/60 tabular-nums text-blue-600/90">{r.bridges || "—"}</td>
                                <td className="px-3.5 py-1.5 text-right border-b border-border/60 tabular-nums text-emerald-600/90">{r.pan10 || "—"}</td>
                                <td className="px-3.5 py-1.5 text-right border-b border-border/60 tabular-nums text-indigo-600/90">{r.pan12 || "—"}</td>
                                <td className="px-3.5 py-1.5 text-right border-b border-border/60 tabular-nums text-purple-600/90">{r.pan14 || "—"}</td>
                                <td className="px-3.5 py-1.5 text-right border-b border-border/60 tabular-nums font-bold">{r.value.toLocaleString("en-US")}</td>
                              </>
                            ) : domain === "air" ? (
                              <>
                                <td className="px-3.5 py-1.5 text-right border-b border-border/60 tabular-nums text-blue-600/90">{r.leed || "—"}</td>
                                <td className="px-3.5 py-1.5 text-right border-b border-border/60 tabular-nums text-amber-600/90">{r.well || "—"}</td>
                                <td className="px-3.5 py-1.5 text-right border-b border-border/60 tabular-nums text-emerald-600/90">{r.co2 || "—"}</td>
                                <td className="px-3.5 py-1.5 text-right border-b border-border/60 tabular-nums text-slate-500">{r.unassigned || "—"}</td>
                                <td className="px-3.5 py-1.5 text-right border-b border-border/60 tabular-nums font-bold">{r.value.toLocaleString("en-US")}</td>
                              </>
                            ) : (
                              <td className="px-3.5 py-1.5 text-right border-b border-border/60 tabular-nums font-bold">{r.value.toLocaleString("en-US")}</td>
                            )}
                            <td className="border-b border-border/60" />
                          </tr>

                          {/* Project Rows (Level 3) */}
                          {!isRegCollapsed &&
                            r.projects.map((p) => {
                              const rawSt = p.status || "";
                              const st = rawSt.toLowerCase();
                              let badgeStyle = "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300";
                              let displayStatus = rawSt || "Upcoming";

                              if (st.includes("in_corso") || st.includes("in_progress")) {
                                badgeStyle = "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300";
                                displayStatus = "In Progress";
                              } else if (st.includes("da_configurare")) {
                                badgeStyle = "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300";
                                displayStatus = "To Configure";
                              } else if (st.includes("quotation_approved")) {
                                badgeStyle = "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300";
                                displayStatus = "Quotation Approved";
                              } else if (st.includes("quotation")) {
                                badgeStyle = "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300";
                                displayStatus = "Quotation";
                              } else if (st.includes("potential")) {
                                badgeStyle = "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300";
                                displayStatus = "Potential";
                              } else if (st.includes("installed")) {
                                badgeStyle = "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300";
                                displayStatus = "Installed";
                              } else if (st.includes("certificato") || st.includes("completato")) {
                                badgeStyle = "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300";
                                displayStatus = "Certificato";
                              }

                              const rowBgStyle = p.isEstimated
                                ? "bg-purple-100/70 dark:bg-purple-950/50 hover:bg-purple-200/70 text-purple-950 dark:text-purple-100"
                                : "hover:bg-muted/30 text-foreground/80";

                              return (
                                <tr key={`${regKey}::${p.projectName}`} className={`text-xs transition-colors ${rowBgStyle}`}>
                                  <td className="px-3.5 py-1.5 pl-14 border-b border-border/40 font-medium flex items-center justify-between gap-2">
                                    <span className="flex items-center gap-1.5 flex-wrap">
                                      <span>{p.projectName}</span>
                                      {p.isEstimated && (
                                        <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded border border-purple-400 bg-purple-200 text-purple-900 dark:bg-purple-800 dark:text-purple-100 dark:border-purple-600 uppercase tracking-tight shrink-0 shadow-xs">
                                          ESTIMATED
                                        </span>
                                      )}
                                    </span>
                                    {p.status && (
                                      <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border uppercase tracking-tight shrink-0 ${badgeStyle}`}>
                                        {displayStatus}
                                      </span>
                                    )}
                                  </td>
                                  {domain === "energy" ? (
                                    <>
                                      <td className="px-3.5 py-1.5 text-right border-b border-border/40 tabular-nums">{p.bridges || "—"}</td>
                                      <td className="px-3.5 py-1.5 text-right border-b border-border/40 tabular-nums">{p.pan10 || "—"}</td>
                                      <td className="px-3.5 py-1.5 text-right border-b border-border/40 tabular-nums">{p.pan12 || "—"}</td>
                                      <td className="px-3.5 py-1.5 text-right border-b border-border/40 tabular-nums">{p.pan14 || "—"}</td>
                                      <td className="px-3.5 py-1.5 text-right border-b border-border/40 tabular-nums font-semibold">{p.value.toLocaleString("en-US")}</td>
                                    </>
                                  ) : domain === "air" ? (
                                    <>
                                      <td className="px-3.5 py-1.5 text-right border-b border-border/40 tabular-nums">{p.leed || "—"}</td>
                                      <td className="px-3.5 py-1.5 text-right border-b border-border/40 tabular-nums">{p.well || "—"}</td>
                                      <td className="px-3.5 py-1.5 text-right border-b border-border/40 tabular-nums">{p.co2 || "—"}</td>
                                      <td className="px-3.5 py-1.5 text-right border-b border-border/40 tabular-nums text-slate-500">{p.unassigned || "—"}</td>
                                      <td className="px-3.5 py-1.5 text-right border-b border-border/40 tabular-nums font-semibold">{p.value.toLocaleString("en-US")}</td>
                                    </>
                                  ) : (
                                    <td className="px-3.5 py-1.5 text-right border-b border-border/40 tabular-nums font-semibold">{p.value.toLocaleString("en-US")}</td>
                                  )}
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

            {/* Grand Total Row */}
            <tr className="bg-primary/10 font-black">
              <td className="px-3.5 py-2.5 text-foreground">Grand Total</td>
              {domain === "energy" ? (
                <>
                  <td className="px-3.5 py-2.5 text-right tabular-nums text-blue-700">{grandBridges.toLocaleString("en-US")}</td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums text-emerald-700">{grandPan10.toLocaleString("en-US")}</td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums text-indigo-700">{grandPan12.toLocaleString("en-US")}</td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums text-purple-700">{grandPan14.toLocaleString("en-US")}</td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums text-foreground">{grandTotal.toLocaleString("en-US")}</td>
                </>
              ) : domain === "air" ? (
                <>
                  <td className="px-3.5 py-2.5 text-right tabular-nums text-blue-700">{grandLeed.toLocaleString("en-US")}</td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums text-amber-700">{grandWell.toLocaleString("en-US")}</td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums text-emerald-700">{grandCo2.toLocaleString("en-US")}</td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums text-slate-500">{grandUnassigned.toLocaleString("en-US")}</td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums text-foreground">{grandTotal.toLocaleString("en-US")}</td>
                </>
              ) : (
                <td className="px-3.5 py-2.5 text-right tabular-nums text-foreground">{grandTotal.toLocaleString("en-US")}</td>
              )}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

