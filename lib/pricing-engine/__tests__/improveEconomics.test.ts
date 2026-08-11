import { describe, expect, it } from "vitest";
import { computeContribution } from "../contribution";
import {
  computeImprovementLevers,
  requiredTradeSpendRateForContribution,
  type ImprovementInput,
} from "../improveEconomics";
import { impliedBrandInvoiceAtShelf, reversePriceFromShelf } from "../reversePricing";
import type { CostLine, MarginSpec } from "../types";

const deductions: CostLine[] = [
  { name: "Deductions", amount: "0.02", basis: "percentOfInvoice", owner: "brand" },
];
const variables: CostLine[] = [
  { name: "Broker", amount: "0.05", basis: "percentOfInvoice", owner: "brand" },
  { name: "Royalty", amount: "0.01", basis: "percentOfNetSales", owner: "brand" },
];
const distributor = {
  marginSpec: { basis: "margin", rate: "0.15" } as MarginSpec,
  fees: [{ name: "Handling", amount: "0.50", basis: "perUnit", owner: "distributor" }] as CostLine[],
};
const retailerMarginSpec: MarginSpec = { basis: "margin", rate: "0.48" };

// A model that misses its 10% target at the current $17.50 shelf price.
const strugglingInput: ImprovementInput = {
  landedCostPerUnit: "5.846875",
  targetContributionRate: "0.10",
  currentSrpPerUnit: "17.50",
  tradeSpendRate: "0.1148",
  revenueDeductions: deductions,
  variableCosts: variables,
  distributor,
  retailerMarginSpec,
};

const leverById = (result: ReturnType<typeof computeImprovementLevers>, id: string) =>
  result.levers.find((lever) => lever.id === id);

describe("requiredTradeSpendRateForContribution", () => {
  it("applying the solved rate reaches the target contribution exactly", () => {
    const implied = impliedBrandInvoiceAtShelf({
      srpPerUnit: "17.50",
      retailerMarginSpec,
      distributor,
    });
    const rate = requiredTradeSpendRateForContribution({
      brandInvoicePricePerUnit: implied.brandInvoicePerUnit,
      landedCostPerUnit: "5.846875",
      targetContributionRate: "0.10",
      revenueDeductions: deductions,
      variableCosts: variables,
    });
    const check = computeContribution({
      brandInvoicePricePerUnit: implied.brandInvoicePerUnit,
      tradeSpendRate: rate,
      revenueDeductions: deductions,
      landedCostPerUnit: "5.846875",
      variableCosts: variables,
    });
    expect(check.contributionMarginRate.toDecimalPlaces(30).equals("0.1")).toBe(true);
  });
});

describe("computeImprovementLevers — PRD §73", () => {
  it("reports the gap and produces all five levers for a distributor model", () => {
    const result = computeImprovementLevers(strugglingInput);
    expect(result.alreadyOnTarget).toBe(false);
    expect(result.gapToTarget.greaterThan(0)).toBe(true);
    expect(result.levers.map((lever) => lever.id)).toEqual([
      "increase-srp",
      "reduce-landed-cost",
      "reduce-trade-spend",
      "reduce-retailer-margin",
      "sell-direct",
    ]);
  });

  it("increase-srp lever equals the required SRP for the target", () => {
    const result = computeImprovementLevers(strugglingInput);
    const lever = leverById(result, "increase-srp")!;
    expect(lever.requiredValue.equals(result.requiredSrpPerUnit)).toBe(true);
    // Round-trip: at the required SRP the model hits the target exactly.
    const implied = impliedBrandInvoiceAtShelf({
      srpPerUnit: lever.requiredValue,
      retailerMarginSpec,
      distributor,
    });
    const check = computeContribution({
      brandInvoicePricePerUnit: implied.brandInvoicePerUnit,
      tradeSpendRate: "0.1148",
      revenueDeductions: deductions,
      landedCostPerUnit: "5.846875",
      variableCosts: variables,
    });
    expect(check.contributionMarginRate.toDecimalPlaces(25).equals("0.1")).toBe(true);
  });

  it("reduce-landed-cost lever equals the zero-gap reverse solve and round-trips", () => {
    const result = computeImprovementLevers(strugglingInput);
    const lever = leverById(result, "reduce-landed-cost")!;
    const reverse = reversePriceFromShelf({
      targetSrpPerUnit: "17.50",
      retailerMarginSpec,
      distributor,
      targetContributionRate: "0.10",
      tradeSpendRate: "0.1148",
      revenueDeductions: deductions,
      variableCosts: variables,
    });
    expect(lever.requiredValue.equals(reverse.maxLandedCostPerUnit)).toBe(true);

    const implied = impliedBrandInvoiceAtShelf({ srpPerUnit: "17.50", retailerMarginSpec, distributor });
    const check = computeContribution({
      brandInvoicePricePerUnit: implied.brandInvoicePerUnit,
      tradeSpendRate: "0.1148",
      revenueDeductions: deductions,
      landedCostPerUnit: lever.requiredValue,
      variableCosts: variables,
    });
    expect(check.contributionMarginRate.toDecimalPlaces(25).equals("0.1")).toBe(true);
  });

  it("reduce-retailer-margin lever round-trips through the full chain", () => {
    const result = computeImprovementLevers(strugglingInput);
    const lever = leverById(result, "reduce-retailer-margin")!;
    expect(lever.feasible).toBe(true);
    const implied = impliedBrandInvoiceAtShelf({
      srpPerUnit: "17.50",
      retailerMarginSpec: { basis: "margin", rate: lever.requiredValue },
      distributor,
    });
    const check = computeContribution({
      brandInvoicePricePerUnit: implied.brandInvoicePerUnit,
      tradeSpendRate: "0.1148",
      revenueDeductions: deductions,
      landedCostPerUnit: "5.846875",
      variableCosts: variables,
    });
    expect(check.contributionMarginRate.toDecimalPlaces(25).equals("0.1")).toBe(true);
  });

  it("sell-direct lever quantifies the distributor-free margin", () => {
    const result = computeImprovementLevers(strugglingInput);
    const lever = leverById(result, "sell-direct")!;
    const directImplied = impliedBrandInvoiceAtShelf({ srpPerUnit: "17.50", retailerMarginSpec });
    const direct = computeContribution({
      brandInvoicePricePerUnit: directImplied.brandInvoicePerUnit,
      tradeSpendRate: "0.1148",
      revenueDeductions: deductions,
      landedCostPerUnit: "5.846875",
      variableCosts: variables,
    });
    expect(lever.requiredValue.toDecimalPlaces(25).equals(direct.contributionMarginRate.toDecimalPlaces(25))).toBe(true);
    expect(lever.feasible).toBe(direct.contributionMarginRate.greaterThanOrEqualTo("0.10"));
  });

  it("an on-target model returns no levers", () => {
    const result = computeImprovementLevers({ ...strugglingInput, currentSrpPerUnit: "25" });
    expect(result.alreadyOnTarget).toBe(true);
    expect(result.levers).toEqual([]);
  });

  it("marks infeasible trade-spend levers instead of hiding them", () => {
    // Tiny trade spend cannot be reduced enough to bridge a huge gap.
    const result = computeImprovementLevers({
      ...strugglingInput,
      tradeSpendRate: "0.01",
      currentSrpPerUnit: "14",
    });
    const lever = leverById(result, "reduce-trade-spend");
    expect(lever).toBeDefined();
    expect(lever!.feasible).toBe(false);
  });
});
