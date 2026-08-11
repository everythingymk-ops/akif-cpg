import { describe, expect, it } from "vitest";
import { computeContribution } from "../contribution";
import { priceThroughDistributor } from "../distribution";
import { buildLandedCost } from "../landedCost";
import { priceManufacturerSale } from "../manufacturing";
import { priceRetailerShelf } from "../retailer";
import {
  computePriceGap,
  requiredBrandInvoiceForContribution,
  requiredSrpForContribution,
  reversePriceFromShelf,
} from "../reversePricing";
import { PricingEngineError, type CostLine } from "../types";

const deductions: CostLine[] = [
  { name: "Deductions", amount: "0.02", basis: "percentOfInvoice", owner: "brand" },
];
const variables: CostLine[] = [
  { name: "Broker", amount: "0.05", basis: "percentOfInvoice", owner: "brand" },
  { name: "Royalty", amount: "0.01", basis: "percentOfNetSales", owner: "brand" },
  { name: "Fulfillment", amount: "0.10", basis: "perUnit", owner: "brand" },
];
const landedCostLines: CostLine[] = [
  { name: "International Freight", amount: "0.35", basis: "perUnit", owner: "brand" },
  { name: "Tariff", amount: "0.15", basis: "percentOfCustomsValue", owner: "brand" },
  { name: "Domestic Freight", amount: "0.25", basis: "perUnit", owner: "brand" },
];
const distributor = {
  marginSpec: { basis: "margin", rate: "0.15" } as const,
  fees: [
    { name: "Handling", amount: "0.50", basis: "perUnit", owner: "distributor" },
    { name: "Damage Reserve", amount: "0.02", basis: "percentOfInvoice", owner: "distributor" },
  ] as CostLine[],
};

describe("requiredBrandInvoiceForContribution — PRD §29, §32", () => {
  it("with no rates, the required invoice at 0% target equals the landed cost", () => {
    const r = requiredBrandInvoiceForContribution({
      landedCostPerUnit: 5,
      targetContributionRate: 0,
    });
    expect(r.requiredInvoicePerUnit.equals("5")).toBe(true);
  });

  it("round-trips through computeContribution at the target margin", () => {
    const r = requiredBrandInvoiceForContribution({
      landedCostPerUnit: "5.846875",
      targetContributionRate: "0.08",
      tradeSpendRate: "0.0948",
      revenueDeductions: deductions,
      variableCosts: variables,
    });
    const check = computeContribution({
      brandInvoicePricePerUnit: r.requiredInvoicePerUnit,
      tradeSpendRate: "0.0948",
      revenueDeductions: deductions,
      landedCostPerUnit: "5.846875",
      variableCosts: variables,
    });
    expect(check.contributionMarginRate.toDecimalPlaces(30).equals("0.08")).toBe(true);
    expect(check.netRevenuePerUnit.toDecimalPlaces(30).equals(r.netRevenuePerUnit.toDecimalPlaces(30))).toBe(true);
  });

  it("rejects rate structures that no invoice can satisfy", () => {
    expect(() =>
      requiredBrandInvoiceForContribution({
        landedCostPerUnit: 5,
        targetContributionRate: "0.10",
        variableCosts: [{ name: "Mega broker", amount: "0.95", basis: "percentOfInvoice", owner: "brand" }],
      }),
    ).toThrow(PricingEngineError);
  });
});

describe("reversePriceFromShelf — PRD §30", () => {
  it("computes the §30 shape: SRP $19.99, retailer 48%, distributor 15% → invoice ≈ $8.836", () => {
    const r = reversePriceFromShelf({
      targetSrpPerUnit: "19.99",
      retailerMarginSpec: { basis: "margin", rate: "0.48" },
      distributor: { marginSpec: { basis: "margin", rate: "0.15" } },
      targetContributionRate: 0,
    });
    expect(r.retailerAcquisitionCostPerUnit.equals("10.3948")).toBe(true);
    expect(r.maxBrandInvoicePerUnit.toDecimalPlaces(20).equals("8.83558")).toBe(true);
    expect(r.distributorSellPricePerUnit?.toDecimalPlaces(20).equals("10.3948")).toBe(true);
  });

  it("recovers the full forward chain (round-trip: forward → reverse)", () => {
    // Forward: COGS → manufacturer → landed → required invoice → distributor → retailer → SRP.
    const manufacturer = priceManufacturerSale({
      cogsPerUnit: "3.65",
      marginSpec: { basis: "margin", rate: "0.20" },
    });
    const landed = buildLandedCost({
      purchasePricePerUnit: manufacturer.sellPricePerUnit,
      costLines: landedCostLines,
      context: { customsValuePerUnit: manufacturer.sellPricePerUnit },
    });
    const invoice = requiredBrandInvoiceForContribution({
      landedCostPerUnit: landed.landedCostPerUnit,
      targetContributionRate: "0.08",
      tradeSpendRate: "0.0948",
      revenueDeductions: deductions,
      variableCosts: variables,
    });
    const dist = priceThroughDistributor({
      brandInvoicePricePerUnit: invoice.requiredInvoicePerUnit,
      marginSpec: distributor.marginSpec,
      fees: distributor.fees,
    });
    const shelf = priceRetailerShelf({
      acquisitionCostPerUnit: dist.retailerAcquisitionCostPerUnit,
      marginSpec: { basis: "margin", rate: "0.48" },
    });

    // Reverse: from that SRP back down — every ceiling must equal the forward inputs.
    const r = reversePriceFromShelf({
      targetSrpPerUnit: shelf.srpPerUnit,
      retailerMarginSpec: { basis: "margin", rate: "0.48" },
      distributor,
      targetContributionRate: "0.08",
      tradeSpendRate: "0.0948",
      revenueDeductions: deductions,
      variableCosts: variables,
      landedCostLines,
      customsValueEqualsPurchasePrice: true,
      manufacturerMarginSpec: { basis: "margin", rate: "0.20" },
    });

    expect(r.maxBrandInvoicePerUnit.toDecimalPlaces(20).equals(invoice.requiredInvoicePerUnit.toDecimalPlaces(20))).toBe(true);
    expect(r.maxLandedCostPerUnit.toDecimalPlaces(20).equals(landed.landedCostPerUnit.toDecimalPlaces(20))).toBe(true);
    expect(r.maxPurchasePricePerUnit?.toDecimalPlaces(20).equals("4.5625")).toBe(true);
    expect(r.maxManufacturingCogsPerUnit?.toDecimalPlaces(20).equals("3.65")).toBe(true);
  });

  it("an explicit customs value resolves the tariff as a fixed cost", () => {
    const r = reversePriceFromShelf({
      targetSrpPerUnit: 20,
      retailerMarginSpec: { basis: "margin", rate: "0.5" },
      targetContributionRate: 0,
      landedCostLines: [{ name: "Tariff", amount: "0.15", basis: "percentOfCustomsValue", owner: "brand" }],
      context: { customsValuePerUnit: 5 },
    });
    // max landed = 10; purchase = 10 − 0.75 = 9.25
    expect(r.maxLandedCostPerUnit.equals("10")).toBe(true);
    expect(r.maxPurchasePricePerUnit?.equals("9.25")).toBe(true);
  });

  it("customsValueEqualsPurchasePrice scales the tariff with the unknown purchase price", () => {
    const r = reversePriceFromShelf({
      targetSrpPerUnit: 20,
      retailerMarginSpec: { basis: "margin", rate: "0.5" },
      targetContributionRate: 0,
      landedCostLines: [{ name: "Tariff", amount: "0.15", basis: "percentOfCustomsValue", owner: "brand" }],
      customsValueEqualsPurchasePrice: true,
    });
    // purchase = 10 ÷ 1.15
    expect(r.maxPurchasePricePerUnit?.toDecimalPlaces(20).equals("8.69565217391304347826")).toBe(true);
  });

  it("refuses a customs-value line without an explicit choice (PRD §10)", () => {
    expect(() =>
      reversePriceFromShelf({
        targetSrpPerUnit: 20,
        retailerMarginSpec: { basis: "margin", rate: "0.5" },
        targetContributionRate: 0,
        landedCostLines: [{ name: "Tariff", amount: "0.15", basis: "percentOfCustomsValue", owner: "brand" }],
      }),
    ).toThrow(/customsValue/);
  });

  it("rejects infeasible assumption sets with specific errors", () => {
    expect(() =>
      reversePriceFromShelf({
        targetSrpPerUnit: 20,
        retailerMarginSpec: { basis: "margin", rate: "0.5" },
        targetContributionRate: "0.5",
        variableCosts: [{ name: "Royalty", amount: "0.6", basis: "percentOfNetSales", owner: "brand" }],
      }),
    ).toThrow(/100% or more of net revenue/);
    expect(() =>
      reversePriceFromShelf({
        targetSrpPerUnit: 20,
        retailerMarginSpec: { basis: "margin", rate: "0.5" },
        targetContributionRate: 0,
        variableCosts: [{ name: "Warehouse", amount: 12, basis: "perUnit", owner: "brand" }],
      }),
    ).toThrow(/no room for product cost/);
  });
});

describe("requiredSrpForContribution — PRD §32", () => {
  it("is the exact forward image of the reverse chain", () => {
    const r = requiredSrpForContribution({
      landedCostPerUnit: "5.846875",
      targetContributionRate: "0.08",
      tradeSpendRate: "0.0948",
      revenueDeductions: deductions,
      variableCosts: variables,
      distributor,
      retailerMarginSpec: { basis: "margin", rate: "0.48" },
    });
    const back = reversePriceFromShelf({
      targetSrpPerUnit: r.requiredSrpPerUnit,
      retailerMarginSpec: { basis: "margin", rate: "0.48" },
      distributor,
      targetContributionRate: "0.08",
      tradeSpendRate: "0.0948",
      revenueDeductions: deductions,
      variableCosts: variables,
    });
    expect(back.maxLandedCostPerUnit.toDecimalPlaces(20).equals("5.846875")).toBe(true);
    expect(back.maxBrandInvoicePerUnit.toDecimalPlaces(20).equals(r.requiredInvoicePerUnit.toDecimalPlaces(20))).toBe(true);
  });
});

describe("computePriceGap — PRD §31", () => {
  it("reports the §31 example: actual $6.15 vs supported $5.40 → gap +$0.75", () => {
    const r = computePriceGap("6.15", "5.40");
    expect(r.gapPerUnit.equals("0.75")).toBe(true);
    expect(r.exceedsSupportedCost).toBe(true);
  });

  it("a negative gap means headroom", () => {
    const r = computePriceGap("5.00", "5.40");
    expect(r.gapPerUnit.equals("-0.4")).toBe(true);
    expect(r.exceedsSupportedCost).toBe(false);
  });
});
