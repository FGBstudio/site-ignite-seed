// Layer 4 – Passive pivot renderer. No calculations, no fetching.
import { Fragment } from "react";
import type { PivotDate } from "@/lib/monitorPivot";

interface Props {
  tree: PivotDate[];
  valueHeader?: string;
}

export function PivotTableRenderer({ tree, valueHeader = "Sum of n°" }: Props) {
  if (tree.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        No data matches the current filters.
      </div>
    );
  }

  const grandTotal = tree.reduce((s, d) => s + d.value, 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-separate border-spacing-0">
        <thead className="sticky top-0 z-10 bg-background">
          <tr>
            <th className="text-left px-3 py-2 border-b border-border font-semibold w-[60%]">Level / Name</th>
            <th className="text-right px-3 py-2 border-b border-border font-semibold w-[15%]">{valueHeader}</th>
            <th className="text-left px-3 py-2 border-b border-border font-semibold w-[25%]">Notes</th>
          </tr>
        </thead>
        <tbody>
          {tree.map((d) => (
            <Fragment key={d.dateKey}>
              <tr className="bg-muted/60">
                <td className="px-3 py-1.5 font-bold text-foreground border-b border-border">{d.dateLabel}</td>
                <td className="px-3 py-1.5 text-right font-bold border-b border-border tabular-nums">{d.value.toLocaleString("en-US")}</td>
                <td className="border-b border-border" />
              </tr>
              {d.regions.map((r) => (
                <Fragment key={`${d.dateKey}::${r.region}`}>
                  <tr className="bg-muted/25">
                    <td className="px-3 py-1.5 pl-8 font-semibold text-foreground/90 border-b border-border/60">{r.region}</td>
                    <td className="px-3 py-1.5 text-right font-semibold border-b border-border/60 tabular-nums">{r.value.toLocaleString("en-US")}</td>
                    <td className="border-b border-border/60" />
                  </tr>
                  {r.projects.map((p) => (
                    <tr key={`${d.dateKey}::${r.region}::${p.projectName}`} className="hover:bg-muted/20">
                      <td className="px-3 py-1.5 pl-14 text-foreground/80 border-b border-border/40">{p.projectName}</td>
                      <td className="px-3 py-1.5 text-right border-b border-border/40 tabular-nums">{p.value.toLocaleString("en-US")}</td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground border-b border-border/40">
                        {p.notes.length ? p.notes.join(" • ") : ""}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </Fragment>
          ))}
          <tr className="bg-primary/10">
            <td className="px-3 py-2 font-bold">Grand Total</td>
            <td className="px-3 py-2 text-right font-bold tabular-nums">{grandTotal.toLocaleString("en-US")}</td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
