import { describe, expect, it } from "vitest";
import { computeContribution } from "../contribution";
import { impliedBrandInvoiceAtShelf, requiredSrpForContribution } from "../reversePricing";
import {
  DEFAULT_TRADE_SPEND_SENSITIVITY_RATES,
  computeSensitivityMatrix,
  computeSensitivityTable,
  type SensitivityBaseScenario,
} from "../sensitivity";
import { PricingEngineError, type CostLine } from "../types";

const deductions: CostLine[] = [
  { name: "Deductions", amount: "0.02", basis: "percentOfInvoice", owner: "brand" },
];
const variables: CostLine[] = [
  { name: "Broker", amount: "0.05", basis: "percentOfInvoice", owner: "brand" },
  { name: "Royalty", amount: "0.01", basis: "percentOfNetSales", owner: "brand" },
];

const base: SensitivityBaseScenario = {
  landedCostPerUnit: "5.846875",
  targetContributionRate: "0.08",
  tradeSpendRate: "0.0948",
  revenueDeductions: deductions,
  variableCosts: variables,
  distributor: {
    marginSpec: { basis: "margin", rate: "0.15" },
    fees: [{ name: "Handling", amount: "0.50", basis: "perUnit", owner: "distributor" }],
  },
  retailerMarginSpec: { basis: "margin", rate: "0.48" },
  currentSrpPerUnit: "19.99",
};

describe("computeSensitivityTable — PRD §33–35", () => {
  it("every row equals a direct recomputation of the actual model", () => {
    const table = computeSensitivityTable(base, "tradeSpendRate", DEFAULT_TRADE_SPEND_SENSITIVITY_RATES);
    expect(table.rows).toHaveLength(6);

    for (const row of table.rows) {
      const direct = requiredSrpForContribution({
        landedCostPerUnit: base.landedCostPerUnit,
        targetContributionRate: base.targetContributionRate,
        tradeSpendRate: row.value,
        revenueDeductions: deductions,
        variableCosts: variables,
        distributor: base.distributor,
        retailerMarginSpec: base.retailerMarginSpec,
      });
      expect(row.requiredSrpPerUnit?.toDecimalPlaces(20).equals(direct.requiredSrpPerUnit.toDecimalPlaces(20))).toBe(true);
      expect(row.requiredBrandInvoicePerUnit?.toDecimalPlaces(20).equals(direct.requiredInvoicePerUnit.toDecimalPlaces(20))).toBe(true);

      const implied = impliedBrandInvoiceAtShelf({
        srpPerUnit: "19.99",
        retailerMarginSpec: base.retailerMarginSpec,
        distributor: base.distributor,
      });
      const contribution = computeContribution({
        brandInvoicePricePerUnit: implied.brandInvoicePerUnit,
        tradeSpendRate: row.value,
        revenueDeductions: deductions,
        landedCostPerUnit: base.landedCostPerUnit,
        variableCosts: variables,
      });
      expect(
        row.contributionMarginAtCurrentSrp?.toDecimalPlaces(20).equals(contribution.contributionMarginRate.toDecimalPlaces(20)),
      ).toBe(true);
    }
  });

  it("required SRP rises and contribution at current SRP falls as trade spend grows (§33)", () => {
    const table = computeSensitivityTable(base, "tradeSpendRate", DEFAULT_TRADE_SPEND_SENSITIVITY_RATES);
    for (let i = 1; i < table.rows.length; i += 1) {
      expect(table.rows[i].requiredSrpPerUnit!.greaterThan(table.rows[i - 1].requiredSrpPerUnit!)).toBe(true);
      expect(
        table.rows[i].contributionMarginAtCurrentSrp!.lessThan(table.rows[i - 1].contributionMarginAtCurrentSrp!),
      ).toBe(true);
    }
    // At 30% trade spend this scenario goes under water at the current shelf price.
    expect(table.rows[5].contributionMarginAtCurrentSrp!.lessThan(0)).toBe(true);
  });

  it("varying the retailer margin preserves the base spec's basis", () => {
    const markupBase: SensitivityBaseScenario = {
      ...base,
      retailerMarginSpec: { basis: "markup", rate: "0.9" },
    };
    const table = computeSensitivityTable(markupBase, "retailerMarginRate", ["0.8"]);
    const direct = requiredSrpForContribution({
      landedCostPerUnit: base.landedCostPerUnit,
      targetContributionRate: base.targetContributionRate,
      tradeSpendRate: base.tradeSpendRate,
      revenueDeductions: deductions,
      variableCosts: variables,
      distributor: base.distributor,
      retailerMarginSpec: { basis: "markup", rate: "0.8" },
    });
    expect(table.rows[0].requiredSrpPerUnit?.toDecimalPlaces(20).equals(direct.requiredSrpPerUnit.toDecimalPlaces(20))).toBe(true);
  });

  it("refuses to vary a distributor margin when the scenario has no distributor", () => {
    const direct: SensitivityBaseScenario = { ...base, distributor: undefined };
    expect(() => computeSensitivityTable(direct, "distributorMarginRate", ["0.15"])).toThrow(
      PricingEngineError,
    );
  });

  it("marks impossible values as infeasible instead of failing the table", () => {
    const table = computeSensitivityTable(base, "retailerMarginRate", ["0.48", "1"]);
    expect(table.rows[0].requiredSrpPerUnit).toBeDefined();
    expect(table.rows[0].infeasible).toBeUndefined();
    expect(table.rows[1].requiredSrpPerUnit).toBeUndefined();
    expect(table.rows[1].infeasible).toMatch(/margin rate must be < 1/);
  });
});

describe("computeSensitivityMatrix — PRD §36", () => {
  it("each cell equals the direct two-variable recomputation", () => {
    const matrix = computeSensitivityMatrix(
      base,
      "tradeSpendRate",
      ["0.10", "0.20"],
      "retailerMarginRate",
      ["0.45", "0.48", "0.50"],
      "requiredSrp",
    );
    expect(matrix.cells).toHaveLength(2);
    expect(matrix.cells[0]).toHaveLength(3);

    const direct = requiredSrpForContribution({
      landedCostPerUnit: base.landedCostPerUnit,
      targetContributionRate: base.targetContributionRate,
      tradeSpendRate: "0.20",
      revenueDeductions: deductions,
      variableCosts: variables,
      distributor: base.distributor,
      retailerMarginSpec: { basis: "margin", rate: "0.50" },
    });
    expect(matrix.cells[1][2].value?.toDecimalPlaces(20).equals(direct.requiredSrpPerUnit.toDecimalPlaces(20))).toBe(true);
  });

  it("supports contribution-at-current-SRP as the cell metric", () => {
    const matrix = computeSensitivityMatrix(
      base,
      "tradeSpendRate",
      ["0.10"],
      "retailerMarginRate",
      ["0.48"],
      "contributionMarginAtCurrentSrp",
    );
    expect(matrix.cells[0][0].value).toBeDefined();
  });

  it("validates its inputs", () => {
    expect(() =>
      computeSensitivityMatrix(base, "tradeSpendRate", ["0.1"], "tradeSpendRate", ["0.2"], "requiredSrp"),
    ).toThrow(/must differ/);
    const withoutSrp: SensitivityBaseScenario = { ...base, currentSrpPerUnit: undefined };
    expect(() =>
      computeSensitivityMatrix(
        withoutSrp,
        "tradeSpendRate",
        ["0.1"],
        "retailerMarginRate",
        ["0.48"],
        "contributionMarginAtCurrentSrp",
      ),
    ).toThrow(/currentSrpPerUnit/);
  });

  it("isolates infeasible cells", () => {
    const matrix = computeSensitivityMatrix(
      base,
      "retailerMarginRate",
      ["0.48", "1"],
      "tradeSpendRate",
      ["0.10"],
      "requiredSrp",
    );
    expect(matrix.cells[0][0].value).toBeDefined();
    expect(matrix.cells[1][0].infeasible).toBeDefined();
  });
});
