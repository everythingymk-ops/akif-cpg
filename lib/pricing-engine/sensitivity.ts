import type Decimal from "decimal.js";
import { computeContribution } from "./contribution";
import { dec, fmt } from "./money";
import {
  impliedBrandInvoiceAtShelf,
  requiredSrpForContribution,
  type DistributorAssumptions,
} from "./reversePricing";
import {
  PricingEngineError,
  type CalculationTrace,
  type CostLine,
  type CostResolutionContext,
  type DecimalInput,
  type MarginSpec,
} from "./types";

/**
 * Sensitivity analysis (PRD §33–36): vary one assumption (table) or two
 * (matrix) and recompute the actual model for every value — required brand
 * invoice, required SRP and, when a current SRP is given, the contribution
 * the current shelf price leaves after chaining back down to the implied
 * brand invoice.
 *
 * Infeasible combinations (e.g. a 100% margin) do not fail the whole grid:
 * the affected row/cell carries `infeasible` with the engine's reason.
 */

export interface SensitivityBaseScenario {
  landedCostPerUnit: DecimalInput;
  targetContributionRate: DecimalInput;
  tradeSpendRate?: DecimalInput;
  revenueDeductions?: CostLine[];
  variableCosts?: CostLine[];
  context?: CostResolutionContext;
  /** Omit for a direct brand → retailer route. */
  distributor?: DistributorAssumptions;
  retailerMarginSpec: MarginSpec;
  /** Enables "contribution at current SRP" outputs (PRD §33). */
  currentSrpPerUnit?: DecimalInput;
}

export type SensitivityVariable =
  | "tradeSpendRate"
  | "retailerMarginRate"
  | "distributorMarginRate"
  | "landedCostPerUnit"
  | "targetContributionRate";

/** PRD §33 default trade spend test points. */
export const DEFAULT_TRADE_SPEND_SENSITIVITY_RATES: readonly string[] = [
  "0.05", "0.10", "0.15", "0.20", "0.25", "0.30",
];
/** PRD §34 default retailer margin test points. */
export const DEFAULT_RETAILER_MARGIN_SENSITIVITY_RATES: readonly string[] = [
  "0.40", "0.42", "0.45", "0.48", "0.50", "0.52", "0.55",
];
/** PRD §35 default distributor margin test points. */
export const DEFAULT_DISTRIBUTOR_MARGIN_SENSITIVITY_RATES: readonly string[] = [
  "0.10", "0.12", "0.15", "0.18", "0.20", "0.25",
];

export interface SensitivityRow {
  variable: SensitivityVariable;
  value: Decimal;
  requiredBrandInvoicePerUnit?: Decimal;
  requiredSrpPerUnit?: Decimal;
  /** Contribution margin at the current SRP (needs currentSrpPerUnit). */
  contributionMarginAtCurrentSrp?: Decimal;
  contributionDollarsAtCurrentSrp?: Decimal;
  /** Set when this value cannot be computed; carries the engine's reason. */
  infeasible?: string;
}

export interface SensitivityTableResult {
  variable: SensitivityVariable;
  rows: SensitivityRow[];
  trace: CalculationTrace;
}

/** Return a copy of the scenario with one variable replaced. */
export function applySensitivityValue(
  base: SensitivityBaseScenario,
  variable: SensitivityVariable,
  value: DecimalInput,
): SensitivityBaseScenario {
  switch (variable) {
    case "tradeSpendRate":
      return { ...base, tradeSpendRate: value };
    case "landedCostPerUnit":
      return { ...base, landedCostPerUnit: value };
    case "targetContributionRate":
      return { ...base, targetContributionRate: value };
    case "retailerMarginRate":
      return {
        ...base,
        retailerMarginSpec: { basis: base.retailerMarginSpec.basis, rate: value },
      };
    case "distributorMarginRate": {
      if (!base.distributor) {
        throw new PricingEngineError(
          "cannot vary the distributor margin — the base scenario has no distributor",
        );
      }
      return {
        ...base,
        distributor: {
          ...base.distributor,
          marginSpec: { basis: base.distributor.marginSpec.basis, rate: value },
        },
      };
    }
  }
}

interface ScenarioOutputs {
  requiredBrandInvoicePerUnit: Decimal;
  requiredSrpPerUnit: Decimal;
  contributionMarginAtCurrentSrp?: Decimal;
  contributionDollarsAtCurrentSrp?: Decimal;
}

function computeScenarioOutputs(scenario: SensitivityBaseScenario): ScenarioOutputs {
  const required = requiredSrpForContribution({
    landedCostPerUnit: scenario.landedCostPerUnit,
    targetContributionRate: scenario.targetContributionRate,
    tradeSpendRate: scenario.tradeSpendRate,
    revenueDeductions: scenario.revenueDeductions,
    variableCosts: scenario.variableCosts,
    context: scenario.context,
    distributor: scenario.distributor,
    retailerMarginSpec: scenario.retailerMarginSpec,
  });

  const outputs: ScenarioOutputs = {
    requiredBrandInvoicePerUnit: required.requiredInvoicePerUnit,
    requiredSrpPerUnit: required.requiredSrpPerUnit,
  };

  if (scenario.currentSrpPerUnit !== undefined) {
    const implied = impliedBrandInvoiceAtShelf({
      srpPerUnit: scenario.currentSrpPerUnit,
      retailerMarginSpec: scenario.retailerMarginSpec,
      distributor: scenario.distributor,
      context: scenario.context,
    });
    const contribution = computeContribution({
      brandInvoicePricePerUnit: implied.brandInvoicePerUnit,
      tradeSpendRate: scenario.tradeSpendRate,
      revenueDeductions: scenario.revenueDeductions,
      landedCostPerUnit: scenario.landedCostPerUnit,
      variableCosts: scenario.variableCosts,
      context: scenario.context,
    });
    outputs.contributionMarginAtCurrentSrp = contribution.contributionMarginRate;
    outputs.contributionDollarsAtCurrentSrp = contribution.contributionPerUnit;
  }

  return outputs;
}

/** 1-variable sensitivity table (PRD §33–35). */
export function computeSensitivityTable(
  base: SensitivityBaseScenario,
  variable: SensitivityVariable,
  values: readonly DecimalInput[],
): SensitivityTableResult {
  if (variable === "distributorMarginRate" && !base.distributor) {
    throw new PricingEngineError(
      "cannot vary the distributor margin — the base scenario has no distributor",
    );
  }

  const rows: SensitivityRow[] = values.map((raw) => {
    const value = dec(raw, `${variable} sensitivity value`);
    try {
      const outputs = computeScenarioOutputs(applySensitivityValue(base, variable, value));
      return { variable, value, ...outputs };
    } catch (error) {
      if (error instanceof PricingEngineError) {
        return { variable, value, infeasible: error.message };
      }
      throw error;
    }
  });

  const trace: CalculationTrace = {
    title: `Sensitivity: ${variable}`,
    formula:
      "for each value: required invoice & SRP from the target contribution; " +
      "contribution at the current SRP from the implied brand invoice",
    inputs: {
      Variable: variable,
      Values: values.map((v) => fmt(v)).join(", "),
    },
    steps: rows
      .filter((row) => row.requiredSrpPerUnit !== undefined)
      .map((row) => ({
        label: `${variable} = ${fmt(row.value)}`,
        formula: "required SRP",
        value: row.requiredSrpPerUnit as Decimal,
      })),
    output: dec(rows.length),
  };

  return { variable, rows, trace };
}

export type SensitivityMetric = "requiredSrp" | "contributionMarginAtCurrentSrp";

export interface SensitivityCell {
  rowValue: Decimal;
  columnValue: Decimal;
  value?: Decimal;
  infeasible?: string;
}

export interface SensitivityMatrixResult {
  rowVariable: SensitivityVariable;
  columnVariable: SensitivityVariable;
  metric: SensitivityMetric;
  /** cells[rowIndex][columnIndex]. */
  cells: SensitivityCell[][];
  trace: CalculationTrace;
}

/** 2-variable scenario matrix (PRD §36): every cell shows one chosen metric. */
export function computeSensitivityMatrix(
  base: SensitivityBaseScenario,
  rowVariable: SensitivityVariable,
  rowValues: readonly DecimalInput[],
  columnVariable: SensitivityVariable,
  columnValues: readonly DecimalInput[],
  metric: SensitivityMetric,
): SensitivityMatrixResult {
  if (rowVariable === columnVariable) {
    throw new PricingEngineError("matrix row and column variables must differ");
  }
  if (metric === "contributionMarginAtCurrentSrp" && base.currentSrpPerUnit === undefined) {
    throw new PricingEngineError(
      "metric contributionMarginAtCurrentSrp needs currentSrpPerUnit in the base scenario",
    );
  }
  for (const variable of [rowVariable, columnVariable]) {
    if (variable === "distributorMarginRate" && !base.distributor) {
      throw new PricingEngineError(
        "cannot vary the distributor margin — the base scenario has no distributor",
      );
    }
  }

  const cells: SensitivityCell[][] = rowValues.map((rawRow) => {
    const rowValue = dec(rawRow, `${rowVariable} matrix value`);
    return columnValues.map((rawColumn) => {
      const columnValue = dec(rawColumn, `${columnVariable} matrix value`);
      try {
        const scenario = applySensitivityValue(
          applySensitivityValue(base, rowVariable, rowValue),
          columnVariable,
          columnValue,
        );
        const outputs = computeScenarioOutputs(scenario);
        const value =
          metric === "requiredSrp"
            ? outputs.requiredSrpPerUnit
            : outputs.contributionMarginAtCurrentSrp;
        return { rowValue, columnValue, value };
      } catch (error) {
        if (error instanceof PricingEngineError) {
          return { rowValue, columnValue, infeasible: error.message };
        }
        throw error;
      }
    });
  });

  const trace: CalculationTrace = {
    title: `Sensitivity matrix: ${rowVariable} × ${columnVariable}`,
    formula: `each cell = ${metric} recomputed from the full model`,
    inputs: {
      Rows: `${rowVariable}: ${rowValues.map((v) => fmt(v)).join(", ")}`,
      Columns: `${columnVariable}: ${columnValues.map((v) => fmt(v)).join(", ")}`,
      Metric: metric,
    },
    steps: [],
    output: dec(rowValues.length * columnValues.length),
  };

  return { rowVariable, columnVariable, metric, cells, trace };
}
