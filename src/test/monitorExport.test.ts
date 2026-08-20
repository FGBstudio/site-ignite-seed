import { describe, it, expect } from "vitest";
import { flattenPivot, grandTotals, pdfSafe, type ExportColumn } from "@/lib/monitorExport";
import {
  buildHeadlines, buildLongRows, buildPivotTree, bucketTotals,
} from "@/lib/monitorPivot";
import type {
  PivotDate, PivotProject, PivotRegion, PivotTotals, NormalizedRecord,
} from "@/lib/monitorPivot";

const COLS: ExportColumn[] = [
  { key: "leed", label: "LEED" },
  { key: "value", label: "Total Monitors" },
];

function totals(partial: Partial<PivotTotals> = {}): PivotTotals {
  return {
    value: 0, assigned: 0, requested: 0,
    bridges: 0, pan10: 0, pan12: 0, pan14: 0,
    bridgesToProduce: 0, pan10ToProduce: 0, pan12ToProduce: 0, pan14ToProduce: 0,
    leed: 0, well: 0, co2: 0, coco2: 0, unassigned: 0,
    leedToProduce: 0, wellToProduce: 0, co2ToProduce: 0, coco2ToProduce: 0, unassignedToProduce: 0,
    byProduct: {},
    ...partial,
  };
}

function project(name: string, partial: Partial<PivotProject> = {}): PivotProject {
  return {
    ...totals({ value: 1, leed: 1 }),
    projectName: name,
    notes: [],
    dates: ["01/09/2026"],
    hasFallbackDate: false,
    ...partial,
  };
}

function region(name: string, projects: PivotProject[]): PivotRegion {
  return { ...totals({ value: projects.length, leed: projects.length }), region: name, projects };
}

const TREE: PivotDate[] = [
  {
    ...totals({ value: 2, leed: 2 }),
    dateKey: "2026-09", dateLabel: "Sep 2026", bucket: "next", granularity: "month",
    regions: [region("Europe", [project("EQT MILAN Torre"), project("EQT ROME Palazzo")])],
  },
  {
    ...totals({ value: 1, leed: 1 }),
    dateKey: "TBD", dateLabel: "TBD", bucket: "tbd", granularity: "none",
    regions: [region("APAC", [project("SHANGHAI Pudong", { dates: [], hasFallbackDate: true })])],
  },
];

describe("monitor report export", () => {
  it("emits a band header only when the horizon changes", () => {
    const rows = flattenPivot(TREE, COLS, new Set(), new Set());
    expect(rows.filter((r) => r.level === "band")).toHaveLength(2);
    expect(rows[0].level).toBe("band");
    expect(rows[0].label).toContain("Mid-construction");
  });

  it("exports exactly the rows that are visible on screen", () => {
    const all = flattenPivot(TREE, COLS, new Set(), new Set());
    expect(all.filter((r) => r.level === "project")).toHaveLength(3);

    // Collapsing a period hides its regions and projects, and the export follows.
    const collapsed = flattenPivot(TREE, COLS, new Set(["2026-09"]), new Set());
    expect(collapsed.filter((r) => r.level === "region")).toHaveLength(1);
    expect(collapsed.filter((r) => r.level === "project")).toHaveLength(1);
    expect(collapsed.some((r) => r.label.includes("Torre"))).toBe(false);
  });

  it("follows a collapsed region too", () => {
    const rows = flattenPivot(TREE, COLS, new Set(), new Set(["2026-09::Europe"]));
    expect(rows.some((r) => r.label.includes("Europe"))).toBe(true);
    expect(rows.some((r) => r.label.includes("Torre"))).toBe(false);
    expect(rows.some((r) => r.label.includes("Pudong"))).toBe(true);
  });

  it("keeps the hierarchy readable once flattened", () => {
    const rows = flattenPivot(TREE, COLS, new Set(), new Set());
    const period = rows.find((r) => r.level === "period")!;
    const proj = rows.find((r) => r.level === "project")!;
    expect(proj.label.length - proj.label.trimStart().length)
      .toBeGreaterThan(period.label.length - period.label.trimStart().length);
    expect(period.label).toContain("grouped by month");
  });

  it("marks unconfirmed dates and undated projects", () => {
    const rows = flattenPivot(TREE, COLS, new Set(), new Set());
    const pudong = rows.find((r) => r.label.includes("Pudong"))!;
    expect(pudong.handover).toBe("TBD ~");
  });

  it("carries the badges the numbers do not express", () => {
    const tree: PivotDate[] = [{
      ...totals({ value: 5 }),
      dateKey: "2026-10", dateLabel: "Oct 2026", bucket: "next", granularity: "month",
      regions: [{
        ...totals({ value: 5 }),
        region: "Europe",
        projects: [project("KERING Eyewear", {
          ...totals({ value: 5, assigned: 0, requested: 5, unassigned: 5, byProduct: { "CO2 ClAir black": 5 } }),
          projectName: "KERING Eyewear",
          notes: ["check wiring"],
          dates: [],
          hasFallbackDate: false,
          typologySource: "none",
          status: "Delivered",
          isEstimated: true,
        })],
      }],
    }];
    const row = flattenPivot(tree, COLS, new Set(), new Set()).find((r) => r.level === "project")!;
    expect(row.label).toContain("ESTIMATED");
    expect(row.label).toContain("NO TYPOLOGY");
    expect(row.label).toContain("Delivered");
    expect(row.label).toContain("5× CO2 ClAir black");
    expect(row.notes).toBe("check wiring");
  });

  it("does not repeat 'requested' as a flag — the status and the columns say it", () => {
    const tree: PivotDate[] = [{
      ...totals({ value: 4, requested: 4 }),
      dateKey: "2026-11", dateLabel: "Nov 2026", bucket: "next", granularity: "month",
      regions: [{
        ...totals({ value: 4, requested: 4 }),
        region: "Europe",
        projects: [project("BAY LUCAN Lodge Nursing Home", {
          ...totals({ value: 4, assigned: 0, requested: 4 }),
          projectName: "BAY LUCAN Lodge Nursing Home",
          notes: [], dates: [], hasFallbackDate: false,
          status: "Requested",
        })],
      }],
    }];
    const row = flattenPivot(tree, COLS, new Set(), new Set()).find((r) => r.level === "project")!;
    // Exactly one mention, coming from the status badge.
    expect(row.label.match(/requested/gi) ?? []).toHaveLength(1);
  });

  it("totals the whole visible tree in the footer", () => {
    expect(grandTotals(TREE, COLS)).toEqual([3, 3]); // 2 + 1 across both periods
  });
});

describe("pdf text encoding", () => {
  // jsPDF's built-in fonts are WinAnsi. Anything outside it is emitted as raw
  // UTF-8 bytes and read back as mojibake — the arrow in "7 Aug → 7 Sep" came
  // out as "â†'".
  it("replaces characters the built-in fonts cannot encode", () => {
    expect(pdfSafe("7 Aug 2026 → 7 Sep 2026")).toBe("7 Aug 2026 - 7 Sep 2026");
    expect(pdfSafe("a — b – c")).toBe("a - b - c");
    expect(pdfSafe("one • two")).toBe("one - two");
    expect(pdfSafe("wait…")).toBe("wait...");
    expect(pdfSafe("“quoted” and ‘single’")).toBe('"quoted" and \'single\'');
  });

  it("leaves WinAnsi characters alone", () => {
    // "×" and "·" are in the encoding and carry meaning in SKU chips and notes.
    expect(pdfSafe("15× CO-CO2 ClAir black · note")).toBe("15× CO-CO2 ClAir black · note");
    expect(pdfSafe("Théâtre Müller")).toBe("Théâtre Müller");
  });
});

// ── One set of numbers, three outputs ───────────────────────────────────────

const NOW = new Date(2026, 7, 8); // 8 Aug 2026 — Q3

function record(partial: Partial<NormalizedRecord> & { date: Date | null }): NormalizedRecord {
  return {
    dateSource: partial.date ? "handover" : "none",
    region: "Europe",
    projectName: "Project",
    value: 0, assigned: 0, requested: 0,
    bridges: 0, pan10: 0, pan12: 0, pan14: 0,
    leed: 0, well: 0, co2: 0, coco2: 0,
    status: null, category: null, pm: null, brand: null, country: null,
    ...partial,
  } as NormalizedRecord;
}

/** One record per bucket, plus a fully delivered one and an undated one. */
const RECORDS: NormalizedRecord[] = [
  record({
    date: new Date(2026, 7, 20), projectName: "CUR Partly",
    value: 10, assigned: 4, requested: 6, leed: 4, leedToProduce: 6, status: "Requested",
  }),
  record({
    // HIG Ballygunner: 65 on site, nothing left to order.
    date: new Date(2026, 8, 30), projectName: "CUR Delivered",
    value: 65, assigned: 65, requested: 0, co2: 65, status: "65 delivered",
  }),
  record({
    date: new Date(2026, 10, 15), projectName: "NEXT",
    value: 40, assigned: 0, requested: 40, co2ToProduce: 40, status: "Requested",
  }),
  record({
    date: new Date(2027, 2, 1), projectName: "LONG",
    value: 500, assigned: 0, requested: 500, leedToProduce: 500, status: "Requested",
  }),
  record({
    date: null, projectName: "NO DATE",
    value: 7, assigned: 0, requested: 7, wellToProduce: 7, status: "Requested",
  }),
  record({
    date: new Date(2026, 5, 1), projectName: "OVERDUE",
    value: 99, assigned: 0, requested: 99, leedToProduce: 99, status: "Requested",
  }),
];

const sumBy = (rows: ReturnType<typeof buildLongRows>, bucket: string) =>
  rows.filter((r) => r.bucket === bucket).reduce((s, r) => s + r.toProduce, 0);

describe("headline blocks", () => {
  const headlines = buildHeadlines(
    bucketTotals(buildPivotTree(RECORDS, { now: NOW, hidePast: false })),
    NOW,
    true,
  );
  const by = (k: string) => headlines.find((h) => h.key === k)!;

  it("gives every bucket a card, plus the undated warning", () => {
    expect(headlines.filter((h) => h.isCard).map((h) => h.key)).toEqual([
      "current", "next", "long", "past",
    ]);
    // TBD is a warning line, not a horizon anyone can plan against.
    expect(by("tbd").isCard).toBe(false);
    expect(by("tbd").totals.requested).toBe(7);
  });

  it("states calendar windows, not rolling ones", () => {
    // The quarter closes on 30 Sep whatever day the report is run.
    expect(by("current").range).toBe("8 Aug 2026 – 30 Sep 2026");
    expect(by("next").range).toBe("1 Oct 2026 – 31 Dec 2026");
    expect(by("long").range).toBe("from 1 Jan 2027");
    expect(by("past").range).toBe("before 8 Aug 2026");
  });

  it("keeps each card to its own period rather than accumulating", () => {
    // 6 in the current quarter and 40 in the next: the second card is 40, not 46.
    expect(by("current").totals.requested).toBe(6);
    expect(by("next").totals.requested).toBe(40);
    expect(by("long").totals.requested).toBe(500);
  });

  it("counts overdue demand even while the table hides it", () => {
    expect(by("past").totals.requested).toBe(99);
    expect(by("past").hiddenInTable).toBe(true);
  });

  it("excludes delivered hardware from what has to be produced", () => {
    // The delivered project contributes 65 units to the quarter's total and
    // nothing at all to its production order.
    expect(by("current").totals.value).toBe(75);
    expect(by("current").totals.requested).toBe(6);
  });
});

describe("source table", () => {
  const rows = buildLongRows(RECORDS, "air", { now: NOW });

  it("emits one row per project and typology, in long format", () => {
    expect(rows.map((r) => [r.project, r.typology])).toEqual([
      ["CUR Partly", "LEED"],
      ["CUR Delivered", "CO2"],
      ["NEXT", "CO2"],
      ["LONG", "LEED"],
      ["NO DATE", "WELL"],
      ["OVERDUE", "LEED"],
    ]);
  });

  it("splits delivered units out of assigned ones", () => {
    const delivered = rows.find((r) => r.project === "CUR Delivered")!;
    expect([delivered.delivered, delivered.assigned, delivered.toProduce]).toEqual([65, 0, 0]);
    const partly = rows.find((r) => r.project === "CUR Partly")!;
    expect([partly.delivered, partly.assigned, partly.toProduce]).toEqual([0, 4, 6]);
  });

  it("keeps undated projects instead of dropping them", () => {
    const undated = rows.find((r) => r.project === "NO DATE")!;
    expect(undated.bucket).toBe("tbd");
    expect(undated.bucketLabel).toBe("Senza data");
    expect(undated.handover).toBeNull();
    expect(undated.toProduce).toBe(7);
  });

  it("buckets on the planning date while keeping the contractual handover", () => {
    // 1 Oct minus the 15-day lead time lands the material in September, so the
    // row plans in the current quarter while its handover stays in the next.
    const [row] = buildLongRows(
      [record({ date: new Date(2026, 9, 1), projectName: "LEAD", value: 3, requested: 3, leedToProduce: 3 })],
      "air",
      { now: NOW, offsetDays: 15 },
    );
    expect(row.handover).toEqual(new Date(2026, 9, 1));
    expect(row.planDate).toEqual(new Date(2026, 8, 16));
    expect(row.bucket).toBe("current");
  });
});

describe("the three outputs agree", () => {
  // The pivot table, the cards (screen and PDF) and the Excel source sheet must
  // report the same numbers. They used to disagree because the export derived
  // its own horizons; this is the test that keeps them honest.
  const tree = buildPivotTree(RECORDS, { now: NOW, hidePast: false });
  const byBucket = bucketTotals(tree);
  const headlines = buildHeadlines(byBucket, NOW, false);
  const rows = buildLongRows(RECORDS, "air", { now: NOW });

  it("matches bucket by bucket", () => {
    for (const h of headlines) {
      expect({ bucket: h.key, toProduce: sumBy(rows, h.key) }).toEqual({
        bucket: h.key,
        toProduce: h.totals.requested,
      });
      expect(h.totals.requested).toBe(byBucket[h.key].requested);
    }
  });

  it("matches on the grand total", () => {
    const fromTable = tree.reduce((s, p) => s + p.requested, 0);
    const fromCards = headlines.reduce((s, h) => s + h.totals.requested, 0);
    const fromSheet = rows.reduce((s, r) => s + r.toProduce, 0);
    expect(fromCards).toBe(fromTable);
    expect(fromSheet).toBe(fromTable);
    expect(fromTable).toBe(6 + 40 + 500 + 7 + 99);
  });

  it("still agrees when the table hides overdue rows", () => {
    // Hiding is a display choice: the cards and the sheet keep the 99.
    const hidden = buildPivotTree(RECORDS, { now: NOW, hidePast: true });
    expect(bucketTotals(hidden).past.requested).toBe(0);
    expect(headlines.find((h) => h.key === "past")!.totals.requested).toBe(99);
    expect(sumBy(rows, "past")).toBe(99);
  });
});
