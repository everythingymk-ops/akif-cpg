import type Decimal from "decimal.js";

/**
 * Accepted input for any monetary or rate value. Plain numbers are converted
 * through their decimal string representation, so `0.15` stays exactly 0.15.
 */
export type DecimalInput = Decimal.Value;

/**
 * Basis of a margin-like field. The two are never interchangeable (PRD §8):
 * - `margin`: profit ÷ selling price → price = cost ÷ (1 − rate)
 * - `markup`: profit ÷ cost         → price = cost × (1 + rate)
 */
export type MarginBasis = "margin" | "markup";

export interface MarginSpec {
  basis: MarginBasis;
  /** Rate as a decimal fraction: 15% → 0.15 (PRD §61). */
  rate: DecimalInput;
}

/** Who pays a cost line (PRD §9). */
export type CostOwner =
  | "manufacturer"
  | "brand"
  | "distributor"
  | "retailer"
  | "shared";

/** How a cost line amount is interpreted (PRD §9). */
export type CalculationBasis =
  | "perUnit"
  | "perCase"
  | "perShipment"
  | "annual"
  | "percentOfCogs"
  | "percentOfInvoice"
  | "percentOfCustomsValue"
  | "percentOfSrp"
  | "percentOfNetSales";

export interface CostLine {
  id?: string;
  name: string;
  /** Dollar amount for $-bases; decimal fraction for %-bases (15% → 0.15). */
  amount: DecimalInput;
  basis: CalculationBasis;
  owner: CostOwner;
  notes?: string;
}

/**
 * Reference values needed to resolve cost lines to a per-unit figure. Only the
 * fields required by the bases actually in use must be provided; a missing
 * required field is a hard error — the engine never assumes a basis value
 * (PRD §9–10, tariff basis is user-selectable).
 */
export interface CostResolutionContext {
  unitsPerCase?: DecimalInput;
  unitsPerShipment?: DecimalInput;
  annualUnits?: DecimalInput;
  cogsPerUnit?: DecimalInput;
  invoicePricePerUnit?: DecimalInput;
  customsValuePerUnit?: DecimalInput;
  srpPerUnit?: DecimalInput;
  netSalesPerUnit?: DecimalInput;
}

export interface ResolvedCostLine {
  line: CostLine;
  perUnit: Decimal;
  /** Human-readable resolution, e.g. "15% of customs value $4.56". */
  detail: string;
}

/** One intermediate step of a calculation (PRD §41, §67). */
export interface TraceStep {
  label: string;
  formula: string;
  value: Decimal;
}

/**
 * Machine-renderable audit of how an output was produced, powering tooltips
 * and the "Show Calculation" / Formula Audit panel (PRD §41, §67).
 */
export interface CalculationTrace {
  title: string;
  /** Canonical formula, e.g. "sell price = COGS ÷ (1 − margin)". */
  formula: string;
  inputs: Record<string, string>;
  steps: TraceStep[];
  output: Decimal;
}

export class PricingEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PricingEngineError";
  }
}
