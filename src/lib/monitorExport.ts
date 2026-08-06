// Export of the Monitor Report pivot, exactly as it is on screen.
//
// "As on screen" is the whole point: the table is filtered, may hide past
// periods, and its rows are expanded or collapsed by hand. An export that
// re-derives its own rows from the data would quietly disagree with what the
// person was looking at when they clicked. So the flattener below walks the
// same tree with the same collapse state the renderer uses, and emits one row
// per visible row — nothing more.
//
// Pure except for the two download helpers at the bottom: no React, no I/O.

import type { PivotDate, PivotTotals, PivotBucket } from "@/lib/monitorPivot";
import { BUCKET_LABEL } from "@/lib/monitorPivot";

/** A column of the exported table, mirroring the renderer's NumCol. */
export interface ExportColumn {
  key: keyof PivotTotals;
  label: string;
}

export type ExportLevel = "band" | "period" | "region" | "project";

export interface ExportRow {
  level: ExportLevel;
  /** Indented name, so the hierarchy survives in a flat sheet. */
  label: string;
  values: (number | null)[];
  handover: string;
  notes: string;
}

const INDENT: Record<ExportLevel, string> = {
  band: "",
  period: "  ",
  region: "    ",
  project: "      ",
};

/**
 * Flattens the pivot into the rows currently visible.
 *
 * Mirrors PivotTableRenderer: a band header whenever the horizon changes, then
 * the period row, then regions only if the period is expanded, then projects
 * only if the region is expanded.
 */
export function flattenPivot(
  tree: PivotDate[],
  cols: ExportColumn[],
  collapsedDates: Set<string>,
  collapsedRegions: Set<string>,
): ExportRow[] {
  const out: ExportRow[] = [];
  const num = (node: PivotTotals, c: ExportColumn): number | null => {
    const v = node[c.key];
    return typeof v === "number" && v !== 0 ? v : v === 0 ? 0 : null;
  };

  tree.forEach((d, di) => {
    const showBand = di === 0 || tree[di - 1].bucket !== d.bucket;
    if (showBand) {
      // Band totals span every period of the same horizon, as in the renderer.
      const bandNodes = tree.filter((p) => p.bucket === d.bucket);
      out.push({
        level: "band",
        label: BUCKET_LABEL[d.bucket as PivotBucket],
        values: cols.map((c) => bandNodes.reduce((s, p) => s + ((p[c.key] as number) ?? 0), 0) || null),
        handover: "",
        notes: "",
      });
    }

    out.push({
      level: "period",
      label: INDENT.period + d.dateLabel + (d.granularity === "month" ? " (grouped by month)" : ""),
      values: cols.map((c) => num(d, c)),
      handover: "",
      notes: "",
    });

    if (collapsedDates.has(d.dateKey)) return;

    d.regions.forEach((r) => {
      out.push({
        level: "region",
        label: INDENT.region + r.region,
        values: cols.map((c) => num(r, c)),
        handover: "",
        notes: "",
      });

      if (collapsedRegions.has(`${d.dateKey}::${r.region}`)) return;

      r.projects.forEach((p) => {
        // The badges next to the name carry meaning the numbers do not, so they
        // are kept as text rather than dropped. "REQUESTED" is deliberately not
        // among them: the status column already says it, and the "to produce"
        // columns state it as a number.
        const flags: string[] = [];
        if (p.isEstimated) flags.push("ESTIMATED");
        if (p.typologySource === "none" && (p.unassigned ?? 0) > 0) flags.push("NO TYPOLOGY");
        if (p.status) flags.push(p.status);

        const skus = Object.entries(p.byProduct ?? {})
          .filter(([, q]) => q > 0)
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .map(([name, q]) => `${q}× ${name}`);

        out.push({
          level: "project",
          label:
            INDENT.project +
            p.projectName +
            (flags.length ? `  [${flags.join(" · ")}]` : "") +
            (skus.length ? `  (${skus.join(", ")})` : ""),
          values: cols.map((c) => num(p, c)),
          // "~" marks a date not confirmed by Operations, same as the table.
          handover: (p.dates.length ? p.dates.join(", ") : "TBD") + (p.hasFallbackDate ? " ~" : ""),
          notes: p.notes.join(" • "),
        });
      });
    });
  });

  return out;
}

/** Grand totals across the whole visible tree, as shown in the footer. */
export function grandTotals(tree: PivotDate[], cols: ExportColumn[]): (number | null)[] {
  return cols.map((c) => tree.reduce((s, d) => s + ((d[c.key] as number) ?? 0), 0) || null);
}

export interface ExportMeta {
  /** "Energy" | "Air" | "Water" — what the table is showing. */
  domain: string;
  /** Human-readable summary of the active filters, or "" when unfiltered. */
  filterSummary: string;
  /** Formatted generation timestamp. */
  generatedAt: string;
}

function fileStem(meta: ExportMeta): string {
  return `monitor-report-${meta.domain.toLowerCase()}-${meta.generatedAt.slice(0, 10)}`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Rows as a plain matrix, shared by both formats. */
export function toMatrix(
  rows: ExportRow[],
  cols: ExportColumn[],
  totals: (number | null)[],
): (string | number)[][] {
  const header = ["Level / Name", ...cols.map((c) => c.label), "Handover", "Notes"];
  const body = rows.map((r) => [
    r.label,
    ...r.values.map((v) => (v == null ? "" : v)),
    r.handover,
    r.notes,
  ]);
  const footer = ["GRAND TOTAL", ...totals.map((v) => (v == null ? "" : v)), "", ""];
  return [header, ...body, footer];
}

export async function exportPivotExcel(
  rows: ExportRow[],
  cols: ExportColumn[],
  totals: (number | null)[],
  meta: ExportMeta,
): Promise<void> {
  const XLSX = await import("xlsx");
  const matrix = toMatrix(rows, cols, totals);

  // Two context lines above the table: an export nobody can date or attribute
  // to a filter set is impossible to reconcile with the screen it came from.
  const preamble: (string | number)[][] = [
    [`Monitor · Report & Demand Planning — ${meta.domain}`],
    [meta.filterSummary ? `Filters: ${meta.filterSummary}` : "Filters: none"],
    [`Generated: ${meta.generatedAt}`],
    [],
  ];

  const sheet = XLSX.utils.aoa_to_sheet([...preamble, ...matrix]);
  sheet["!cols"] = [
    { wch: 58 },
    ...cols.map(() => ({ wch: 13 })),
    { wch: 24 },
    { wch: 40 },
  ];
  // Freeze the header so the columns stay readable while scrolling.
  sheet["!freeze"] = { xSplit: "1", ySplit: String(preamble.length + 1) } as never;

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, meta.domain.slice(0, 31));
  const buf = XLSX.write(book, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  triggerDownload(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${fileStem(meta)}.xlsx`,
  );
}

export async function exportPivotPdf(
  rows: ExportRow[],
  cols: ExportColumn[],
  totals: (number | null)[],
  meta: ExportMeta,
): Promise<void> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  // Landscape: the table has up to 8 columns and long project names.
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const matrix = toMatrix(rows, cols, totals);
  const [header, ...bodyAndFooter] = matrix;

  doc.setFontSize(13);
  doc.text(`Monitor · Report & Demand Planning — ${meta.domain}`, 40, 38);
  doc.setFontSize(8);
  doc.setTextColor(110);
  doc.text(meta.filterSummary ? `Filters: ${meta.filterSummary}` : "Filters: none", 40, 52);
  doc.text(`Generated: ${meta.generatedAt}`, 40, 63);

  autoTable(doc, {
    head: [header],
    body: bodyAndFooter,
    startY: 76,
    styles: { fontSize: 7, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: [0, 145, 147], textColor: 255, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 210 },
      [cols.length + 1]: { cellWidth: 78 },
      [cols.length + 2]: { cellWidth: 130 },
    },
    // The hierarchy is carried by indentation, which a flat PDF loses at a
    // glance — so the structural rows keep a visual weight of their own.
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const row = rows[data.row.index];
      if (!row) {
        data.cell.styles.fontStyle = "bold"; // grand total
        return;
      }
      if (data.column.index > 0 && data.column.index <= cols.length) {
        data.cell.styles.halign = "right";
      }
      if (row.level === "band") {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [237, 242, 244];
      } else if (row.level === "period") {
        data.cell.styles.fontStyle = "bold";
      } else if (row.level === "region") {
        data.cell.styles.textColor = [70, 70, 70];
      }
    },
    didDrawPage: () => {
      const page = doc.getNumberOfPages();
      doc.setFontSize(7);
      doc.setTextColor(140);
      doc.text(`Page ${page}`, doc.internal.pageSize.getWidth() - 60, doc.internal.pageSize.getHeight() - 18);
    },
  });

  triggerDownload(doc.output("blob"), `${fileStem(meta)}.pdf`);
}
