import { describe, expect, it } from "vitest";
import { DEMO_ASSUMPTIONS } from "../assumptions";
import { computeScenario } from "../computeScenario";
import { resolveAssumptions, type AssumptionLayer } from "../priority";
import {
  distributorProfileValues,
  retailerProfileValues,
  type DistributorProfile,
  type RetailerProfile,
} from "../profiles";

describe("resolveAssumptions — PRD §45 priority", () => {
  const globalLayer: AssumptionLayer = {
    scope: "global",
    values: { brokerRate: "0.05" },
  };
  const skuLayer: AssumptionLayer = {
    scope: "sku",
    values: { cogsPerUnit: "3.65", brokerRate: "0.04" },
  };
  const customerLayer: AssumptionLayer = {
    scope: "customer",
    values: { distributorMarginRate: "0.18", brokerRate: "0.03" },
  };
  const skuCustomerLayer: AssumptionLayer = {
    scope: "skuCustomer",
    values: { brokerRate: "0.02", distributorMarginRate: "0.20" },
  };

  it("the most specific scope wins: SKU+customer > customer > SKU > global", () => {
    const { assumptions, provenance } = resolveAssumptions(DEMO_ASSUMPTIONS, [
      // Deliberately shuffled input order — priority must come from scope.
      skuCustomerLayer,
      globalLayer,
      customerLayer,
      skuLayer,
    ]);
    expect(assumptions.brokerRate).toBe("0.02");
    expect(provenance.brokerRate).toBe("skuCustomer");
    expect(assumptions.distributorMarginRate).toBe("0.20");
    expect(assumptions.cogsPerUnit).toBe("3.65");
    expect(provenance.cogsPerUnit).toBe("sku");
  });

  it("each subset keeps the §45 ordering", () => {
    const skuVsGlobal = resolveAssumptions(DEMO_ASSUMPTIONS, [globalLayer, skuLayer]);
    expect(skuVsGlobal.assumptions.brokerRate).toBe("0.04");

    const customerVsSku = resolveAssumptions(DEMO_ASSUMPTIONS, [skuLayer, customerLayer]);
    expect(customerVsSku.assumptions.brokerRate).toBe("0.03");
    expect(customerVsSku.provenance.brokerRate).toBe("customer");
  });

  it("empty and undefined values never override", () => {
    const { assumptions, provenance } = resolveAssumptions(DEMO_ASSUMPTIONS, [
      { scope: "customer", values: { brokerRate: "", retailerMarginRate: undefined } },
    ]);
    expect(assumptions.brokerRate).toBe(DEMO_ASSUMPTIONS.brokerRate);
    expect(provenance.brokerRate).toBeUndefined();
  });

  it("equal-priority layers apply in input order (retailer + distributor profiles)", () => {
    const { assumptions } = resolveAssumptions(DEMO_ASSUMPTIONS, [
      { scope: "customer", values: { useDistributor: false } },
      { scope: "customer", values: { useDistributor: true, distributorMarginRate: "0.12" } },
    ]);
    expect(assumptions.useDistributor).toBe(true);
    expect(assumptions.distributorMarginRate).toBe("0.12");
  });

  it("untouched fields keep the base values", () => {
    const { assumptions } = resolveAssumptions(DEMO_ASSUMPTIONS, [customerLayer]);
    expect(assumptions.retailerMarginRate).toBe(DEMO_ASSUMPTIONS.retailerMarginRate);
    expect(assumptions.cogsPerUnit).toBe(DEMO_ASSUMPTIONS.cogsPerUnit);
  });
});

describe("profiles as the customer layer — PRD §46–47", () => {
  const unfi: DistributorProfile = {
    id: "d1",
    name: "UNFI",
    marginBasis: "margin",
    marginRate: "0.18",
    handlingFeePerUnit: "0.65",
    notes: "",
  };
  const albertsons: RetailerProfile = {
    id: "r1",
    name: "Albertsons",
    channel: "Grocery",
    defaultDistributorProfileId: "d1",
    retailerMarginBasis: "margin",
    retailerMarginRate: "0.42",
    brokerRate: "0.03",
    deductionsRate: "",
    tradeSpendRate: "0.14",
    paymentTerms: "Net 30",
    notes: "",
  };

  it("profile patches carry only the fields the profile sets", () => {
    const retailerValues = retailerProfileValues(albertsons);
    expect(retailerValues).toEqual({
      retailerMarginBasis: "margin",
      retailerMarginRate: "0.42",
      brokerRate: "0.03",
      tradeSpendMode: "manual",
      tradeSpendRate: "0.14",
    });
    expect(distributorProfileValues(unfi)).toEqual({
      useDistributor: true,
      distributorMarginBasis: "margin",
      distributorMarginRate: "0.18",
      distributorHandlingFeePerUnit: "0.65",
    });
    expect(distributorProfileValues(null)).toEqual({ useDistributor: false });
  });

  it("applying profiles through the resolver produces a computable model", () => {
    const { assumptions, provenance } = resolveAssumptions(DEMO_ASSUMPTIONS, [
      { scope: "customer", values: retailerProfileValues(albertsons) },
      { scope: "customer", values: distributorProfileValues(unfi) },
    ]);
    expect(assumptions.retailerMarginRate).toBe("0.42");
    expect(assumptions.distributorMarginRate).toBe("0.18");
    expect(assumptions.deductionsRate).toBe(DEMO_ASSUMPTIONS.deductionsRate); // untouched
    expect(provenance.retailerMarginRate).toBe("customer");

    const result = computeScenario(assumptions);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 42% retailer margin prices lower than the demo's 48%.
    expect(result.scenario.requiredSrpPerUnit.lessThan("18.69")).toBe(true);
  });

  it("switching a retailer to direct removes the distributor leg (§47 example)", () => {
    const { assumptions } = resolveAssumptions(DEMO_ASSUMPTIONS, [
      { scope: "customer", values: distributorProfileValues(null) },
    ]);
    expect(assumptions.useDistributor).toBe(false);
    const result = computeScenario(assumptions);
    expect(result.ok).toBe(true);
  });
});
