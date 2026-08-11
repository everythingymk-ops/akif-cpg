import type { MarginBasis, Promotion } from "@/lib/pricing-engine";

/**
 * Editable assumption set backing the main pricing screen (PRD §58, §97).
 * Values are kept as raw strings (form state); the engine parses and
 * validates them in computeScenario. Rates are decimal fractions (PRD §61):
 * 15% is stored as "0.15".
 */
export interface ScenarioAssumptions {
  productName: string;
  sku: string;

  // Manufacturing (PRD §6, §8)
  cogsPerUnit: string;
  manufacturerMarginBasis: MarginBasis;
  manufacturerMarginRate: string;

  // Landed cost (PRD §10). Customs value = manufacturer purchase price here;
  // detailed per-line configuration arrives with product setup (roadmap step 6).
  internationalFreightPerUnit: string;
  tariffRate: string;
  domesticFreightPerUnit: string;

  // Channel (PRD §12–13)
  useDistributor: boolean;
  distributorMarginBasis: MarginBasis;
  distributorMarginRate: string;
  distributorHandlingFeePerUnit: string;

  // Retailer (PRD §14–15)
  retailerMarginBasis: MarginBasis;
  retailerMarginRate: string;

  // Commercial (PRD §26–28)
  brokerRate: string; // % of invoice, variable cost
  deductionsRate: string; // % of invoice, revenue deduction

  // Trade spend (PRD §16): Mode A manual rate, or Mode B built from the
  // promotional calendar (strongly encouraged). Reserve applies to both (§23).
  tradeSpendMode: "manual" | "calendar";
  tradeSpendRate: string;
  additionalReserveRate: string;
  /** Calendar mode (PRD §17): promotion rows; values entered as strings. */
  promotions: Promotion[];
  /** Planning horizon in weeks (PRD §21). */
  annualWeeks: string;
  /**
   * Actual-units context (PRD §21): required when promotions carry fixed
   * event fees, flat costs or unit forecasts; empty otherwise.
   */
  normalWeeklyUnits: string;
  plannerInvoiceReferencePerUnit: string;

  // Targets & shelf (PRD §30–32, §95)
  targetContributionRate: string;
  currentSrpPerUnit: string;
  targetSrpPerUnit: string; // optional, empty = unset
}

/** In-memory demo product wired to the screen (roadmap step 5; numbers per PRD §99). */
export const DEMO_ASSUMPTIONS: ScenarioAssumptions = {
  productName: "Example Supplement 60 Count",
  sku: "DEMO-SUP-60",

  cogsPerUnit: "3.65",
  manufacturerMarginBasis: "margin",
  manufacturerMarginRate: "0.20",

  internationalFreightPerUnit: "0.35",
  tariffRate: "0.15",
  domesticFreightPerUnit: "0.25",

  useDistributor: true,
  distributorMarginBasis: "margin",
  distributorMarginRate: "0.15",
  distributorHandlingFeePerUnit: "0.50",

  retailerMarginBasis: "margin",
  retailerMarginRate: "0.48",

  brokerRate: "0.05",
  deductionsRate: "0.02",

  tradeSpendMode: "manual",
  tradeSpendRate: "0.0948",
  additionalReserveRate: "0.02",
  promotions: [],
  annualWeeks: "52",
  normalWeeklyUnits: "",
  plannerInvoiceReferencePerUnit: "",

  targetContributionRate: "0.08",
  currentSrpPerUnit: "19.99",
  targetSrpPerUnit: "",
};
