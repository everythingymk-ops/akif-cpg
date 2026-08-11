import { describe, expect, it } from "vitest";
import type { Promotion } from "../tradeSpend";
import { validateModel } from "../validation";

const codes = (warnings: { code: string }[]) => warnings.map((w) => w.code);

const promo = (partial: Partial<Promotion>): Promotion => ({
  name: "Promo",
  type: "tpr",
  weeks: 4,
  discountRate: "0.10",
  brandFundingRate: 1,
  salesLift: "1.5",
  ...partial,
});

describe("validateModel — PRD §71", () => {
  it("returns no warnings for a healthy model", () => {
    const warnings = validateModel({
      retailerMarginSpec: { basis: "margin", rate: "0.48" },
      distributorSelected: true,
      distributorMarginSpec: { basis: "margin", rate: "0.15" },
      tradeSpendRate: "0.115",
      costLines: [{ name: "Freight", amount: "0.35", basis: "perUnit", owner: "brand" }],
      promotions: [promo({ weeks: 12 })],
      contributionPerUnit: "1.03",
      targetSrpPerUnit: "19.99",
      breakEvenSrpPerUnit: "17.50",
      annualUnits: 100000,
      isImported: true,
      landedCostLines: [{ name: "Tariff", amount: "0.15", basis: "percentOfCustomsValue", owner: "brand" }],
      manufacturerMarginSpec: { basis: "margin", rate: "0.20" },
      manufacturingCogsPerUnit: "3.65",
    });
    expect(warnings).toEqual([]);
  });

  it("flags margin-basis rates at or above 100% — but not markups", () => {
    const warnings = validateModel({
      retailerMarginSpec: { basis: "margin", rate: 1 },
      distributorMarginSpec: { basis: "margin", rate: "1.2" },
    });
    expect(codes(warnings)).toEqual(["retailer-margin-too-high", "distributor-margin-too-high"]);
    expect(validateModel({ retailerMarginSpec: { basis: "markup", rate: "1.5" } })).toEqual([]);
  });

  it("flags trade spend at or above 100%", () => {
    expect(codes(validateModel({ tradeSpendRate: 1 }))).toEqual(["trade-spend-too-high"]);
  });

  it("flags negative cost lines, with a freight-specific code", () => {
    const warnings = validateModel({
      costLines: [
        { name: "International Freight", amount: "-0.35", basis: "perUnit", owner: "brand" },
        { name: "Slotting", amount: -100, basis: "annual", owner: "brand" },
      ],
      annualUnits: 1000,
    });
    expect(codes(warnings)).toEqual(["negative-freight", "negative-cost"]);
    expect(warnings[0].message).toContain("International Freight");
  });

  it("flags promotional weeks exceeding the planning year", () => {
    const warnings = validateModel({
      promotions: [promo({ weeks: 30 }), promo({ name: "Promo B", weeks: 30 })],
    });
    expect(codes(warnings)).toEqual(["promo-weeks-exceed-year"]);
  });

  it("flags overlapping promotion dates and ignores promotions without dates", () => {
    const overlapping = validateModel({
      promotions: [
        promo({ name: "TPR April", startDate: "2026-04-01", endDate: "2026-04-28" }),
        promo({ name: "OI Spring", startDate: "2026-04-20", endDate: "2026-05-10" }),
      ],
    });
    expect(codes(overlapping)).toEqual(["promotion-overlap"]);
    expect(overlapping[0].message).toContain("TPR April");

    const clean = validateModel({
      promotions: [
        promo({ name: "A", startDate: "2026-04-01", endDate: "2026-04-14" }),
        promo({ name: "B", startDate: "2026-05-01", endDate: "2026-05-14" }),
        promo({ name: "No dates" }),
      ],
    });
    expect(clean).toEqual([]);
  });

  it("flags negative contribution and a target SRP below break-even", () => {
    const warnings = validateModel({
      contributionPerUnit: "-0.20",
      targetSrpPerUnit: "17.99",
      breakEvenSrpPerUnit: "18.50",
    });
    expect(codes(warnings)).toEqual(["negative-contribution", "target-srp-below-break-even"]);
  });

  it("flags fixed costs without an annual volume", () => {
    const viaPromo = validateModel({
      promotions: [promo({ fixedEventFee: 2000, events: 1 })],
    });
    expect(codes(viaPromo)).toEqual(["fixed-costs-without-volume"]);

    const viaAnnualLine = validateModel({
      costLines: [{ name: "Slotting", amount: 25000, basis: "annual", owner: "brand" }],
    });
    expect(codes(viaAnnualLine)).toEqual(["fixed-costs-without-volume"]);

    const withVolume = validateModel({
      promotions: [promo({ fixedEventFee: 2000, events: 1 })],
      annualUnits: 100000,
    });
    expect(withVolume).toEqual([]);
  });

  it("flags structural gaps: distributor margin, import costs, manufacturing COGS", () => {
    expect(codes(validateModel({ distributorSelected: true }))).toEqual(["distributor-margin-missing"]);
    expect(codes(validateModel({ isImported: true }))).toEqual(["import-costs-missing"]);
    expect(codes(validateModel({ manufacturerMarginSpec: { basis: "margin", rate: "0.2" } }))).toEqual([
      "manufacturer-margin-without-cogs",
    ]);
  });

  it("never throws on malformed values", () => {
    expect(() =>
      validateModel({
        tradeSpendRate: "not-a-number",
        contributionPerUnit: "??",
        costLines: [{ name: "Weird", amount: "abc", basis: "perUnit", owner: "brand" }],
      }),
    ).not.toThrow();
  });
});
