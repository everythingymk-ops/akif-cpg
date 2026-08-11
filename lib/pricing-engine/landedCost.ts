import type Decimal from "decimal.js";
import { resolveCostLines } from "./costLines";
import { decNonNegative, fmt } from "./money";
import type {
  CalculationTrace,
  CostLine,
  CostResolutionContext,
  DecimalInput,
  ResolvedCostLine,
  TraceStep,
} from "./types";

/**
 * Landed cost build (PRD §10): purchase price plus configurable cost lines
 * (freight, tariff, duty, brokerage, warehousing, …). Each line carries its
 * own calculation basis; the tariff basis in particular is whatever the user
 * selected — never assumed.
 */

export interface LandedCostInput {
  /** Price the buyer pays the manufacturer per unit (invoice / transfer price). */
  purchasePricePerUnit: DecimalInput;
  /** Cost lines between purchase and warehouse (PRD §10). */
  costLines?: CostLine[];
  /**
   * Reference values for %-based lines. `invoicePricePerUnit` defaults to the
   * purchase price (the supplier invoice in a landed-cost build);
   * `customsValuePerUnit` has NO default — the declared customs value is a
   * legal figure the user must provide when a line references it (PRD §10).
   */
  context?: CostResolutionContext;
}

export interface LandedCostResult {
  purchasePricePerUnit: Decimal;
  resolvedLines: ResolvedCostLine[];
  /** Sum of all resolved cost lines per unit. */
  addOnCostPerUnit: Decimal;
  landedCostPerUnit: Decimal;
  trace: CalculationTrace;
}

export function buildLandedCost(input: LandedCostInput): LandedCostResult {
  const purchasePrice = decNonNegative(input.purchasePricePerUnit, "purchasePricePerUnit");

  const context: CostResolutionContext = { ...input.context };
  if (context.invoicePricePerUnit === undefined) {
    context.invoicePricePerUnit = purchasePrice;
  }

  const { resolved, totalPerUnit } = resolveCostLines(input.costLines ?? [], context);
  const landedCost = purchasePrice.plus(totalPerUnit);

  const lineSteps: TraceStep[] = resolved.map((r) => ({
    label: r.line.name,
    formula: r.detail,
    value: r.perUnit,
  }));

  const trace: CalculationTrace = {
    title: "Landed Cost",
    formula: "landed cost = purchase price + Σ cost lines (per unit)",
    inputs: {
      "Purchase price / unit": fmt(purchasePrice),
      "Cost lines": String(resolved.length),
    },
    steps: [
      ...lineSteps,
      {
        label: "Total add-on costs / unit",
        formula: resolved.length > 0
          ? resolved.map((r) => fmt(r.perUnit)).join(" + ")
          : "0",
        value: totalPerUnit,
      },
      {
        label: "Landed cost / unit",
        formula: `${fmt(purchasePrice)} + ${fmt(totalPerUnit)}`,
        value: landedCost,
      },
    ],
    output: landedCost,
  };

  return {
    purchasePricePerUnit: purchasePrice,
    resolvedLines: resolved,
    addOnCostPerUnit: totalPerUnit,
    landedCostPerUnit: landedCost,
    trace,
  };
}
