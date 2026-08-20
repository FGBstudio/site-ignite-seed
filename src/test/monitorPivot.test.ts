import { describe, it, expect } from "vitest";
import {
  buildLabel,
  typologyFromProductName,
  countTypologies,
  countProducts,
  familiesOf,
  splitByTypology,
  canonicalStatus,
  canonicalStatusLabel,
  bucketOf,
  granularityOf,
  buildPivotTree,
  bucketTotals,
  quarterTotals,
  adaptAir,
  adaptEnergy,
  energyBucketFromName,
  isCancelledStatus,
  type NormalizedRecord,
} from "@/lib/monitorPivot";

// Fixed "today" so every horizon assertion is deterministic: 5 Aug 2026 → Q3.
const NOW = new Date(2026, 7, 5);

function rec(partial: Partial<NormalizedRecord> & { date: Date | null }): NormalizedRecord {
  return {
    dateSource: partial.date ? "handover" : "none",
    region: "Europe",
    projectName: "EQT MIRANDOLA Minerva",
    value: 0,
    assigned: 0,
    requested: 0,
    bridges: 0,
    pan10: 0,
    pan12: 0,
    pan14: 0,
    leed: 0,
    well: 0,
    co2: 0,
    coco2: 0,
    unassigned: 0,
    status: null,
    category: null,
    pm: null,
    brand: null,
    country: null,
    ...partial,
  };
}

describe("status canonicalisation", () => {
  // fn_recalculate_site_air stores string_agg(cnt || ' ' || status), so the live
  // table holds 11 distinct spellings that all mean "Delivered".
  it("collapses count-prefixed aggregates to a single label", () => {
    for (const raw of ["1 delivered", "8 delivered", "122 delivered", "Delivered"]) {
      expect(canonicalStatusLabel(raw)).toBe("Delivered");
    }
  });

  it("treats a project as its least advanced shipment", () => {
    expect(canonicalStatusLabel("1 delivered, 3 in_transit")).toBe("In Transit");
    expect(canonicalStatusLabel("2 assigned, 5 delivered")).toBe("Assigned");
  });

  it("maps the other live spellings onto the ladder", () => {
    expect(canonicalStatusLabel("Upcoming")).toBe("Requested");
    expect(canonicalStatusLabel("Assigned")).toBe("Assigned");
    expect(canonicalStatusLabel("1 in_transit")).toBe("In Transit");
  });

  it("passes certification statuses through untouched", () => {
    expect(canonicalStatus("da_configurare")).toBe("da_configurare");
    expect(canonicalStatusLabel("in_corso")).toBe("in_corso");
    expect(canonicalStatusLabel(null)).toBeNull();
    expect(canonicalStatusLabel("   ")).toBeNull();
  });
});

/** adaptAir takes the demand indexed both ways; these fixtures key by certification. */
const certDemand = (entries: Array<[string, unknown]>) =>
  ({ byCertification: new Map(entries), bySite: new Map() }) as never;

/** …and this one keys by site, which is the index adaptAir prefers. */
const siteDemand = (entries: Array<[string, unknown]>) =>
  ({ byCertification: new Map(), bySite: new Map(entries) }) as never;

describe("per-SKU breakdown", () => {
  const NAMES = new Map([
    ["w", "WELL ClAir"],
    ["l", "LEED ClAir"],
    ["wb", "WELL ClAir black"],
    ["cb", "CO2 ClAir black"],
    ["cc", "CO-CO2 ClAir"],
  ]);

  it("keeps variants distinct instead of folding them into the family", () => {
    expect(countProducts(["wb", "wb", "w", "cb"], NAMES)).toEqual({
      "WELL ClAir black": 2,
      "WELL ClAir": 1,
      "CO2 ClAir black": 1,
    });
  });

  it("rolls SKUs up into families without losing units", () => {
    expect(familiesOf({ "WELL ClAir black": 5, "CO2 ClAir black": 15, "CO-CO2 ClAir": 2 })).toEqual({
      leed: 0, well: 5, co2: 15, coco2: 2,
    });
  });

  it("family columns always equal the sum of the SKUs shown under them", () => {
    // The real Kering Eyewear row: 20 sensors, 15 CO2 black + 5 WELL black.
    const [out] = adaptAir(
      [{ id: "s1", total_sensors: 20, air_product_ids: [
        ...Array(15).fill("cb"), ...Array(5).fill("wb"),
      ] }] as never,
      NAMES,
    );
    expect(out.byProduct).toEqual({ "CO2 ClAir black": 15, "WELL ClAir black": 5 });
    expect(out.co2).toBe(15);
    expect(out.well).toBe(5);
    expect(out.leed + out.well + out.co2 + out.coco2 + (out.unassigned ?? 0)).toBe(20);
  });

  it("treats an Upcoming row as nothing produced, whatever total_sensors says", () => {
    // fn_recalculate_site_air writes the pending request into total_sensors when
    // no hardware is attached, and marks the row 'Upcoming'. Counting that as
    // produced is what hid 420 units of real production demand.
    const [out] = adaptAir(
      [{ id: "s3", total_sensors: 20, status: "Upcoming", certification_id: "c1", air_product_ids: [] }] as never,
      NAMES,
      certDemand([["c1", { quantity: 20, byProduct: { "WELL ClAir": 20 } }]]),
    );
    expect(out.assigned).toBe(0);
    expect(out.requested).toBe(20);
    expect(out.value).toBe(20);
    expect(out.wellToProduce).toBe(20);
    expect(out.well).toBe(0);
  });

  it("excludes served units per allocation, without dropping the project", () => {
    // A project with 127 installed and 20 still requested reports 20 — it does
    // not vanish, and the 127 do not come back through the declared floor.
    const [out] = adaptAir(
      [{ id: "s20", total_sensors: 147, status: "Upcoming", air_product_ids: [] }] as never,
      NAMES,
      siteDemand([["s20", {
        quantity: 20, servedQuantity: 127, byProduct: { "WELL ClAir": 20 },
      }]]),
    );
    expect(out.requested).toBe(20);
    expect(out.value).toBe(20);
    expect(out.wellToProduce).toBe(20);
  });

  it("reports no demand for a project whose units have all shipped", () => {
    // BAY Cappagh Ratoath Road: 127 CO2 ClAir Installed_Online, nothing left to
    // order. The row stays in the report at zero rather than disappearing.
    const [out] = adaptAir(
      [{ id: "s21", total_sensors: 127, status: "Upcoming", air_product_ids: [] }] as never,
      NAMES,
      siteDemand([["s21", { quantity: 0, servedQuantity: 127, byProduct: {} }]]),
    );
    expect(out.requested).toBe(0);
    expect(out.value).toBe(0);
  });

  it("stops counting a project put on hold, without hiding it", () => {
    // On hold is paused, not cancelled: the Hub keeps stating the 24 sensors
    // the project will need, while the report orders none of them today.
    const [out] = adaptAir(
      [{ id: "s30", total_sensors: 24, status: "Upcoming", air_product_ids: [] }] as never,
      NAMES,
      siteDemand([["s30", { quantity: 0, heldQuantity: 24, byProduct: {} }]]),
    );
    expect(out.requested).toBe(0);
    expect(out.value).toBe(0);
  });

  it("counts the live half of a site whose other project is on hold", () => {
    // One certification suspended, a sibling still running: the running one
    // must still get its sensors built.
    const [out] = adaptAir(
      [{ id: "s31", total_sensors: 30, status: "Upcoming", air_product_ids: [] }] as never,
      NAMES,
      siteDemand([["s31", {
        quantity: 6, heldQuantity: 24, byProduct: { "WELL ClAir": 6 },
      }]]),
    );
    expect(out.requested).toBe(6);
    expect(out.wellToProduce).toBe(6);
  });

  it("keeps a monitor-only project visible when no allocation can back it", () => {
    // Kering Eyewear: 20 sensors recorded straight in the monitor, no
    // certification, so project_allocations has nothing keyed to it. Reading
    // only the allocations dropped the row to zero and it disappeared.
    const [out] = adaptAir(
      [{
        id: "s7", total_sensors: 20, status: "Upcoming", certification_id: null,
        air_product_ids: [...Array(15).fill("cb"), ...Array(5).fill("wb")],
      }] as never,
      NAMES,
    );
    expect(out.value).toBe(20);
    expect(out.assigned).toBe(0);
    expect(out.requested).toBe(20);
    expect(out.co2ToProduce).toBe(15);
    expect(out.wellToProduce).toBe(5);
  });

  it("never stretches a request's stated quantity over the whole row", () => {
    // Offices HQ: the row declares 20 sensors, the only allocation names 5 WELL
    // black, and the monitor lists no typology at all. Scaling the mix put all
    // 20 under WELL; the 15 nobody described belong in Unassigned.
    const [out] = adaptAir(
      [{ id: "s9", total_sensors: 20, status: "Upcoming", certification_id: "c6", air_product_ids: [] }] as never,
      NAMES,
      certDemand([["c6", { quantity: 5, byProduct: { "WELL ClAir black": 5 } }]]),
    );
    expect(out.value).toBe(20);
    expect(out.wellToProduce).toBe(5);
    expect(out.unassignedToProduce).toBe(15);
    expect(out.byProduct).toEqual({ "WELL ClAir black": 5 });
  });

  it("gathers demand from every certification on the site", () => {
    // Offices HQ: site_air_records holds one row per SITE, but the site is
    // certified under several schemas and its requests are split across them —
    // 5 WELL black on the certification the record points at, 15 CO-CO2 black
    // on a sibling. Reading only the referenced certification buried the 15
    // under "Unassigned".
    const [out] = adaptAir(
      [{ id: "site-hq", total_sensors: 20, status: "Upcoming", certification_id: "cert-well", air_product_ids: [] }] as never,
      new Map([["x", "CO-CO2 ClAir black"]]),
      siteDemand([["site-hq", {
        quantity: 20,
        byProduct: { "WELL ClAir black": 5, "CO-CO2 ClAir black": 15 },
      }]]),
    );
    expect(out.wellToProduce).toBe(5);
    expect(out.coco2ToProduce).toBe(15);
    expect(out.unassignedToProduce).toBe(0);
    expect(out.byProduct).toEqual({ "WELL ClAir black": 5, "CO-CO2 ClAir black": 15 });
    expect(out.value).toBe(20);
  });

  it("still treats a single monitor product id as a label for the whole row", () => {
    // 156 rows carry one product id standing for every sensor on the row —
    // there the mix must scale, or a 122-sensor project would show one unit.
    const [out] = adaptAir(
      [{ id: "s10", total_sensors: 122, status: "3 delivered", air_product_ids: ["w"] }] as never,
      NAMES,
    );
    expect(out.well).toBe(122);
    expect(out.unassigned).toBe(0);
  });

  it("lets a fuller allocation win over the stored count on an Upcoming row", () => {
    const [out] = adaptAir(
      [{ id: "s8", total_sensors: 5, status: "Upcoming", certification_id: "c5", air_product_ids: [] }] as never,
      NAMES,
      certDemand([["c5", { quantity: 12, byProduct: { "WELL ClAir": 12 } }]]),
    );
    expect(out.requested).toBe(12);
    expect(out.value).toBe(12);
  });

  it("splits a partially served project into produced and still-to-build", () => {
    const [out] = adaptAir(
      [{
        id: "s4", total_sensors: 12, status: "3 delivered", certification_id: "c2",
        air_product_ids: Array(12).fill("w"),
      }] as never,
      NAMES,
      certDemand([["c2", { quantity: 20, byProduct: { "WELL ClAir": 20 } }]]),
    );
    expect(out.assigned).toBe(12);
    expect(out.requested).toBe(8);
    expect(out.assigned + out.requested).toBe(out.value);
    expect(out.well).toBe(12);
    expect(out.wellToProduce).toBe(8);
  });

  it("never reports negative demand when more was produced than requested", () => {
    const [out] = adaptAir(
      [{
        id: "s5", total_sensors: 30, status: "5 delivered", certification_id: "c3",
        air_product_ids: Array(30).fill("w"),
      }] as never,
      NAMES,
      certDemand([["c3", { quantity: 10, byProduct: { "WELL ClAir": 10 } }]]),
    );
    expect(out.assigned).toBe(30);
    expect(out.requested).toBe(0);
    expect(out.value).toBe(30);
  });

  it("splits each half by its own mix, not by a single shared source", () => {
    // Monitoring built LEED units; the request had asked for WELL. Each half
    // must keep its own typology instead of one overwriting the other.
    const [out] = adaptAir(
      [{
        id: "s6", total_sensors: 4, status: "1 delivered", certification_id: "c4",
        air_product_ids: Array(4).fill("l"),
      }] as never,
      NAMES,
      certDemand([["c4", { quantity: 10, byProduct: { "WELL ClAir": 10 } }]]),
    );
    expect(out.leed).toBe(4);
    expect(out.well).toBe(0);
    expect(out.wellToProduce).toBe(6);
    expect(out.leedToProduce).toBe(0);
  });

  it("leaves units with an unmappable product in Unassigned", () => {
    const [out] = adaptAir(
      [{ id: "s2", total_sensors: 4, air_product_ids: ["x"] }] as never,
      new Map([["x", "Mystery sensor"]]),
    );
    expect(out.unassigned).toBe(4);
    expect(out.typologySource).toBe("none");
  });
});

describe("energy: produced vs to produce", () => {
  it("counts produced from the physical inventory, not from the stored counters", () => {
    // site_energy_records counters are hand-maintained and drift: 801 declared
    // against 648 devices actually assigned, and 10 rows in status 'Active'
    // declare zero while holding 76 real pieces.
    const [out] = adaptEnergy([{
      id: "e1", site_id: "s1", handover_date: "2026-09-01", status: "Active",
      total_bridges: 0, no_pan10: 0, no_pan12: 0, no_pan14: 0, total_sensors: 0,
      produced_bridges: 1, produced_pan10: 6, produced_pan12: 4, produced_pan14: 0,
    }] as never);
    expect(out.assigned).toBe(11);
    expect(out.bridges).toBe(1);
    expect(out.pan10).toBe(6);
    expect(out.value).toBe(11);
  });

  it("turns an unserved request into a production order, by bucket", () => {
    const [out] = adaptEnergy(
      [{
        id: "e2", site_id: "s2", certification_id: "c1", handover_date: "2026-09-01",
        produced_bridges: 0, produced_pan10: 0, produced_pan12: 0, produced_pan14: 0,
      }] as never,
      new Map([["c1", { quantity: 16, byProduct: { "FGB-10": 15, "FGB Bridge LAN": 1 } }]]) as never,
    );
    expect(out.assigned).toBe(0);
    expect(out.requested).toBe(16);
    expect(out.pan10ToProduce).toBe(15);
    expect(out.bridgesToProduce).toBe(1);
    expect(out.value).toBe(16);
  });

  it("subtracts what already exists from the request", () => {
    const [out] = adaptEnergy(
      [{
        id: "e3", site_id: "s3", certification_id: "c2", handover_date: "2026-09-01",
        produced_bridges: 1, produced_pan10: 5, produced_pan12: 0, produced_pan14: 0,
      }] as never,
      new Map([["c2", { quantity: 10, byProduct: { "FGB-10": 10 } }]]) as never,
    );
    expect(out.assigned).toBe(6);
    expect(out.requested).toBe(4);
    expect(out.assigned + out.requested).toBe(out.value);
  });

  it("keeps unbucketed requests in the total via Other", () => {
    // Mango and Greeny have never had a column; dropping them would make the
    // breakdown stop adding up to the total.
    const [out] = adaptEnergy(
      [{
        id: "e4", site_id: "s4", certification_id: "c3", handover_date: "2026-09-01",
        produced_bridges: 0, produced_pan10: 0, produced_pan12: 0, produced_pan14: 0,
      }] as never,
      new Map([["c3", { quantity: 3, byProduct: { "Mango": 2, "FGB-12": 1 } }]]) as never,
    );
    expect(out.pan12ToProduce).toBe(1);
    expect(out.unassignedToProduce).toBe(2);
    expect(out.value).toBe(3);
  });

  it("counts devices outside the four buckets instead of dropping them", () => {
    // 7 Mango devices are assigned across 6 sites. Skipping unmapped types made
    // them vanish from the report rather than land in "Other".
    const [out] = adaptEnergy([{
      id: "e5", site_id: "s5", handover_date: "2026-09-01",
      produced_bridges: 1, produced_pan10: 2, produced_pan12: 0, produced_pan14: 0,
      produced_other: 1, produced_by_type: { "Bridge-LAN": 1, "FGB-10": 2, "Mango": 1 },
    }] as never);
    expect(out.assigned).toBe(4);
    expect(out.unassigned).toBe(1);
    expect(out.bridges + out.pan10 + out.pan12 + out.pan14 + (out.unassigned ?? 0)).toBe(out.value);
  });

  it("names the SKUs on both halves, as AIR does", () => {
    const [out] = adaptEnergy(
      [{
        id: "e6", site_id: "s6", certification_id: "c4", handover_date: "2026-09-01",
        produced_bridges: 1, produced_pan10: 0, produced_pan12: 0, produced_pan14: 0,
        produced_other: 0, produced_by_type: { "Bridge-LAN": 1 },
      }] as never,
      new Map([["c4", { quantity: 4, byProduct: { "FGB-12": 3 } }]]) as never,
    );
    // 1 built, 3 outstanding: the chips must describe what is left to build.
    expect(out.assigned).toBe(1);
    expect(out.requested).toBe(3);
    expect(out.byProduct).toEqual({ "Bridge-LAN": 1, "FGB-12": 3 });
  });

  it("flags a project nobody has described", () => {
    const [out] = adaptEnergy(
      [{
        id: "e7", site_id: "s7", certification_id: "c5", handover_date: "2026-09-01",
        produced_bridges: 0, produced_pan10: 0, produced_pan12: 0, produced_pan14: 0,
        produced_other: 0, produced_by_type: {},
      }] as never,
      new Map([["c5", { quantity: 2, byProduct: { "Mango": 2 } }]]) as never,
    );
    expect(out.typologySource).toBe("none");
    expect(out.unassignedToProduce).toBe(2);
  });

  it("maps both catalogue and inventory spellings to the same bucket", () => {
    expect(energyBucketFromName("Bridge-LAN")).toBe("bridges");
    expect(energyBucketFromName("FGB Bridge LAN")).toBe("bridges");
    expect(energyBucketFromName("Bridge-LTE")).toBe("bridges");
    expect(energyBucketFromName("FGB-10")).toBe("pan10");
    expect(energyBucketFromName("FGB-12")).toBe("pan12");
    expect(energyBucketFromName("FGB-14")).toBe("pan14");
    expect(energyBucketFromName("Mango")).toBeNull();
  });
});

describe("buildLabel", () => {
  it("concatenates CLIENT CITY Project", () => {
    expect(buildLabel("EQT", "Mirandola", "Minerva")).toBe("EQT MIRANDOLA Minerva");
  });

  it("skips missing parts and never repeats an already-prefixed name", () => {
    expect(buildLabel(null, "Milan", "Torre")).toBe("MILAN Torre");
    expect(buildLabel("EQT", "Mirandola", "EQT MIRANDOLA Minerva")).toBe("EQT MIRANDOLA Minerva");
  });
});

describe("typology attribution", () => {
  it("classifies the AIR product catalogue", () => {
    expect(typologyFromProductName("LEED ClAir")).toBe("leed");
    expect(typologyFromProductName("WELL ClAir black")).toBe("well");
    expect(typologyFromProductName("CO2 ClAir")).toBe("co2");
    expect(typologyFromProductName("CO2 ClAir black")).toBe("co2");
    expect(typologyFromProductName("Unknown sensor")).toBeNull();
  });

  it("keeps CO-CO2 out of the CO2 family — it is a different sensor", () => {
    expect(typologyFromProductName("CO-CO2 ClAir")).toBe("coco2");
    expect(typologyFromProductName("CO-CO2 ClAir black")).toBe("coco2");
  });

  it("reads air_product_ids as a multiset, not a set", () => {
    const names = new Map([["a", "WELL ClAir"], ["b", "LEED ClAir"]]);
    // 3 WELL + 1 LEED — the old Set-based code saw "one WELL, one LEED".
    expect(countTypologies(["a", "a", "a", "b"], names)).toEqual({ leed: 1, well: 3, co2: 0, coco2: 0 });
  });

  it("keeps quantities verbatim when the multiset covers every device", () => {
    expect(splitByTypology(4, { leed: 1, well: 3, co2: 0, coco2: 0 })).toEqual({
      leed: 1, well: 3, co2: 0, coco2: 0, unassigned: 0,
    });
  });

  it("scales proportionally and never drifts from the control total", () => {
    const split = splitByTypology(10, { leed: 1, well: 3, co2: 0, coco2: 0 });
    expect(split.leed + split.well + split.co2 + split.coco2).toBe(10);
    expect(split.well).toBeGreaterThan(split.leed);
    expect(split.unassigned).toBe(0);
  });

  it("does not invent a typology when none is known", () => {
    expect(splitByTypology(7, { leed: 0, well: 0, co2: 0, coco2: 0 })).toEqual({
      leed: 0, well: 0, co2: 0, coco2: 0, unassigned: 7,
    });
  });
});

describe("horizon buckets", () => {
  it("uses calendar quarters, not rolling windows", () => {
    expect(bucketOf(new Date(2026, 8, 30), NOW)).toBe("current"); // 30 Sep → Q3
    expect(bucketOf(new Date(2026, 9, 1), NOW)).toBe("next");     // 1 Oct  → Q4
    expect(bucketOf(new Date(2027, 0, 15), NOW)).toBe("long");
  });

  it("separates overdue from the current quarter", () => {
    // Same quarter as today, but already past: must be hideable on its own.
    expect(bucketOf(new Date(2026, 6, 10), NOW)).toBe("past");
  });

  it("parks undated records instead of dating them today", () => {
    expect(bucketOf(null, NOW)).toBe("tbd");
  });
});

describe("reading resolution", () => {
  it("shows exact days up to one month out", () => {
    expect(granularityOf(new Date(2026, 7, 20), NOW)).toBe("day");
    expect(granularityOf(new Date(2026, 8, 4), NOW)).toBe("day");
  });

  it("groups by month from one month out to the end of the next quarter", () => {
    expect(granularityOf(new Date(2026, 8, 20), NOW)).toBe("month");
    expect(granularityOf(new Date(2026, 10, 15), NOW)).toBe("month");
  });

  it("drops to 6-month blocks beyond the next quarter", () => {
    expect(granularityOf(new Date(2027, 4, 1), NOW)).toBe("half");
  });
});

describe("buildPivotTree", () => {
  const records = [
    rec({ date: new Date(2026, 7, 20), value: 10, assigned: 10, bridges: 2, pan10: 8 }),
    rec({ date: new Date(2026, 8, 20), value: 5, assigned: 5, bridges: 1, pan10: 4 }),
    rec({ date: new Date(2026, 6, 10), value: 3, assigned: 3, bridges: 1 }),
    rec({ date: null, value: 7, requested: 7 }),
  ];

  it("orders bands overdue → current → next → long → tbd", () => {
    const tree = buildPivotTree(records, { now: NOW });
    expect(tree.map((p) => p.bucket)).toEqual(["past", "current", "current", "tbd"]);
  });

  it("hides past periods on request without touching the others", () => {
    const tree = buildPivotTree(records, { now: NOW, hidePast: true });
    expect(tree.some((p) => p.bucket === "past")).toBe(false);
    expect(bucketTotals(tree).current.value).toBe(15);
  });

  it("keeps day and month nodes of the same month in chronological order", () => {
    // 4 Sep is inside the 1-month window (day node), 20 Sep is not (month node).
    const mixed = [
      rec({ date: new Date(2026, 8, 20), value: 5 }),
      rec({ date: new Date(2026, 8, 4), value: 2 }),
    ];
    const tree = buildPivotTree(mixed, { now: NOW });
    expect(tree.map((p) => p.granularity)).toEqual(["day", "month"]);
  });

  it("keeps the exact handover date on month-grouped rows", () => {
    const tree = buildPivotTree(records, { now: NOW });
    const september = tree.find((p) => p.granularity === "month" && p.bucket === "current");
    expect(september?.regions[0].projects[0].dates).toEqual(["20/09/2026"]);
  });

  it("rolls the hardware breakdown up to the band, not just the total", () => {
    const totals = bucketTotals(buildPivotTree(records, { now: NOW }));
    expect(totals.current.bridges).toBe(3);
    expect(totals.current.pan10).toBe(12);
    expect(totals.tbd.requested).toBe(7);
  });

  it("shifts planning dates by the on-site lead time", () => {
    // 2 Oct handover − 15 days = 17 Sep, i.e. it moves back into Q3.
    const late = [rec({ date: new Date(2026, 9, 2), value: 4, assigned: 4 })];
    expect(buildPivotTree(late, { now: NOW })[0].bucket).toBe("next");
    expect(buildPivotTree(late, { now: NOW, offsetDays: 15 })[0].bucket).toBe("current");
  });
});

describe("cancelled projects", () => {
  it("recognises both spellings and the aggregate form", () => {
    expect(isCancelledStatus("Cancelled")).toBe(true);
    expect(isCancelledStatus("canceled")).toBe(true);
    expect(isCancelledStatus("2 Cancelled")).toBe(true);
    expect(isCancelledStatus("Upcoming")).toBe(false);
    expect(isCancelledStatus(null)).toBe(false);
  });

  it("collapses to one filter entry and never reads as Requested", () => {
    // "cancelled" contains no ladder keyword, so without the early check it
    // would fall through to the pass-through branch and split the dropdown in
    // two — "Cancelled" and "canceled" as separate statuses.
    expect(canonicalStatusLabel("canceled")).toBe("Cancelled");
    expect(canonicalStatusLabel("Cancelled")).toBe("Cancelled");
  });

  it("contributes zero even when the record still declares sensors", () => {
    const [out] = adaptAir(
      [{ id: "s1", status: "Cancelled", total_sensors: 24, air_product_ids: ["wb"] }] as never,
      new Map([["wb", "WELL ClAir black"]]),
    );
    expect(out.value).toBe(0);
    expect(out.assigned).toBe(0);
    expect(out.requested).toBe(0);
    expect(out.well).toBe(0);
    expect(out.wellToProduce).toBe(0);
    expect(out.unassigned).toBe(0);
    expect(out.typologySource).toBe("none");
  });

  it("contributes zero even when allocations still ask for units", () => {
    // The half that mattered for Boxengo Famagosta: total_sensors was not the
    // only source of demand — project_allocations kept asking through
    // useRequestedDemand, so zeroing the record alone was not enough.
    const [out] = adaptAir(
      [{ id: "s1", status: "Cancelled", total_sensors: 0, air_product_ids: [] }] as never,
      new Map(),
      siteDemand([["s1", { quantity: 24, byProduct: { "WELL ClAir black": 24 } }]]),
    );
    expect(out.value).toBe(0);
    expect(out.requested).toBe(0);
    expect(out.wellToProduce).toBe(0);
  });

  it("keeps the row itself, so a cancelled project stays readable", () => {
    // The whole point of not deleting: the project must still be findable, with
    // its notes carrying what it would have needed.
    const [out] = adaptAir(
      [{
        id: "s1", status: "Cancelled", total_sensors: 0, air_product_ids: [],
        project_name: "Boxengo Famagosta", city: "Milan", brand_name: "BOXENGO",
        notes: "consegna sospesa - [Cancellato: 24 sensori previsti]",
      }] as never,
      new Map(),
    );
    expect(out.projectName).toBe("BOXENGO MILAN Boxengo Famagosta");
    expect(out.status).toBe("Cancelled");
    expect(out.note).toContain("24 sensori previsti");
  });

  it("leaves a live project untouched", () => {
    const [out] = adaptAir(
      [{ id: "s1", status: "Upcoming", total_sensors: 0, air_product_ids: [] }] as never,
      new Map(),
      siteDemand([["s1", { quantity: 24, byProduct: { "WELL ClAir black": 24 } }]]),
    );
    expect(out.requested).toBe(24);
    expect(out.wellToProduce).toBe(24);
  });
});

describe("quarterTotals", () => {
  it("stays exact regardless of the reading resolution", () => {
    const records = [
      rec({ date: new Date(2026, 7, 20), value: 10 }),
      rec({ date: new Date(2026, 8, 20), value: 5 }),
      rec({ date: new Date(2026, 9, 1), value: 4 }),
    ];
    const q = quarterTotals(records);
    expect(q.get("2026-Q3")?.value).toBe(15);
    expect(q.get("2026-Q4")?.value).toBe(4);
  });
});
