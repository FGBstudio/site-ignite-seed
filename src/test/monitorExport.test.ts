import { describe, it, expect } from "vitest";
import { flattenPivot, grandTotals, toMatrix, type ExportColumn } from "@/lib/monitorExport";
import type { PivotDate, PivotProject, PivotRegion, PivotTotals } from "@/lib/monitorPivot";

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

  it("builds a matrix whose header and footer line up with the columns", () => {
    const rows = flattenPivot(TREE, COLS, new Set(), new Set());
    const matrix = toMatrix(rows, COLS, grandTotals(TREE, COLS));
    const width = COLS.length + 3; // name + columns + handover + notes
    expect(matrix.every((r) => r.length === width)).toBe(true);
    expect(matrix[0]).toEqual(["Level / Name", "LEED", "Total Monitors", "Handover", "Notes"]);
    expect(matrix[matrix.length - 1][0]).toBe("GRAND TOTAL");
    expect(matrix[matrix.length - 1][2]).toBe(3); // 2 + 1 across both periods
  });
});
