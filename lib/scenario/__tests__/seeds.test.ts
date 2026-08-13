import { describe, expect, it } from "vitest";
import { computeScenario } from "../computeScenario";
import { effectiveCogsPerUnit } from "../product";
import {
  EXAMPLE_DISTRIBUTOR_PROFILES,
  EXAMPLE_GODIVA_SEED,
  EXAMPLE_PROFILES_SEED,
  EXAMPLE_RETAILER_PROFILES,
  GODIVA_PRODUCT,
  GODIVA_SCENARIO,
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

describe("Godiva example product", () => {
  it("is a bundle of its own, so profiles and product deliver independently", () => {
    expect(EXAMPLE_GODIVA_SEED).not.toBe(EXAMPLE_PROFILES_SEED);
  });

  it("sums its detailed COGS components to $1.48", () => {
    expect(effectiveCogsPerUnit(GODIVA_PRODUCT)).toBe("1.48");
  });

  it("carries a logo data URL inside the storage budget", () => {
    expect(GODIVA_PRODUCT.logoDataUrl).toMatch(/^data:image\/(webp|png);base64,/);
    expect(GODIVA_PRODUCT.logoDataUrl!.length).toBeLessThanOrEqual(64 * 1024);
  });

  it("ships a Base scenario bound to the product", () => {
    expect(GODIVA_SCENARIO.productId).toBe(GODIVA_PRODUCT.id);
    expect(GODIVA_SCENARIO.name).toBe("Base");
    expect(GODIVA_SCENARIO.history).toEqual([]);
  });

  /**
   * These are the figures printed in docs/Akif-CPG-Ornek-Rehber-Godiva-Sticks.pdf.
   * If this test fails, the seed changed and the guide is now wrong — update
   * both together (re-shoot the screenshots, rebuild the PDF).
   */
  it("reproduces the figures the printed guide is built on", () => {
    const result = computeScenario(GODIVA_SCENARIO.assumptions);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { scenario } = result;

    expect(scenario.landed.landedCostPerUnit.toFixed(2)).toBe("2.19");
    expect(scenario.requiredInvoicePerUnit.toFixed(2)).toBe("3.29");
    expect(scenario.requiredSrpPerUnit.toFixed(2)).toBe("6.51");
    expect(scenario.tradeSpend.totalRate.times(100).toFixed(2)).toBe("9.12");
    expect(scenario.atCurrentSrp).toBeDefined();
    expect(scenario.atCurrentSrp!.contribution.contributionMarginRate.times(100).toFixed(1)).toBe(
      "15.4",
    );
  });

  it("opens below its contribution target, which is what makes it a teaching example", () => {
    const result = computeScenario(GODIVA_SCENARIO.assumptions);
    if (!result.ok) throw new Error(result.error);
    const target = Number(GODIVA_SCENARIO.assumptions.targetContributionRate);
    const actual = result.scenario.atCurrentSrp!.contribution.contributionMarginRate.toNumber();
    expect(actual).toBeLessThan(target);
    expect(result.scenario.improvement).toBeDefined();
  });

  it("marks itself as an example without hiding the brand identity", () => {
    expect(GODIVA_PRODUCT.basics.name).toContain("(example)");
    expect(GODIVA_PRODUCT.basics.brand).toBe("Godiva");
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
