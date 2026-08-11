import { describe, expect, it } from "vitest";
import { priceManufacturerSale } from "../manufacturing";
import { priceRetailerShelf } from "../retailer";
import { computeTradeSpendNormalized } from "../tradeSpend";

/** CLAUDE.md acceptance tests (PRD §86–88). */
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

  it("trade spend: 52 weeks, BOGO 4wk/50%/2.0x/100% + OI 8wk/15%/1.25x/100% ≈ 9.48% ±0.02pp (PRD §86)", () => {
    const result = computeTradeSpendNormalized({
      annualWeeks: 52,
      promotions: [
        {
          name: "BOGO",
          type: "bogo",
          events: 2,
          weeks: 4,
          discountRate: "0.50",
          brandFundingRate: 1,
          salesLift: "2.0",
        },
        {
          name: "Off Invoice",
          type: "offInvoice",
          weeks: 8,
          discountRate: "0.15",
          brandFundingRate: 1,
          salesLift: "1.25",
        },
      ],
    });
    const deviation = result.promotionalTradeRate.minus("0.0948").abs();
    expect(deviation.lessThanOrEqualTo("0.0002")).toBe(true);
  });
});
