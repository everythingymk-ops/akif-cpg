import { describe, expect, it } from "vitest";
import { priceManufacturerSale } from "../manufacturing";
import { priceRetailerShelf } from "../retailer";

/**
 * CLAUDE.md acceptance tests (PRD §86–88). The trade-spend test (≈9.48%)
 * arrives with the trade spend engine in roadmap step 2.
 */
describe("acceptance tests", () => {
  it("margin: COGS $8 at 20% margin sells for $10.00 (PRD §87)", () => {
    const result = priceManufacturerSale({
      cogsPerUnit: 8,
      marginSpec: { basis: "margin", rate: 0.2 },
    });
    expect(result.sellPricePerUnit.toFixed(2)).toBe("10.00");
    expect(result.sellPricePerUnit.equals("10")).toBe(true);
  });

  it("markup: COGS $8 at 20% markup sells for $9.60 (PRD §88)", () => {
    const result = priceManufacturerSale({
      cogsPerUnit: 8,
      marginSpec: { basis: "markup", rate: 0.2 },
    });
    expect(result.sellPricePerUnit.toFixed(2)).toBe("9.60");
    expect(result.sellPricePerUnit.equals("9.6")).toBe(true);
  });

  it("retailer SRP: landed cost $10 at 50% retailer margin requires a $20.00 SRP (PRD §15)", () => {
    const result = priceRetailerShelf({
      acquisitionCostPerUnit: 10,
      marginSpec: { basis: "margin", rate: 0.5 },
    });
    expect(result.srpPerUnit.toFixed(2)).toBe("20.00");
    expect(result.srpPerUnit.equals("20")).toBe(true);
  });
});
