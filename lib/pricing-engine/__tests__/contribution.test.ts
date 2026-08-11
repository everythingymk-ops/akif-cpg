import { describe, expect, it } from "vitest";
import { computeContribution, computeGrossToNet } from "../contribution";
import { roundMoney } from "../money";
import { PricingEngineError, type CostLine } from "../types";

const returns: CostLine = { name: "Returns", amount: "0.02", basis: "percentOfInvoice", owner: "brand" };
const damages: CostLine = { name: "Damages", amount: "0.05", basis: "perUnit", owner: "brand" };
const broker: CostLine = { name: "Broker", amount: "0.05", basis: "percentOfInvoice", owner: "brand" };
const fulfillment: CostLine = { name: "Fulfillment", amount: "0.25", basis: "perUnit", owner: "brand" };
const royalty: CostLine = { name: "Royalty", amount: "0.01", basis: "percentOfNetSales", owner: "brand" };

describe("computeGrossToNet — PRD §27", () => {
  it("nets trade spend and deductions off the gross invoice", () => {
    const r = computeGrossToNet({
      brandInvoicePricePerUnit: 10,
      tradeSpendRate: "0.10",
      revenueDeductions: [returns, damages],
    });
    expect(r.tradeSpendPerUnit.equals("1")).toBe(true);
    expect(r.deductionsPerUnit.equals("0.25")).toBe(true);
    expect(r.netRevenuePerUnit.equals("8.75")).toBe(true);
  });

  it("matches the §96 side numbers: $8.90 invoice at 11.5% trade spend → ≈$7.88 net", () => {
    const r = computeGrossToNet({ brandInvoicePricePerUnit: "8.90", tradeSpendRate: "0.115" });
    expect(r.netRevenuePerUnit.equals("7.8765")).toBe(true);
    expect(roundMoney(r.netRevenuePerUnit).toString()).toBe("7.88");
  });

  it("rejects percentOfNetSales deductions as circular (PRD §28)", () => {
    expect(() =>
      computeGrossToNet({ brandInvoicePricePerUnit: 10, revenueDeductions: [royalty] }),
    ).toThrow(/net sales/);
  });

  it("rejects assumptions that consume the whole invoice", () => {
    expect(() =>
      computeGrossToNet({
        brandInvoicePricePerUnit: 10,
        tradeSpendRate: "0.60",
        revenueDeductions: [{ ...returns, amount: "0.50" }],
      }),
    ).toThrow(PricingEngineError);
  });
});

describe("computeContribution — PRD §28", () => {
  it("computes the default contribution definition on an exact hand-built vector", () => {
    const r = computeContribution({
      brandInvoicePricePerUnit: 10,
      tradeSpendRate: "0.10",
      revenueDeductions: [returns, damages],
      landedCostPerUnit: 5,
      variableCosts: [broker, fulfillment, royalty],
    });
    // net = 10 − 1 − 0.25 = 8.75; variables = 0.5 + 0.25 + 0.01 × 8.75 = 0.8375
    expect(r.netRevenuePerUnit.equals("8.75")).toBe(true);
    expect(r.variableCostsPerUnit.equals("0.8375")).toBe(true);
    // contribution = 8.75 − 5 − 0.8375 = 2.9125; margin = 2.9125 ÷ 8.75
    expect(r.contributionPerUnit.equals("2.9125")).toBe(true);
    expect(r.contributionMarginRate.toDecimalPlaces(12).equals("0.332857142857")).toBe(true);
  });

  it("percentOfNetSales variable costs resolve against the computed net revenue", () => {
    const r = computeContribution({
      brandInvoicePricePerUnit: 10,
      tradeSpendRate: "0.20",
      landedCostPerUnit: 5,
      variableCosts: [royalty],
    });
    // net = 8; royalty = 0.08
    expect(r.variableCostsPerUnit.equals("0.08")).toBe(true);
    expect(r.contributionPerUnit.equals("2.92")).toBe(true);
  });

  it("allows a negative contribution (model under water) without throwing", () => {
    const r = computeContribution({
      brandInvoicePricePerUnit: 6,
      tradeSpendRate: "0.15",
      landedCostPerUnit: 5,
      variableCosts: [broker],
    });
    // net = 5.1; contribution = 5.1 − 5 − 0.3 = −0.2
    expect(r.contributionPerUnit.equals("-0.2")).toBe(true);
    expect(r.contributionMarginRate.lessThan(0)).toBe(true);
  });

  it("returns a combined explainable trace (PRD §41, §67)", () => {
    const r = computeContribution({
      brandInvoicePricePerUnit: 10,
      tradeSpendRate: "0.10",
      revenueDeductions: [returns],
      landedCostPerUnit: 5,
      variableCosts: [broker],
    });
    const labels = r.trace.steps.map((s) => s.label);
    expect(labels).toContain("Trade spend");
    expect(labels).toContain("Returns");
    expect(labels).toContain("Broker");
    expect(r.trace.output.equals(r.contributionMarginRate)).toBe(true);
  });
});
