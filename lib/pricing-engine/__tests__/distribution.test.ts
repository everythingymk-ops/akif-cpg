import { describe, expect, it } from "vitest";
import { priceThroughDistributor } from "../distribution";
import { roundMoney } from "../money";
import type { CostLine } from "../types";

const fee = (name: string, amount: CostLine["amount"], basis: CostLine["basis"]): CostLine =>
  ({ name, amount, basis, owner: "distributor" });

describe("priceThroughDistributor", () => {
  it("reproduces the PRD §96 waterfall slice: $8.90 invoice, 15% margin, $0.50 fee → ≈$10.97", () => {
    const r = priceThroughDistributor({
      brandInvoicePricePerUnit: "8.90",
      marginSpec: { basis: "margin", rate: "0.15" },
      fees: [fee("Distributor Handling", "0.50", "perUnit")],
    });
    expect(roundMoney(r.sellPricePerUnit).toString()).toBe("10.47");
    expect(roundMoney(r.retailerAcquisitionCostPerUnit).toString()).toBe("10.97");
    expect(r.feesPerUnit.equals("0.5")).toBe(true);
    // Realized margin comes back out at 15% (to Decimal display precision).
    expect(r.marginRate.toDecimalPlaces(12).equals("0.15")).toBe(true);
  });

  it("margin and markup bases give different sell prices for the same 15%", () => {
    const margin = priceThroughDistributor({
      brandInvoicePricePerUnit: "8.90",
      marginSpec: { basis: "margin", rate: "0.15" },
    });
    const markup = priceThroughDistributor({
      brandInvoicePricePerUnit: "8.90",
      marginSpec: { basis: "markup", rate: "0.15" },
    });
    expect(markup.sellPricePerUnit.equals("10.235")).toBe(true);
    expect(margin.sellPricePerUnit.equals(markup.sellPricePerUnit)).toBe(false);
  });

  it("resolves case-based fees through the shared cost-line resolver", () => {
    const r = priceThroughDistributor({
      brandInvoicePricePerUnit: "8.90",
      marginSpec: { basis: "margin", rate: "0.15" },
      fees: [fee("Distributor Case Fee", 12, "perCase")],
      context: { unitsPerCase: 24 },
    });
    expect(r.feesPerUnit.equals("0.5")).toBe(true);
  });

  it("percent-of-invoice fees default to the brand invoice price", () => {
    const r = priceThroughDistributor({
      brandInvoicePricePerUnit: "8.90",
      marginSpec: { basis: "margin", rate: "0.15" },
      fees: [fee("Damage Reserve", "0.02", "percentOfInvoice")],
    });
    expect(r.feesPerUnit.equals("0.178")).toBe(true);
  });

  it("reports margin dollars and net acquisition cost", () => {
    const r = priceThroughDistributor({
      brandInvoicePricePerUnit: "8.90",
      marginSpec: { basis: "margin", rate: "0.15" },
    });
    expect(r.netAcquisitionCostPerUnit.equals("8.9")).toBe(true);
    expect(r.marginDollarsPerUnit.equals(r.sellPricePerUnit.minus("8.9"))).toBe(true);
    expect(r.trace.output.equals(r.retailerAcquisitionCostPerUnit)).toBe(true);
  });
});
