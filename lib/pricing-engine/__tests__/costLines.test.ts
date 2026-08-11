import { describe, expect, it } from "vitest";
import { filterCostLinesByOwner, resolveCostLine, resolveCostLines } from "../costLines";
import { PricingEngineError, type CostLine } from "../types";

function line(partial: Partial<CostLine> & Pick<CostLine, "amount" | "basis">): CostLine {
  return { name: "Test cost", owner: "brand", ...partial };
}

describe("resolveCostLine — dollar bases", () => {
  it("perUnit passes through", () => {
    const r = resolveCostLine(line({ amount: "0.35", basis: "perUnit" }));
    expect(r.perUnit.equals("0.35")).toBe(true);
  });

  it("perCase divides by units per case", () => {
    const r = resolveCostLine(line({ amount: 12, basis: "perCase" }), { unitsPerCase: 24 });
    expect(r.perUnit.equals("0.5")).toBe(true);
  });

  it("perShipment divides by units per shipment", () => {
    const r = resolveCostLine(line({ amount: 5000, basis: "perShipment" }), {
      unitsPerShipment: 10000,
    });
    expect(r.perUnit.equals("0.5")).toBe(true);
  });

  it("annual divides by annual units (fixed-cost amortization, PRD §14)", () => {
    const r = resolveCostLine(line({ amount: 12000, basis: "annual" }), { annualUnits: 120000 });
    expect(r.perUnit.equals("0.1")).toBe(true);
  });
});

describe("resolveCostLine — percent bases", () => {
  it("percentOfCogs multiplies against COGS", () => {
    const r = resolveCostLine(line({ amount: "0.05", basis: "percentOfCogs" }), {
      cogsPerUnit: "3.65",
    });
    expect(r.perUnit.equals("0.1825")).toBe(true);
  });

  it("percentOfInvoice multiplies against the invoice price", () => {
    const r = resolveCostLine(line({ amount: "0.02", basis: "percentOfInvoice" }), {
      invoicePricePerUnit: "8.90",
    });
    expect(r.perUnit.equals("0.178")).toBe(true);
  });

  it("percentOfCustomsValue multiplies against the declared customs value", () => {
    const r = resolveCostLine(line({ amount: "0.15", basis: "percentOfCustomsValue" }), {
      customsValuePerUnit: "4.56",
    });
    expect(r.perUnit.equals("0.684")).toBe(true);
  });

  it("percentOfSrp multiplies against the SRP", () => {
    const r = resolveCostLine(line({ amount: "0.03", basis: "percentOfSrp" }), {
      srpPerUnit: "19.99",
    });
    expect(r.perUnit.equals("0.5997")).toBe(true);
  });

  it("percentOfNetSales multiplies against net sales", () => {
    const r = resolveCostLine(line({ amount: "0.02", basis: "percentOfNetSales" }), {
      netSalesPerUnit: "7.88",
    });
    expect(r.perUnit.equals("0.1576")).toBe(true);
  });
});

describe("resolveCostLine — never assumes a basis value", () => {
  it("throws when the required context value is missing, naming line and key", () => {
    expect(() =>
      resolveCostLine(line({ name: "Tariff", amount: "0.15", basis: "percentOfCustomsValue" })),
    ).toThrow(/Tariff.*customsValuePerUnit/);
  });

  it("throws for a missing divisor context", () => {
    expect(() => resolveCostLine(line({ amount: 12, basis: "perCase" }))).toThrow(
      PricingEngineError,
    );
  });

  it("rejects zero or negative divisors", () => {
    expect(() =>
      resolveCostLine(line({ amount: 12, basis: "perCase" }), { unitsPerCase: 0 }),
    ).toThrow(PricingEngineError);
  });
});

describe("resolveCostLines / filterCostLinesByOwner", () => {
  it("totals resolved lines per unit", () => {
    const { totalPerUnit, resolved } = resolveCostLines(
      [
        line({ name: "Freight", amount: "0.35", basis: "perUnit" }),
        line({ name: "Tariff", amount: "0.15", basis: "percentOfCustomsValue" }),
      ],
      { customsValuePerUnit: "4.56" },
    );
    expect(resolved).toHaveLength(2);
    expect(totalPerUnit.equals("1.034")).toBe(true);
  });

  it("filters lines by owner (PRD §9)", () => {
    const lines = [
      line({ name: "Brand freight", amount: 1, basis: "perUnit", owner: "brand" }),
      line({ name: "Mfr rework", amount: 1, basis: "perUnit", owner: "manufacturer" }),
      line({ name: "Shared audit", amount: 1, basis: "perUnit", owner: "shared" }),
    ];
    expect(filterCostLinesByOwner(lines, "brand")).toHaveLength(1);
    expect(filterCostLinesByOwner(lines, ["brand", "shared"])).toHaveLength(2);
  });
});
