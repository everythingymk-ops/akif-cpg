import type Decimal from "decimal.js";
import { applyMarginSpec } from "./margins";
import { ZERO, dec, decNonNegative, decPositive, fmt } from "./money";
import type { CalculationTrace, DecimalInput, MarginSpec, TraceStep } from "./types";

/**
 * Manufacturer economics (PRD §8): COGS plus an explicit margin-or-markup spec
 * produces the manufacturer sell price. In vertically integrated mode the same
 * function prices the internal transfer (PRD §3C). Detailed COGS mode (PRD §7)
 * builds the COGS from formula / packaging / manufacturing components.
 */

/** Component groups of detailed COGS mode (PRD §7). */
export type CogsComponentCategory = "formula" | "packaging" | "manufacturing";

export const COGS_CATEGORY_LABELS: Record<CogsComponentCategory, string> = {
  formula: "Material Cost",
  packaging: "Packaging Cost",
  manufacturing: "Manufacturing Cost",
};

export interface CogsComponent {
  id?: string;
  name: string;
  category: CogsComponentCategory;
  /** Cost per unit in dollars. */
  amountPerUnit: DecimalInput;
  notes?: string;
}

export interface DetailedCogsResult {
  materialCostPerUnit: Decimal;
  packagingCostPerUnit: Decimal;
  manufacturingCostPerUnit: Decimal;
  totalCogsPerUnit: Decimal;
  trace: CalculationTrace;
}

/** Detailed COGS mode (PRD §7): sum components per category and in total. */
export function buildDetailedCogs(components: CogsComponent[]): DetailedCogsResult {
  const totals: Record<CogsComponentCategory, Decimal> = {
    formula: ZERO,
    packaging: ZERO,
    manufacturing: ZERO,
  };
  for (const component of components) {
    const amount = decNonNegative(
      component.amountPerUnit,
      `COGS component "${component.name}" amountPerUnit`,
    );
    totals[component.category] = totals[component.category].plus(amount);
  }
  const totalCogs = totals.formula.plus(totals.packaging).plus(totals.manufacturing);

  const categorySteps: TraceStep[] = (
    ["formula", "packaging", "manufacturing"] as const
  ).map((category) => ({
    label: COGS_CATEGORY_LABELS[category],
    formula:
      components
        .filter((component) => component.category === category)
        .map((component) => fmt(dec(component.amountPerUnit)))
        .join(" + ") || "0",
    value: totals[category],
  }));

  const trace: CalculationTrace = {
    title: "Total Manufacturing COGS",
    formula: "total COGS = material cost + packaging cost + manufacturing cost",
    inputs: { Components: String(components.length) },
    steps: [
      ...categorySteps,
      {
        label: "Total Manufacturing COGS",
        formula: `${fmt(totals.formula)} + ${fmt(totals.packaging)} + ${fmt(totals.manufacturing)}`,
        value: totalCogs,
      },
    ],
    output: totalCogs,
  };

  return {
    materialCostPerUnit: totals.formula,
    packagingCostPerUnit: totals.packaging,
    manufacturingCostPerUnit: totals.manufacturing,
    totalCogsPerUnit: totalCogs,
    trace,
  };
}

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
