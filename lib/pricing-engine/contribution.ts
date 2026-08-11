import type Decimal from "decimal.js";
import { resolveCostLines } from "./costLines";
import { ZERO, decPositive, decRate01, fmt } from "./money";
import {
  PricingEngineError,
  type CalculationTrace,
  type CostLine,
  type CostResolutionContext,
  type DecimalInput,
  type ResolvedCostLine,
  type TraceStep,
} from "./types";

/**
 * Gross-to-net waterfall and contribution margin (PRD §26–28).
 *
 * Default accounting treatment (PRD §28):
 *   Net Sales = Gross Invoice Revenue − Trade Spend − Revenue Deductions
 *   Contribution = Net Sales − Landed Product Cost − Variable Commercial Costs
 *   Contribution Margin % = Contribution ÷ Net Sales
 *
 * "Contribution Definition Settings" is expressed through data placement:
 * classify a cost as a revenue deduction or as a variable cost by putting its
 * CostLine in the corresponding array (e.g. broker commission defaults to
 * `variableCosts`, but a company may model it in `revenueDeductions`).
 */

export interface GrossToNetInput {
  /** Gross brand invoice price per unit. */
  brandInvoicePricePerUnit: DecimalInput;
  /** Total planned trade spend as a fraction of gross invoice (PRD §21, §23). */
  tradeSpendRate?: DecimalInput;
  /**
   * Revenue deductions between gross and net: returns, allowances, cash
   * discounts, … (PRD §27). `percentOfNetSales` is circular here and rejected.
   */
  revenueDeductions?: CostLine[];
  /**
   * Reference values for %-bases (SRP, COGS, …). `invoicePricePerUnit`
   * defaults to the gross invoice price.
   */
  context?: CostResolutionContext;
}

export interface ContributionInput extends GrossToNetInput {
  landedCostPerUnit: DecimalInput;
  /**
   * Variable commercial costs below net sales: broker, commissions, spoilage,
   * … (PRD §26). `percentOfNetSales` is allowed; `netSalesPerUnit` is always
   * the computed net revenue.
   */
  variableCosts?: CostLine[];
}

export interface GrossToNetResult {
  grossRevenuePerUnit: Decimal;
  tradeSpendRate: Decimal;
  tradeSpendPerUnit: Decimal;
  resolvedDeductions: ResolvedCostLine[];
  deductionsPerUnit: Decimal;
  /** Net Sales per PRD §28. */
  netRevenuePerUnit: Decimal;
  trace: CalculationTrace;
}

export interface ContributionResult extends Omit<GrossToNetResult, "trace"> {
  landedCostPerUnit: Decimal;
  resolvedVariableCosts: ResolvedCostLine[];
  variableCostsPerUnit: Decimal;
  contributionPerUnit: Decimal;
  /** Contribution ÷ Net Sales (PRD §28). */
  contributionMarginRate: Decimal;
  trace: CalculationTrace;
}

function nettingContext(input: GrossToNetInput, gross: Decimal): CostResolutionContext {
  const context: CostResolutionContext = { ...input.context };
  if (context.invoicePricePerUnit === undefined) {
    context.invoicePricePerUnit = gross;
  }
  return context;
}

function assertNoNetSalesBasis(lines: CostLine[], where: string): void {
  const offender = lines.find((line) => line.basis === "percentOfNetSales");
  if (offender) {
    throw new PricingEngineError(
      `${where}: cost line "${offender.name}" uses percentOfNetSales, but net sales is not defined ` +
        `until deductions are subtracted — classify it as a variable cost or use another basis (PRD §28)`,
    );
  }
}

export function computeGrossToNet(input: GrossToNetInput): GrossToNetResult {
  const gross = decPositive(input.brandInvoicePricePerUnit, "brandInvoicePricePerUnit");
  const tradeRate =
    input.tradeSpendRate === undefined ? ZERO : decRate01(input.tradeSpendRate, "tradeSpendRate");
  const deductionLines = input.revenueDeductions ?? [];
  assertNoNetSalesBasis(deductionLines, "revenue deductions");

  const context = nettingContext(input, gross);
  const { resolved, totalPerUnit } = resolveCostLines(deductionLines, context);
  const tradeSpend = gross.times(tradeRate);
  const net = gross.minus(tradeSpend).minus(totalPerUnit);
  if (net.lessThanOrEqualTo(0)) {
    throw new PricingEngineError(
      `net revenue is ${fmt(net)} — trade spend and revenue deductions consume the entire gross invoice`,
    );
  }

  const deductionSteps: TraceStep[] = resolved.map((r) => ({
    label: r.line.name,
    formula: r.detail,
    value: r.perUnit,
  }));

  const trace: CalculationTrace = {
    title: "Gross-to-Net Revenue",
    formula: "net revenue = gross invoice − trade spend − revenue deductions",
    inputs: {
      "Gross invoice / unit": fmt(gross),
      "Trade spend rate": fmt(tradeRate),
      "Deduction lines": String(resolved.length),
    },
    steps: [
      {
        label: "Trade spend",
        formula: `${fmt(gross)} × ${fmt(tradeRate)}`,
        value: tradeSpend,
      },
      ...deductionSteps,
      {
        label: "Net revenue / unit",
        formula: `${fmt(gross)} − ${fmt(tradeSpend)} − ${fmt(totalPerUnit)}`,
        value: net,
      },
    ],
    output: net,
  };

  return {
    grossRevenuePerUnit: gross,
    tradeSpendRate: tradeRate,
    tradeSpendPerUnit: tradeSpend,
    resolvedDeductions: resolved,
    deductionsPerUnit: totalPerUnit,
    netRevenuePerUnit: net,
    trace,
  };
}

export function computeContribution(input: ContributionInput): ContributionResult {
  const grossToNet = computeGrossToNet(input);
  const landedCost = decPositive(input.landedCostPerUnit, "landedCostPerUnit");

  const context = nettingContext(input, grossToNet.grossRevenuePerUnit);
  // Net sales is what this function computes — always use the computed value.
  context.netSalesPerUnit = grossToNet.netRevenuePerUnit;
  const { resolved, totalPerUnit } = resolveCostLines(input.variableCosts ?? [], context);

  const contribution = grossToNet.netRevenuePerUnit.minus(landedCost).minus(totalPerUnit);
  const contributionMarginRate = contribution.dividedBy(grossToNet.netRevenuePerUnit);

  const variableSteps: TraceStep[] = resolved.map((r) => ({
    label: r.line.name,
    formula: r.detail,
    value: r.perUnit,
  }));

  const trace: CalculationTrace = {
    title: "Contribution Margin",
    formula:
      "contribution = net revenue − landed cost − variable costs; " +
      "contribution margin % = contribution ÷ net revenue",
    inputs: {
      ...grossToNet.trace.inputs,
      "Landed cost / unit": fmt(landedCost),
      "Variable cost lines": String(resolved.length),
    },
    steps: [
      ...grossToNet.trace.steps,
      {
        label: "Landed product cost",
        formula: "input",
        value: landedCost,
      },
      ...variableSteps,
      {
        label: "Contribution / unit",
        formula: `${fmt(grossToNet.netRevenuePerUnit)} − ${fmt(landedCost)} − ${fmt(totalPerUnit)}`,
        value: contribution,
      },
      {
        label: "Contribution margin (of net revenue)",
        formula: `${fmt(contribution)} ÷ ${fmt(grossToNet.netRevenuePerUnit)}`,
        value: contributionMarginRate,
      },
    ],
    output: contributionMarginRate,
  };

  return {
    grossRevenuePerUnit: grossToNet.grossRevenuePerUnit,
    tradeSpendRate: grossToNet.tradeSpendRate,
    tradeSpendPerUnit: grossToNet.tradeSpendPerUnit,
    resolvedDeductions: grossToNet.resolvedDeductions,
    deductionsPerUnit: grossToNet.deductionsPerUnit,
    netRevenuePerUnit: grossToNet.netRevenuePerUnit,
    landedCostPerUnit: landedCost,
    resolvedVariableCosts: resolved,
    variableCostsPerUnit: totalPerUnit,
    contributionPerUnit: contribution,
    contributionMarginRate,
    trace,
  };
}
