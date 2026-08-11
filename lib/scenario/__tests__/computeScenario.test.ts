import { describe, expect, it } from "vitest";
import {
  buildLandedCost,
  dec,
  priceManufacturerSale,
  requiredSrpForContribution,
} from "@/lib/pricing-engine";
import { DEMO_ASSUMPTIONS } from "../assumptions";
import { computeScenario } from "../computeScenario";

describe("computeScenario — screen composition layer", () => {
  it("computes the demo product end to end, matching direct engine calls", () => {
    const result = computeScenario(DEMO_ASSUMPTIONS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const s = result.scenario;

    // Manufacturer & landed cost match the engine directly.
    const manufacturer = priceManufacturerSale({
      cogsPerUnit: "3.65",
      marginSpec: { basis: "margin", rate: "0.20" },
    });
    expect(s.manufacturer.sellPricePerUnit.equals(manufacturer.sellPricePerUnit)).toBe(true);
    const landed = buildLandedCost({
      purchasePricePerUnit: manufacturer.sellPricePerUnit,
      costLines: [
        { name: "International Freight", amount: "0.35", basis: "perUnit", owner: "brand" },
        { name: "Tariff", amount: "0.15", basis: "percentOfCustomsValue", owner: "brand" },
        { name: "Domestic Freight", amount: "0.25", basis: "perUnit", owner: "brand" },
      ],
      context: { customsValuePerUnit: manufacturer.sellPricePerUnit },
    });
    expect(s.landed.landedCostPerUnit.equals(landed.landedCostPerUnit)).toBe(true);
    expect(s.landed.landedCostPerUnit.equals("5.846875")).toBe(true);

    // §99 seed: calendar mode prices the BOGO+OI plan to ≈9.48% + 2% reserve.
    expect(s.tradeSpend.mode).toBe("calendar");
    expect(s.tradeSpend.plan?.totalPromotionSpend.equals("5.5")).toBe(true);
    expect(s.tradeSpend.promotionalRate.toDecimalPlaces(6).equals("0.094828")).toBe(true);
    expect(s.tradeSpend.totalRate.toDecimalPlaces(6).equals("0.114828")).toBe(true);

    // Required SRP matches a direct engine composition with the same inputs.
    const required = requiredSrpForContribution({
      landedCostPerUnit: landed.landedCostPerUnit,
      targetContributionRate: "0.08",
      tradeSpendRate: s.tradeSpend.totalRate,
      revenueDeductions: [{ name: "Deductions", amount: "0.02", basis: "percentOfInvoice", owner: "brand" }],
      variableCosts: [{ name: "Broker Commission", amount: "0.05", basis: "percentOfInvoice", owner: "brand" }],
      distributor: {
        marginSpec: { basis: "margin", rate: "0.15" },
        fees: [{ name: "Distributor Handling", amount: "0.50", basis: "perUnit", owner: "distributor" }],
      },
      retailerMarginSpec: { basis: "margin", rate: "0.48" },
    });
    expect(s.requiredSrpPerUnit.toDecimalPlaces(20).equals(required.requiredSrpPerUnit.toDecimalPlaces(20))).toBe(true);
    expect(s.requiredInvoicePerUnit.toDecimalPlaces(20).equals(required.requiredInvoicePerUnit.toDecimalPlaces(20))).toBe(true);

    // The demo shelf price sits above the requirement → healthy model.
    expect(dec(DEMO_ASSUMPTIONS.currentSrpPerUnit).greaterThan(s.requiredSrpPerUnit)).toBe(true);
    expect(s.atCurrentSrp).toBeDefined();
    expect(s.atCurrentSrp!.contribution.contributionMarginRate.greaterThan("0.08")).toBe(true);
    expect(s.priceGap?.exceedsSupportedCost).toBe(false);

    // Screen furniture: waterfall stages, traces, advisor, validation.
    expect(s.waterfall.map((stage) => stage.id)).toEqual([
      "cogs", "manufacturer-price", "landed", "invoice", "retailer-cost", "srp",
    ]);
    for (const stage of s.waterfall.slice(1)) {
      expect(stage.trace).toBeDefined();
      expect(stage.delta).toBeDefined();
    }
    expect(s.insights.filter((i) => i.priority === "critical")).toEqual([]);
    expect(s.warnings).toEqual([]);
  });

  it("drops the distributor stage on a direct route (PRD §3E, §12)", () => {
    const result = computeScenario({ ...DEMO_ASSUMPTIONS, useDistributor: false });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scenario.waterfall.map((stage) => stage.id)).toEqual([
      "cogs", "manufacturer-price", "landed", "invoice", "srp",
    ]);
    // Direct route requires a lower SRP than the distributor route.
    const withDistributor = computeScenario(DEMO_ASSUMPTIONS);
    if (!withDistributor.ok) throw new Error("unexpected");
    expect(
      result.scenario.requiredSrpPerUnit.lessThan(withDistributor.scenario.requiredSrpPerUnit),
    ).toBe(true);
  });

  it("returns a readable error instead of throwing on bad input", () => {
    const result = computeScenario({ ...DEMO_ASSUMPTIONS, cogsPerUnit: "abc" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/cogsPerUnit/);

    const infeasible = computeScenario({ ...DEMO_ASSUMPTIONS, retailerMarginRate: "1.2" });
    expect(infeasible.ok).toBe(false);
  });

  it("an empty current SRP disables shelf-anchored outputs without failing", () => {
    const result = computeScenario({ ...DEMO_ASSUMPTIONS, currentSrpPerUnit: "" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scenario.atCurrentSrp).toBeUndefined();
    expect(result.scenario.priceGap).toBeUndefined();
    expect(result.scenario.dollarAllocation).toBeUndefined();
    expect(result.scenario.improvement).toBeUndefined();
    expect(result.scenario.requiredSrpPerUnit).toBeDefined();
  });

  it("the §43 dollar allocation sums exactly to the shelf price", () => {
    const result = computeScenario(DEMO_ASSUMPTIONS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const allocation = result.scenario.dollarAllocation!;
    const total = allocation.reduce((sum, slice) => sum.plus(slice.amount), dec(0));
    expect(total.toDecimalPlaces(25).equals(dec("19.99").toDecimalPlaces(25))).toBe(true);
    const shareTotal = allocation.reduce((sum, slice) => sum.plus(slice.share), dec(0));
    expect(shareTotal.toDecimalPlaces(20).equals("1")).toBe(true);
    expect(allocation.map((slice) => slice.id)).toContain("distributor");
  });

  it("improvement levers accompany a struggling shelf price (§73)", () => {
    const result = computeScenario({ ...DEMO_ASSUMPTIONS, currentSrpPerUnit: "17.50" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scenario.improvement?.alreadyOnTarget).toBe(false);
    expect(result.scenario.improvement?.levers.length).toBeGreaterThanOrEqual(4);
    // Healthy demo shelf price reports on-target with no levers.
    const healthy = computeScenario(DEMO_ASSUMPTIONS);
    if (!healthy.ok) throw new Error("unexpected");
    expect(healthy.scenario.improvement?.alreadyOnTarget).toBe(true);
    expect(healthy.scenario.improvement?.levers).toEqual([]);
  });
});
