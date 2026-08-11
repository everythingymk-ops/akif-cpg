import type Decimal from "decimal.js";
import { applyMarginSpec } from "./margins";
import { dec, decPositive, fmt } from "./money";
import type { CalculationTrace, DecimalInput, MarginSpec } from "./types";

/**
 * Retailer shelf economics (PRD §14–15):
 * SRP = retailer landed cost ÷ (1 − retailer margin) — or the markup variant,
 * with the basis always explicit. Example: $10 landed at 50% margin → $20 SRP.
 */

export interface RetailerPricingInput {
  /** Retailer landed acquisition cost per unit (incl. distributor fees). */
  acquisitionCostPerUnit: DecimalInput;
  /** Retailer margin or markup — basis always explicit (PRD §15). */
  marginSpec: MarginSpec;
}

export interface RetailerPricingResult {
  acquisitionCostPerUnit: Decimal;
  /** Required shelf price (SRP) per unit. */
  srpPerUnit: Decimal;
  /** Retailer gross profit dollars per unit. */
  grossProfitPerUnit: Decimal;
  /** Realized retailer gross margin (profit ÷ SRP), whatever the input basis. */
  marginRate: Decimal;
  /** Realized retailer markup (profit ÷ acquisition cost). */
  markupRate: Decimal;
  trace: CalculationTrace;
}

export function priceRetailerShelf(input: RetailerPricingInput): RetailerPricingResult {
  const acquisitionCost = decPositive(input.acquisitionCostPerUnit, "acquisitionCostPerUnit");
  const rate = dec(input.marginSpec.rate, `retailer ${input.marginSpec.basis} rate`);
  const isMargin = input.marginSpec.basis === "margin";

  const srp = applyMarginSpec(acquisitionCost, input.marginSpec);
  const grossProfit = srp.minus(acquisitionCost);
  const marginRate = grossProfit.dividedBy(srp);
  const markupRate = grossProfit.dividedBy(acquisitionCost);

  const trace: CalculationTrace = {
    title: "Required Shelf Price (SRP)",
    formula: isMargin
      ? "SRP = retailer landed cost ÷ (1 − retailer margin)"
      : "SRP = retailer landed cost × (1 + retailer markup)",
    inputs: {
      "Retailer landed cost / unit": fmt(acquisitionCost),
      [`Retailer ${input.marginSpec.basis} rate`]: fmt(rate),
    },
    steps: [
      {
        label: isMargin
          ? "Apply retailer margin (profit ÷ selling price)"
          : "Apply retailer markup (profit ÷ cost)",
        formula: isMargin
          ? `${fmt(acquisitionCost)} ÷ (1 − ${fmt(rate)})`
          : `${fmt(acquisitionCost)} × (1 + ${fmt(rate)})`,
        value: srp,
      },
      {
        label: "Retailer gross profit / unit",
        formula: `${fmt(srp)} − ${fmt(acquisitionCost)}`,
        value: grossProfit,
      },
    ],
    output: srp,
  };

  return {
    acquisitionCostPerUnit: acquisitionCost,
    srpPerUnit: srp,
    grossProfitPerUnit: grossProfit,
    marginRate,
    markupRate,
    trace,
  };
}
