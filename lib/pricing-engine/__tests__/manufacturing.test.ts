import { describe, expect, it } from "vitest";
import { buildDetailedCogs, priceManufacturerSale, type CogsComponent } from "../manufacturing";
import { roundMoney } from "../money";
import { PricingEngineError } from "../types";

describe("priceManufacturerSale", () => {
  it("prices the seed product: COGS $3.65 at 20% margin → $4.5625 (≈ $4.56, PRD §96/§99)", () => {
    const r = priceManufacturerSale({
      cogsPerUnit: "3.65",
      marginSpec: { basis: "margin", rate: "0.20" },
    });
    expect(r.sellPricePerUnit.equals("4.5625")).toBe(true);
    expect(roundMoney(r.sellPricePerUnit).toString()).toBe("4.56");
    expect(r.profitPerUnit.equals("0.9125")).toBe(true);
  });

  it("markup basis on the same inputs gives a different price: $4.38", () => {
    const r = priceManufacturerSale({
      cogsPerUnit: "3.65",
      marginSpec: { basis: "markup", rate: "0.20" },
    });
    expect(r.sellPricePerUnit.equals("4.38")).toBe(true);
  });

  it("reports realized margin AND markup regardless of input basis", () => {
    const r = priceManufacturerSale({
      cogsPerUnit: "3.65",
      marginSpec: { basis: "margin", rate: "0.20" },
    });
    // A 20% margin is the same price as a 25% markup.
    expect(r.marginRate.equals("0.2")).toBe(true);
    expect(r.markupRate.equals("0.25")).toBe(true);
  });

  it("rejects a non-positive COGS", () => {
    expect(() =>
      priceManufacturerSale({ cogsPerUnit: 0, marginSpec: { basis: "margin", rate: 0.2 } }),
    ).toThrow(PricingEngineError);
  });

  it("returns an explainable trace (PRD §41, §67)", () => {
    const r = priceManufacturerSale({
      cogsPerUnit: "3.65",
      marginSpec: { basis: "margin", rate: "0.20" },
    });
    expect(r.trace.title).toBe("Manufacturer Sell Price");
    expect(r.trace.formula).toContain("1 − margin");
    expect(Object.keys(r.trace.inputs).length).toBeGreaterThan(0);
    expect(r.trace.steps.length).toBeGreaterThan(0);
    expect(r.trace.output.equals(r.sellPricePerUnit)).toBe(true);
  });
});

describe("buildDetailedCogs — PRD §7", () => {
  const components: CogsComponent[] = [
    { name: "Active Ingredients", category: "formula", amountPerUnit: "1.20" },
    { name: "Flavoring", category: "formula", amountPerUnit: "0.15" },
    { name: "Bottle", category: "packaging", amountPerUnit: "0.42" },
    { name: "Label", category: "packaging", amountPerUnit: "0.08" },
    { name: "Direct Labor", category: "manufacturing", amountPerUnit: "1.10" },
    { name: "QC & Testing", category: "manufacturing", amountPerUnit: "0.70" },
  ];

  it("sums each category and the total exactly", () => {
    const r = buildDetailedCogs(components);
    expect(r.materialCostPerUnit.equals("1.35")).toBe(true);
    expect(r.packagingCostPerUnit.equals("0.5")).toBe(true);
    expect(r.manufacturingCostPerUnit.equals("1.8")).toBe(true);
    expect(r.totalCogsPerUnit.equals("3.65")).toBe(true);
  });

  it("feeds directly into manufacturer pricing", () => {
    const cogs = buildDetailedCogs(components);
    const priced = priceManufacturerSale({
      cogsPerUnit: cogs.totalCogsPerUnit,
      marginSpec: { basis: "margin", rate: "0.20" },
    });
    expect(priced.sellPricePerUnit.equals("4.5625")).toBe(true);
  });

  it("rejects negative component amounts", () => {
    expect(() =>
      buildDetailedCogs([{ name: "Rebate", category: "formula", amountPerUnit: "-0.10" }]),
    ).toThrow(PricingEngineError);
  });

  it("returns a §67 trace with the three category subtotals", () => {
    const r = buildDetailedCogs(components);
    const labels = r.trace.steps.map((s) => s.label);
    expect(labels).toContain("Material Cost");
    expect(labels).toContain("Packaging Cost");
    expect(labels).toContain("Manufacturing Cost");
    expect(r.trace.output.equals("3.65")).toBe(true);
  });

  it("an empty component list totals to zero", () => {
    expect(buildDetailedCogs([]).totalCogsPerUnit.isZero()).toBe(true);
  });
});
