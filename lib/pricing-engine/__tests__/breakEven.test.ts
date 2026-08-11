import { describe, expect, it } from "vitest";
import { computeBreakEven } from "../breakEven";
import { computeContribution } from "../contribution";
import { priceThroughDistributor } from "../distribution";
import { dec } from "../money";
import { priceRetailerShelf } from "../retailer";
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

const richInput = {
  landedCostPerUnit: 5,
  tradeSpendRate: "0.10",
  revenueDeductions: deductions,
  variableCosts: variables,
  distributor,
  retailerMarginSpec,
  currentBrandInvoicePerUnit: 10,
  currentSrpPerUnit: 25,
};

describe("computeBreakEven — PRD §74", () => {
  it("break-even invoice makes contribution exactly zero", () => {
    const r = computeBreakEven(richInput);
    // a = 0.88, (1 − varNet) = 0.99, varInv = 0.05 → I = 5 ÷ (0.88 × 0.99 − 0.05) = 5 ÷ 0.8212
    const expected = dec(5).dividedBy("0.8212");
    expect(r.breakEvenBrandInvoicePerUnit.toDecimalPlaces(20).equals(expected.toDecimalPlaces(20))).toBe(true);
    const check = computeContribution({
      brandInvoicePricePerUnit: r.breakEvenBrandInvoicePerUnit,
      tradeSpendRate: "0.10",
      revenueDeductions: deductions,
      landedCostPerUnit: 5,
      variableCosts: variables,
    });
    expect(check.contributionPerUnit.toDecimalPlaces(30).isZero()).toBe(true);
  });

  it("break-even retailer cost and SRP are the forward image of the break-even invoice", () => {
    const r = computeBreakEven(richInput);
    const forwardCost = priceThroughDistributor({
      brandInvoicePricePerUnit: r.breakEvenBrandInvoicePerUnit,
      marginSpec: distributor.marginSpec,
      fees: distributor.fees,
    }).retailerAcquisitionCostPerUnit;
    expect(r.breakEvenRetailerCostPerUnit.toDecimalPlaces(20).equals(forwardCost.toDecimalPlaces(20))).toBe(true);
    const forwardSrp = priceRetailerShelf({
      acquisitionCostPerUnit: forwardCost,
      marginSpec: retailerMarginSpec,
    }).srpPerUnit;
    expect(r.breakEvenSrpPerUnit?.toDecimalPlaces(20).equals(forwardSrp.toDecimalPlaces(20))).toBe(true);
  });

  it("maximum trade spend drives contribution to exactly zero at the current invoice", () => {
    const r = computeBreakEven(richInput);
    expect(r.maxTradeSpendRate).toBeDefined();
    const check = computeContribution({
      brandInvoicePricePerUnit: 10,
      tradeSpendRate: r.maxTradeSpendRate,
      revenueDeductions: deductions,
      landedCostPerUnit: 5,
      variableCosts: variables,
    });
    expect(check.contributionPerUnit.toDecimalPlaces(30).isZero()).toBe(true);
  });

  it("maximum retailer margin reproduces the current SRP from the current chain cost", () => {
    const r = computeBreakEven(richInput);
    const chainCost = priceThroughDistributor({
      brandInvoicePricePerUnit: 10,
      marginSpec: distributor.marginSpec,
      fees: distributor.fees,
    }).retailerAcquisitionCostPerUnit;
    const srp = priceRetailerShelf({
      acquisitionCostPerUnit: chainCost,
      marginSpec: { basis: "margin", rate: r.maxRetailerMarginRate! },
    }).srpPerUnit;
    expect(srp.toDecimalPlaces(20).equals("25")).toBe(true);
  });

  it("maximum distributor margin connects the break-even invoice to the current SRP", () => {
    const r = computeBreakEven(richInput);
    const retailerCost = priceThroughDistributor({
      brandInvoicePricePerUnit: r.breakEvenBrandInvoicePerUnit,
      marginSpec: { basis: "margin", rate: r.maxDistributorMarginRate! },
      fees: distributor.fees,
    }).retailerAcquisitionCostPerUnit;
    // Allowed retailer cost at SRP 25 and 48% margin = 13.
    expect(retailerCost.toDecimalPlaces(20).equals("13")).toBe(true);
  });

  it("maximum landed cost at the current SRP matches the zero-target reverse chain", () => {
    const r = computeBreakEven(richInput);
    // Reverse at SRP 25: retailer cost 13 → invoice (13 − 0.5) × 0.85 = 10.625;
    // net = 0.88 × 10.625 = 9.35; max landed = 9.35 × 0.99 − 0.05 × 10.625 = 8.72525.
    expect(r.maxLandedCostPerUnit?.toDecimalPlaces(20).equals("8.72525")).toBe(true);
  });

  it("computes only what the inputs allow", () => {
    const r = computeBreakEven({
      landedCostPerUnit: 5,
      tradeSpendRate: "0.10",
    });
    expect(r.breakEvenBrandInvoicePerUnit.toDecimalPlaces(20).equals("5.55555555555555555556")).toBe(true);
    expect(r.breakEvenRetailerCostPerUnit.equals(r.breakEvenBrandInvoicePerUnit)).toBe(true);
    expect(r.breakEvenSrpPerUnit).toBeUndefined();
    expect(r.maxTradeSpendRate).toBeUndefined();
    expect(r.maxRetailerMarginRate).toBeUndefined();
    expect(r.maxDistributorMarginRate).toBeUndefined();
    expect(r.maxLandedCostPerUnit).toBeUndefined();
  });

  it("returns an explainable trace (PRD §41, §67)", () => {
    const r = computeBreakEven(richInput);
    expect(r.trace.title).toBe("Break-Even Analysis");
    const labels = r.trace.steps.map((s) => s.label);
    expect(labels.some((l) => l.includes("Break-even brand invoice"))).toBe(true);
    expect(labels.some((l) => l.includes("Maximum trade spend"))).toBe(true);
    expect(r.trace.output.equals(r.breakEvenBrandInvoicePerUnit)).toBe(true);
  });
});
