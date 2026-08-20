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

import type { PivotDate, PivotTotals, PivotBucket, Headline, LongRow, PivotDomain } from "@/lib/monitorPivot";
import { BUCKET_LABEL, typologyBreakdown } from "@/lib/monitorPivot";

/** A column of the exported table, mirroring the renderer's NumCol. */
export interface ExportColumn {
  key: keyof PivotTotals;
  label: string;
  /** Top-level group this column sits under, when the header is two rows deep. */
  group?: string;
  /** Which half of a group this column is: hardware that exists, or hardware to build. */
  sub?: "assigned" | "toProduce";
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

// The headline horizons used to be recomputed here, over rolling 30/90-day
// windows. That is precisely how the PDF came to contradict the table it was
// printed from: different boundaries, two cards instead of four, and a
// cumulative second card. Both exports now receive the `Headline[]` the screen
// renders, built once by `buildHeadlines` in the pivot lib. Nothing in this
// file derives a total any more — it only draws what it is handed.

export interface ExportMeta {
  /** "Energy" | "Air" | "Water" — what the table is showing. */
  domain: string;
  /**
   * Every filter and toggle, one entry each, INCLUDING the ones left at their
   * default. A sheet that only mentions the switches somebody happened to flip
   * cannot be reconciled with the screen it came from: a reader has no way to
   * tell "requested demand included" from "nobody wrote it down".
   */
  filterLines: string[];
  /** Machine key of the domain, so the typology breakdown picks the right columns. */
  domainKey: PivotDomain;
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

// A shared `toMatrix` used to build one flat table for both formats. It is gone
// on purpose: the two media want different shapes. Excel gets a Level column and
// an autofilter so it works as data; the PDF gets the two-level header and the
// indentation, because it is read, not filtered.

/**
 * Column headers of the source sheet.
 *
 * `Handover` stays the contractual date. The bucket, quarter and month are
 * computed on the PLANNING date, which differs from it whenever the on-site
 * lead time is switched on — so they say so in the header rather than letting a
 * reader assume the four columns describe the same day.
 */
const LONG_HEAD = [
  "Progetto", "Cliente", "Città", "Brand", "Region", "Country", "PM",
  "Handover (data contrattuale)",
  "Bucket (su data di pianificazione)",
  "Trimestre (pianificazione)",
  "Mese (pianificazione)",
  "Stato", "Tipologia",
  "Consegnati", "Assegnati", "Da produrre",
  "Note",
] as const;

/** Index of the Handover column, the only one carrying a real date. */
const HANDOVER_COL = 7;

/**
 * The Excel is the SOURCE table, not a picture of the pivot.
 *
 * Exporting the rendered pivot reproduced its nesting and its empty cells:
 * faithful to the screen and unusable as data — you cannot filter it, sort it
 * or pivot it again. Long format instead, one row per project × typology, no
 * grouping and no merged cells, so the reader can build their own pivot.
 */
export async function exportPivotExcel(
  longRows: LongRow[],
  meta: ExportMeta,
  headlines: Headline[],
): Promise<void> {
  const XLSX = await import("xlsx");

  const body = longRows.map((r) => [
    r.project, r.client ?? "", r.city ?? "", r.brand ?? "", r.region, r.country ?? "", r.pm ?? "",
    // A real Date, not a string: the whole point is to be able to group by it.
    r.handover ?? "",
    r.bucketLabel, r.quarter, r.month,
    r.status ?? "", r.typology,
    r.delivered, r.assigned, r.toProduce,
    r.notes ?? "",
  ]);

  const data = XLSX.utils.aoa_to_sheet([[...LONG_HEAD], ...body], { cellDates: true });

  // aoa_to_sheet types the Date cells; without an explicit format Excel shows
  // them as serial numbers.
  for (let i = 0; i < body.length; i += 1) {
    const cell = data[XLSX.utils.encode_cell({ r: i + 1, c: HANDOVER_COL })];
    if (cell && cell.t === "d") cell.z = "dd/mm/yyyy";
  }

  data["!cols"] = [
    { wch: 40 }, { wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 20 },
    { wch: 22 }, { wch: 34 }, { wch: 20 }, { wch: 14 },
    { wch: 14 }, { wch: 13 },
    { wch: 12 }, { wch: 11 }, { wch: 12 },
    { wch: 40 },
  ];
  data["!freeze"] = { xSplit: "1", ySplit: "1" } as never;
  data["!autofilter"] = {
    ref: `A1:${XLSX.utils.encode_col(LONG_HEAD.length - 1)}${body.length + 1}`,
  };

  // Second sheet: what the numbers were filtered by, and the check that the
  // bucket sums on sheet 1 add up to the cards on screen.
  const blank: (string | number)[] = [];
  const info: (string | number)[][] = [
    [`MONITOR · REPORT & DEMAND PLANNING — ${meta.domain.toUpperCase()}`],
    ["Generato", meta.generatedAt],
    blank,
    ["FILTRI ATTIVI"],
    ...(meta.filterLines.length ? meta.filterLines.map((l) => [l]) : [["nessun filtro"]]),
    blank,
    ["Nota", "Il foglio Dati include SEMPRE gli handover passati, anche quando la tabella a schermo li nasconde: la card Arretrati li conta, quindi ometterli qui renderebbe i totali non riconciliabili."],
    blank,
    ["RICONCILIAZIONE — somma di 'Da produrre' per bucket"],
    ["Bucket", "Da produrre", "Finestra"],
    ...headlines.map((h) => [h.label, h.totals.requested, h.range]),
    ["TOTALE", headlines.reduce((s, h) => s + h.totals.requested, 0), ""],
  ];
  const infoSheet = XLSX.utils.aoa_to_sheet(info);
  infoSheet["!cols"] = [{ wch: 26 }, { wch: 16 }, { wch: 60 }];

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, data, "Dati");
  XLSX.utils.book_append_sheet(book, infoSheet, "Filtri");
  const buf = XLSX.write(book, { bookType: "xlsx", type: "array", cellDates: true }) as ArrayBuffer;
  triggerDownload(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${fileStem(meta)}.xlsx`,
  );
}

const TEAL: [number, number, number] = [0, 145, 147];
const ORANGE: [number, number, number] = [194, 88, 12];
const INK: [number, number, number] = [38, 42, 46];
const RED: [number, number, number] = [176, 42, 42];
const CARD_FILL: [number, number, number] = [240, 249, 250];
const CARD_EDGE: [number, number, number] = [198, 224, 226];
const OVERDUE_FILL: [number, number, number] = [253, 244, 244];
const OVERDUE_EDGE: [number, number, number] = [235, 201, 201];

/**
 * jsPDF's built-in fonts are encoded WinAnsi, so anything outside it is written
 * as its raw UTF-8 bytes and read back as mojibake — "→" came out as "â†'".
 * Only characters absent from WinAnsi are replaced; "·" and "×" are in it and
 * survive untouched.
 */
export function pdfSafe(s: string): string {
  return s
    .replace(/[→–—−]/g, "-")
    .replace(/•/g, "-")
    .replace(/…/g, "...")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
}

/**
 * Writes wrapped text without `maxWidth`.
 *
 * Passing `maxWidth` to doc.text() makes jsPDF place each glyph on its own,
 * which reads as "7 A u g 2 0 2 6" once the PDF is copied out of. Splitting
 * first and drawing plain lines keeps the run intact.
 */
function drawWrapped(
  doc: InstanceType<typeof import("jspdf").jsPDF>,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 3,
): number {
  const lines = doc.splitTextToSize(pdfSafe(text), maxWidth).slice(0, maxLines);
  lines.forEach((line: string, i: number) => doc.text(line, x, y + i * lineHeight));
  return y + lines.length * lineHeight;
}

/**
 * Draws the headline cards above the table — the same blocks, in the same
 * order, with the same numbers as the cards on screen.
 */
function drawHeadlineCards(
  doc: InstanceType<typeof import("jspdf").jsPDF>,
  headlines: Headline[],
  domain: PivotDomain,
  x: number,
  y: number,
  width: number,
): number {
  const cards = headlines.filter((h) => h.isCard);
  if (!cards.length) return y;
  const gap = 10;
  const cardW = (width - gap * (cards.length - 1)) / cards.length;
  const cardH = 82;

  cards.forEach((h, i) => {
    const cx = x + i * (cardW + gap);
    const overdue = h.key === "past";
    doc.setFillColor(...(overdue ? OVERDUE_FILL : CARD_FILL));
    doc.setDrawColor(...(overdue ? OVERDUE_EDGE : CARD_EDGE));
    doc.setLineWidth(0.8);
    doc.roundedRect(cx, y, cardW, cardH, 5, 5, "FD");

    doc.setTextColor(...(overdue ? RED : TEAL));
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text(pdfSafe(h.label.toUpperCase()), cx + 10, y + 15);

    // The number is the point of the card, so it carries the visual weight.
    doc.setTextColor(...INK);
    doc.setFontSize(21);
    const figure = h.totals.requested.toLocaleString("en-US");
    doc.text(figure, cx + 10, y + 41);
    // Measured at the display size, before the font shrinks below.
    const figureW = doc.getTextWidth(figure);

    // Naming the number is not decoration: read bare it would be taken for the
    // project total, which is the confusion this card used to cause.
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...ORANGE);
    doc.text("to produce", cx + 10 + figureW + 5, y + 41);

    // The "which" of the demand — a total alone does not tell production what
    // to build.
    doc.setFontSize(6.5);
    doc.setTextColor(...INK);
    drawWrapped(doc, typologyBreakdown(domain, h.totals), cx + 10, y + 54, cardW - 20, 7.5, 2);

    doc.setFontSize(6);
    doc.setTextColor(140);
    doc.text(pdfSafe(h.range), cx + 10, y + 70);
    doc.text(pdfSafe(h.hint), cx + 10, y + 77);
  });

  let below = y + cardH + 13;

  // Undated demand is the one figure nothing else on the page accounts for:
  // hardware no horizon claims, and therefore hardware nobody orders.
  const tbd = headlines.find((h) => !h.isCard && h.totals.requested > 0);
  if (tbd) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...ORANGE);
    doc.text(
      pdfSafe(
        `! ${tbd.totals.requested.toLocaleString("en-US")} units to produce on projects with no handover date`,
      ),
      x,
      below,
    );
    below += 13;
  }

  doc.setFont("helvetica", "normal");
  doc.setLineWidth(0.4);
  return below + 3;
}

export async function exportPivotPdf(
  rows: ExportRow[],
  cols: ExportColumn[],
  totals: (number | null)[],
  meta: ExportMeta,
  headlines: Headline[] = [],
): Promise<void> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  // Landscape: with every family split in two the table runs to 15 columns.
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 32;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...INK);
  doc.text(pdfSafe(`Monitor · Report & Demand Planning - ${meta.domain}`), margin, 38);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(120);
  const afterFilters = drawWrapped(
    doc,
    meta.filterLines.length ? `Filters: ${meta.filterLines.join(" · ")}` : "Filters: none",
    margin,
    52,
    pageW - margin * 2,
    9,
    3,
  );
  doc.text(`Generated: ${meta.generatedAt}`, margin, afterFilters + 1);

  const tableTop = drawHeadlineCards(
    doc,
    headlines,
    meta.domainKey,
    margin,
    afterFilters + 13,
    pageW - margin * 2,
  );

  // Two-row head mirroring the screen: family on top, assigned / to produce
  // beneath. A flat "LEED assigned, LEED to produce, WELL assigned…" strip is
  // readable but gives no sense of the pairs.
  const groups: Array<{ label: string; span: number }> = [];
  for (const c of cols) {
    const last = groups[groups.length - 1];
    const key = c.group;
    if (key && last && last.label === key) last.span += 1;
    else groups.push({ label: key ?? c.label, span: 1 });
  }
  const hasSub = cols.some((c) => c.sub);

  const headRow1 = [
    { content: "Level / Name", rowSpan: hasSub ? 2 : 1 },
    ...groups.map((g) => ({ content: pdfSafe(g.label), colSpan: g.span, styles: { halign: "center" as const } })),
    { content: "Handover", rowSpan: hasSub ? 2 : 1 },
    { content: "Notes", rowSpan: hasSub ? 2 : 1 },
  ];
  const headRow2 = cols
    .filter((c) => c.sub)
    .map((c) => ({
      content: c.sub === "assigned" ? "assigned" : "to produce",
      styles: { halign: "right" as const, fontSize: 5.5 },
    }));

  // Every cell goes through pdfSafe: project labels carry SKU chips with "×",
  // notes are free text, and an em dash for an empty cell would come out as
  // mojibake just as the arrow did.
  const body = [
    ...rows.map((r) => [
      pdfSafe(r.label),
      ...r.values.map((v) => (v == null ? "-" : v.toLocaleString("en-US"))),
      pdfSafe(r.handover),
      pdfSafe(r.notes),
    ]),
    ["TOTAL", ...totals.map((v) => (v == null ? "-" : v.toLocaleString("en-US"))), "", ""],
  ];

  autoTable(doc, {
    head: hasSub ? [headRow1, headRow2] : [headRow1],
    body,
    startY: tableTop,
    margin: { left: margin, right: margin },
    styles: { fontSize: 6.5, cellPadding: 2.5, overflow: "linebreak", lineColor: [226, 232, 236], lineWidth: 0.4 },
    headStyles: { fillColor: TEAL, textColor: 255, fontStyle: "bold", fontSize: 6.5, halign: "center" },
    columnStyles: {
      0: { cellWidth: 176, halign: "left" },
      [cols.length + 1]: { cellWidth: 62 },
      [cols.length + 2]: { cellWidth: 96 },
    },
    didParseCell: (data) => {
      // "to produce" columns stay orange everywhere, head included: it is the
      // number the reader is looking for.
      const col = cols[data.column.index - 1];
      const isToProduce = col?.sub === "toProduce";
      if (data.section === "head" && isToProduce && data.row.index === (hasSub ? 1 : 0)) {
        data.cell.styles.textColor = [255, 226, 200];
      }
      if (data.section !== "body") return;

      if (data.column.index > 0 && data.column.index <= cols.length) {
        data.cell.styles.halign = "right";
        if (isToProduce && data.cell.text.join("") !== "-") data.cell.styles.textColor = ORANGE;
      }

      const row = rows[data.row.index];
      if (!row) {
        // Grand total
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [230, 238, 240];
        return;
      }
      if (row.level === "band") {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [223, 233, 236];
        data.cell.styles.textColor = INK;
      } else if (row.level === "period") {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [241, 245, 247];
      } else if (row.level === "region") {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.textColor = [88, 96, 102];
      }
    },
    didDrawPage: () => {
      const page = doc.getNumberOfPages();
      doc.setFontSize(6.5);
      doc.setTextColor(150);
      doc.text(
        pdfSafe(`${meta.domain} · ${meta.generatedAt}`),
        margin,
        doc.internal.pageSize.getHeight() - 16,
      );
      doc.text(
        `Page ${page}`,
        pageW - margin - 30,
        doc.internal.pageSize.getHeight() - 16,
      );
    },
  });

  triggerDownload(doc.output("blob"), `${fileStem(meta)}.pdf`);
}
