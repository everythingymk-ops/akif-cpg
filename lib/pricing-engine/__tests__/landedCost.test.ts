import { describe, expect, it } from "vitest";
import { buildLandedCost } from "../landedCost";
import { roundMoney } from "../money";
import { PricingEngineError, type CostLine } from "../types";

const brandLine = (name: string, amount: CostLine["amount"], basis: CostLine["basis"]): CostLine =>
  ({ name, amount, basis, owner: "brand" });

describe("buildLandedCost", () => {
  it("builds the PRD §10 example at full precision", () => {
    // Purchase 4.56 + freight 0.35 + tariff 15% of customs value 4.56 (=0.684)
    // + broker 0.05 + domestic freight 0.25 + warehouse 0.06 = 5.954.
    // (The PRD displays $5.96 because its example rounds each line to cents;
    // the engine never rounds intermediates — display rounding is a UI concern.)
    const r = buildLandedCost({
      purchasePricePerUnit: "4.56",
      costLines: [
        brandLine("International Freight", "0.35", "perUnit"),
        brandLine("Tariff", "0.15", "percentOfCustomsValue"),
        brandLine("Customs Broker Allocation", "0.05", "perUnit"),
        brandLine("Domestic Freight", "0.25", "perUnit"),
        brandLine("Warehouse Receiving", "0.06", "perUnit"),
      ],
      context: { customsValuePerUnit: "4.56" },
    });
    expect(r.landedCostPerUnit.equals("5.954")).toBe(true);
    expect(r.addOnCostPerUnit.equals("1.394")).toBe(true);
    expect(roundMoney(r.landedCostPerUnit).toString()).toBe("5.95");
  });

  it("tariff basis is selectable and changes the result (PRD §10)", () => {
    const tariffOn = (basis: CostLine["basis"], amount: string) =>
      buildLandedCost({
        purchasePricePerUnit: "4.56",
        costLines: [brandLine("Tariff", amount, basis)],
        context: { customsValuePerUnit: "5.00", cogsPerUnit: "3.65" },
      }).landedCostPerUnit;

    expect(tariffOn("percentOfCustomsValue", "0.15").equals("5.31")).toBe(true); // 4.56 + 0.75
    expect(tariffOn("percentOfInvoice", "0.15").equals("5.244")).toBe(true); // 4.56 + 0.684
    expect(tariffOn("percentOfCogs", "0.15").equals("5.1075")).toBe(true); // 4.56 + 0.5475
    expect(tariffOn("perUnit", "0.30").equals("4.86")).toBe(true); // 4.56 + 0.30
  });

  it("refuses a customs-value tariff without an explicit customs value", () => {
    expect(() =>
      buildLandedCost({
        purchasePricePerUnit: "4.56",
        costLines: [brandLine("Tariff", "0.15", "percentOfCustomsValue")],
      }),
    ).toThrow(PricingEngineError);
  });

  it("defaults the invoice basis to the purchase price, but an explicit context wins", () => {
    const defaulted = buildLandedCost({
      purchasePricePerUnit: "4.56",
      costLines: [brandLine("Handling", "0.10", "percentOfInvoice")],
    });
    expect(defaulted.addOnCostPerUnit.equals("0.456")).toBe(true);

    const overridden = buildLandedCost({
      purchasePricePerUnit: "4.56",
      costLines: [brandLine("Handling", "0.10", "percentOfInvoice")],
      context: { invoicePricePerUnit: "5.00" },
    });
    expect(overridden.addOnCostPerUnit.equals("0.5")).toBe(true);
  });

  it("with no cost lines, landed cost equals the purchase price", () => {
    const r = buildLandedCost({ purchasePricePerUnit: "4.56" });
    expect(r.landedCostPerUnit.equals("4.56")).toBe(true);
    expect(r.resolvedLines).toHaveLength(0);
  });

  it("returns a trace with one step per cost line (PRD §41, §67)", () => {
    const r = buildLandedCost({
      purchasePricePerUnit: "4.56",
      costLines: [
        brandLine("International Freight", "0.35", "perUnit"),
        brandLine("Tariff", "0.15", "percentOfCustomsValue"),
      ],
      context: { customsValuePerUnit: "4.56" },
    });
    const labels = r.trace.steps.map((s) => s.label);
    expect(labels).toContain("International Freight");
    expect(labels).toContain("Tariff");
    expect(r.trace.output.equals(r.landedCostPerUnit)).toBe(true);
  });
});
