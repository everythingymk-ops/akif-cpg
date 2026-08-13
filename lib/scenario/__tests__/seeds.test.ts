import { describe, expect, it } from "vitest";
import {
  EXAMPLE_DISTRIBUTOR_PROFILES,
  EXAMPLE_PROFILES_SEED,
  EXAMPLE_RETAILER_PROFILES,
  mergeSeedRecords,
  needsSeed,
} from "../seeds";

describe("needsSeed", () => {
  it("is true for a workspace that never received the bundle", () => {
    expect(needsSeed([], EXAMPLE_PROFILES_SEED)).toBe(true);
    expect(needsSeed(undefined, EXAMPLE_PROFILES_SEED)).toBe(true);
  });

  it("is false once the bundle id is recorded", () => {
    expect(needsSeed([EXAMPLE_PROFILES_SEED], EXAMPLE_PROFILES_SEED)).toBe(false);
  });

  it("ignores unrelated bundle ids", () => {
    expect(needsSeed(["some-other-bundle"], EXAMPLE_PROFILES_SEED)).toBe(true);
  });
});

describe("mergeSeedRecords", () => {
  const seeds = [
    { id: "a", value: "seed-a" },
    { id: "b", value: "seed-b" },
  ];

  it("appends every seed to an empty workspace, in bundle order", () => {
    expect(mergeSeedRecords([], seeds)).toEqual(seeds);
  });

  it("keeps existing records first and appends only the missing seeds", () => {
    const existing = [{ id: "mine", value: "user" }];
    expect(mergeSeedRecords(existing, seeds)).toEqual([
      { id: "mine", value: "user" },
      { id: "a", value: "seed-a" },
      { id: "b", value: "seed-b" },
    ]);
  });

  it("never overwrites an edited record that shares a seed id", () => {
    const existing = [{ id: "a", value: "user-edited" }];
    expect(mergeSeedRecords(existing, seeds)).toEqual([
      { id: "a", value: "user-edited" },
      { id: "b", value: "seed-b" },
    ]);
  });

  it("does not mutate its inputs", () => {
    const existing = [{ id: "mine", value: "user" }];
    mergeSeedRecords(existing, seeds);
    expect(existing).toHaveLength(1);
    expect(seeds).toHaveLength(2);
  });
});

describe("example profile bundle", () => {
  it("has unique ids across both lists", () => {
    const ids = [
      ...EXAMPLE_RETAILER_PROFILES.map((p) => p.id),
      ...EXAMPLE_DISTRIBUTOR_PROFILES.map((p) => p.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("points every retailer's default distributor at a distributor in the bundle", () => {
    const distributorIds = new Set(EXAMPLE_DISTRIBUTOR_PROFILES.map((p) => p.id));
    for (const retailer of EXAMPLE_RETAILER_PROFILES) {
      if (retailer.defaultDistributorProfileId === "") continue; // direct relationship
      expect(distributorIds).toContain(retailer.defaultDistributorProfileId);
    }
  });

  it("marks every record as an example, in the name and in the notes", () => {
    for (const profile of [...EXAMPLE_RETAILER_PROFILES, ...EXAMPLE_DISTRIBUTOR_PROFILES]) {
      expect(profile.name).toContain("(example)");
      expect(profile.notes).toMatch(/example profile/i);
    }
  });

  it("stores every rate as a decimal fraction below 1", () => {
    for (const retailer of EXAMPLE_RETAILER_PROFILES) {
      const rates = [
        retailer.retailerMarginRate,
        retailer.brokerRate,
        retailer.deductionsRate,
        retailer.tradeSpendRate,
      ].filter((rate) => rate !== "");
      for (const rate of rates) expect(Number(rate)).toBeGreaterThan(0);
      for (const rate of rates) expect(Number(rate)).toBeLessThan(1);
    }
    for (const distributor of EXAMPLE_DISTRIBUTOR_PROFILES) {
      expect(Number(distributor.marginRate)).toBeGreaterThan(0);
      expect(Number(distributor.marginRate)).toBeLessThan(1);
    }
  });

  it("spans thin club margins through rich natural-channel margins", () => {
    const margins = EXAMPLE_RETAILER_PROFILES.map((p) => Number(p.retailerMarginRate));
    expect(Math.min(...margins)).toBeLessThanOrEqual(0.15);
    expect(Math.max(...margins)).toBeGreaterThanOrEqual(0.42);
  });
});
