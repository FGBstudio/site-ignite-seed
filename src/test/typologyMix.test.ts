import { describe, it, expect } from "vitest";
import { toProductCounts, toMultiset } from "@/components/projects/AirMonitoring/TypologyMixEditor";
import { countTypologies, splitByTypology } from "@/lib/monitorPivot";

const LEED = "11111111-1111-1111-1111-111111111111";
const WELL = "22222222-2222-2222-2222-222222222222";

const NAMES = new Map([
  [LEED, "LEED ClAir"],
  [WELL, "WELL ClAir"],
]);

describe("typology mix round-trip", () => {
  it("reads a multiset back as quantities", () => {
    expect(toProductCounts([WELL, WELL, WELL, LEED])).toEqual({ [WELL]: 3, [LEED]: 1 });
  });

  it("writes quantities back as a multiset", () => {
    expect(toMultiset({ [WELL]: 2, [LEED]: 1 })).toEqual([WELL, WELL, LEED]);
  });

  it("drops zero and negative quantities", () => {
    expect(toMultiset({ [WELL]: 0, [LEED]: -3 })).toEqual([]);
  });

  it("survives a full edit round-trip", () => {
    const original = [WELL, WELL, LEED];
    expect(toMultiset(toProductCounts(original)).sort()).toEqual([...original].sort());
  });

  it("feeds the report split with the real mix", () => {
    // The case the single-select could not express: 10 WELL + 5 LEED.
    const ids = toMultiset({ [WELL]: 10, [LEED]: 5 });
    const counts = countTypologies(ids, NAMES);
    expect(counts).toEqual({ leed: 5, well: 10, co2: 0, coco2: 0 });
    expect(splitByTypology(15, counts)).toEqual({ leed: 5, well: 10, co2: 0, coco2: 0, unassigned: 0 });
  });
});
