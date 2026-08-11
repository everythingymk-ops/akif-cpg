import { describe, expect, it } from "vitest";
import { priceThroughDistributor } from "../distribution";
import { priceRetailerShelf } from "../retailer";
import { PricingEngineError } from "../types";

describe("priceRetailerShelf", () => {
  it("acceptance: landed cost $10 at 50% retailer margin → SRP $20 (PRD §15)", () => {
    const r = priceRetailerShelf({
      acquisitionCostPerUnit: 10,
      marginSpec: { basis: "margin", rate: 0.5 },
    });
    expect(r.srpPerUnit.equals("20")).toBe(true);
    expect(r.grossProfitPerUnit.equals("10")).toBe(true);
    expect(r.marginRate.equals("0.5")).toBe(true);
    expect(r.markupRate.equals("1")).toBe(true);
  });

  it("the same 50% as a markup gives $15, not $20", () => {
    const r = priceRetailerShelf({
      acquisitionCostPerUnit: 10,
      marginSpec: { basis: "markup", rate: 0.5 },
    });
    expect(r.srpPerUnit.equals("15")).toBe(true);
  });

  it("chains distributor output into the required SRP (PRD §96: retailer cost ≈$10.97 at 48% → ≈$21.10)", () => {
    const distributor = priceThroughDistributor({
      brandInvoicePricePerUnit: "8.90",
      marginSpec: { basis: "margin", rate: "0.15" },
      fees: [{ name: "Distributor Handling", amount: "0.50", basis: "perUnit", owner: "distributor" }],
    });
    const retailer = priceRetailerShelf({
      acquisitionCostPerUnit: distributor.retailerAcquisitionCostPerUnit,
      marginSpec: { basis: "margin", rate: "0.48" },
    });
    expect(retailer.srpPerUnit.toFixed(2)).toBe("21.10");
  });

  it("rejects a non-positive acquisition cost and a margin ≥ 100%", () => {
    expect(() =>
      priceRetailerShelf({ acquisitionCostPerUnit: 0, marginSpec: { basis: "margin", rate: 0.5 } }),
    ).toThrow(PricingEngineError);
    expect(() =>
      priceRetailerShelf({ acquisitionCostPerUnit: 10, marginSpec: { basis: "margin", rate: 1 } }),
    ).toThrow(PricingEngineError);
  });

  it("returns an explainable trace (PRD §41, §67)", () => {
    const r = priceRetailerShelf({
      acquisitionCostPerUnit: 10,
      marginSpec: { basis: "margin", rate: 0.5 },
    });
    expect(r.trace.title).toBe("Required Shelf Price (SRP)");
    expect(r.trace.steps.length).toBeGreaterThan(0);
    expect(r.trace.output.equals(r.srpPerUnit)).toBe(true);
  });
});
