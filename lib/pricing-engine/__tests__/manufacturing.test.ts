import { describe, expect, it } from "vitest";
import { priceManufacturerSale } from "../manufacturing";
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
