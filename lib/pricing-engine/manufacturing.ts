import type Decimal from "decimal.js";
import { applyMarginSpec } from "./margins";
import { dec, decPositive, fmt } from "./money";
import type { CalculationTrace, DecimalInput, MarginSpec } from "./types";

/**
 * Manufacturer economics (PRD §8): COGS plus an explicit margin-or-markup spec
 * produces the manufacturer sell price. In vertically integrated mode the same
 * function prices the internal transfer (PRD §3C).
 */

export interface ManufacturerPricingInput {
  /** Manufacturing COGS per unit. */
  cogsPerUnit: DecimalInput;
  /** Target manufacturer margin or markup — basis always explicit (PRD §8). */
  marginSpec: MarginSpec;
}

export interface ManufacturerPricingResult {
  cogsPerUnit: Decimal;
  /** Manufacturer sell price (or internal transfer price) per unit. */
  sellPricePerUnit: Decimal;
  profitPerUnit: Decimal;
  /** Realized margin (profit ÷ sell price), whatever the input basis. */
  marginRate: Decimal;
  /** Realized markup (profit ÷ COGS), whatever the input basis. */
  markupRate: Decimal;
  trace: CalculationTrace;
}

export function priceManufacturerSale(
  input: ManufacturerPricingInput,
): ManufacturerPricingResult {
  const cogs = decPositive(input.cogsPerUnit, "cogsPerUnit");
  const rate = dec(input.marginSpec.rate, `manufacturer ${input.marginSpec.basis} rate`);
  const isMargin = input.marginSpec.basis === "margin";

  const sellPrice = applyMarginSpec(cogs, input.marginSpec);
  const profit = sellPrice.minus(cogs);
  const marginRate = profit.dividedBy(sellPrice);
  const markupRate = profit.dividedBy(cogs);

  const trace: CalculationTrace = {
    title: "Manufacturer Sell Price",
    formula: isMargin
      ? "sell price = COGS ÷ (1 − margin)"
      : "sell price = COGS × (1 + markup)",
    inputs: {
      "Manufacturing COGS / unit": fmt(cogs),
      [`Manufacturer ${input.marginSpec.basis} rate`]: fmt(rate),
    },
    steps: [
      {
        label: isMargin
          ? "Apply margin (profit ÷ selling price)"
          : "Apply markup (profit ÷ cost)",
        formula: isMargin
          ? `${fmt(cogs)} ÷ (1 − ${fmt(rate)})`
          : `${fmt(cogs)} × (1 + ${fmt(rate)})`,
        value: sellPrice,
      },
      {
        label: "Manufacturer profit / unit",
        formula: `${fmt(sellPrice)} − ${fmt(cogs)}`,
        value: profit,
      },
    ],
    output: sellPrice,
  };

  return {
    cogsPerUnit: cogs,
    sellPricePerUnit: sellPrice,
    profitPerUnit: profit,
    marginRate,
    markupRate,
    trace,
  };
}
