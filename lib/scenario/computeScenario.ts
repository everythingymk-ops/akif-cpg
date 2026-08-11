import type Decimal from "decimal.js";
import {
  PricingEngineError,
  buildLandedCost,
  computeBreakEven,
  computeContribution,
  computeImprovementLevers,
  computePriceGap,
  computeTradeSpendActualUnits,
  computeTradeSpendNormalized,
  dec,
  findTradeSpendBand,
  impliedBrandInvoiceAtShelf,
  priceManufacturerSale,
  priceRetailerShelf,
  priceThroughDistributor,
  requiredSrpForContribution,
  reversePriceFromShelf,
  runAdvisor,
  validateModel,
  type AdvisorInsight,
  type CalculationTrace,
  type ContributionResult,
  type CostLine,
  type DecimalInput,
  type DistributorAssumptions,
  type ImprovementResult,
  type LandedCostResult,
  type ManufacturerPricingResult,
  type PriceGapResult,
  type Promotion,
  type SensitivityBaseScenario,
  type TradeSpendBand,
  type TradeSpendResult,
  type ValidationWarning,
} from "@/lib/pricing-engine";
import type { ScenarioAssumptions } from "./assumptions";

/**
 * Pure composition layer: assumptions in, every screen figure out.
 * No formulas live in React components (PRD §66, §98) — components render
 * what this module returns. Everything here delegates to the pricing engine;
 * the only arithmetic is the §23 stack (promo rate + reserve) via Decimal.
 */

export interface WaterfallStage {
  id: string;
  label: string;
  /** Cumulative price point at this stage. */
  value: Decimal;
  /** Increment from the previous stage (undefined for the first stage). */
  delta?: Decimal;
  /** Present when the stage is a calculated number (PRD §41, §67). */
  trace?: CalculationTrace;
}

export interface ScenarioOptions {
  /** Editable trade-spend planning bands (PRD §24, §55); defaults apply if omitted. */
  tradeSpendBands?: readonly TradeSpendBand[];
}

export interface ComputedScenario {
  manufacturer: ManufacturerPricingResult;
  landed: LandedCostResult;
  tradeSpend: {
    mode: "manual" | "calendar";
    promotionalRate: Decimal;
    reserveRate: Decimal;
    totalRate: Decimal;
    /** Present in calendar mode (PRD §16 Mode B). */
    plan?: TradeSpendResult;
    /** Planning band the total rate falls into (PRD §24). */
    band?: TradeSpendBand;
  };
  requiredInvoicePerUnit: Decimal;
  requiredSrpPerUnit: Decimal;
  requiredSrpTrace: CalculationTrace;
  requiredNetRevenuePerUnit: Decimal;
  retailerAcquisitionAtRequired: Decimal;
  atCurrentSrp?: {
    srpPerUnit: Decimal;
    impliedInvoicePerUnit: Decimal;
    retailerAcquisitionCostPerUnit: Decimal;
    contribution: ContributionResult;
  };
  priceGap?: PriceGapResult;
  breakEvenSrpPerUnit?: Decimal;
  /** §43 dollar allocation of the current shelf price. */
  dollarAllocation?: AllocationSlice[];
  /** §73 improvement levers, computed when a current SRP exists. */
  improvement?: ImprovementResult;
  /** Shared base for on-demand sensitivity/reverse computations (steps 4/8). */
  sensitivityBase: SensitivityBaseScenario;
  waterfall: WaterfallStage[];
  insights: AdvisorInsight[];
  warnings: ValidationWarning[];
}

/** One slice of the §43 "where does the consumer dollar go" view. */
export interface AllocationSlice {
  id: string;
  label: string;
  amount: Decimal;
  /** Share of the shelf price (amount ÷ SRP). */
  share: Decimal;
}

export type ScenarioComputation =
  | { ok: true; scenario: ComputedScenario }
  | { ok: false; error: string };

function optional(value: string): string | undefined {
  return value.trim() === "" ? undefined : value.trim();
}

export function computeScenario(
  assumptions: ScenarioAssumptions,
  options?: ScenarioOptions,
): ScenarioComputation {
  try {
    return { ok: true, scenario: compute(assumptions, options) };
  } catch (error) {
    if (error instanceof PricingEngineError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}

/** Trim empty-string optionals off a promotion draft before the engine sees it. */
function sanitizePromotion(promotion: Promotion): Promotion {
  const clean = (value: DecimalInput | undefined): DecimalInput | undefined =>
    value === undefined || String(value).trim() === "" ? undefined : value;
  return {
    ...promotion,
    events: clean(promotion.events),
    retailerFundingRate: clean(promotion.retailerFundingRate),
    distributorFundingRate: clean(promotion.distributorFundingRate),
    fixedEventFee: clean(promotion.fixedEventFee),
    additionalCost: clean(promotion.additionalCost),
    estimatedUnits: clean(promotion.estimatedUnits),
    startDate: promotion.startDate?.trim() ? promotion.startDate : undefined,
    endDate: promotion.endDate?.trim() ? promotion.endDate : undefined,
  };
}

/** True when a value is present and non-zero (or unparseable — the engine reports those). */
function requiresActualUnits(value: DecimalInput | undefined): boolean {
  if (value === undefined || String(value).trim() === "") return false;
  try {
    return dec(value).greaterThan(0);
  } catch {
    return true;
  }
}

/**
 * Calendar-mode trade spend (PRD §16 Mode B, §21): shared by the pricing
 * screen and the Promotion Planner so a draft previews exactly what applying
 * it will compute. Throws PricingEngineError with an actionable message when
 * fixed fees are present without the actual-units context.
 */
export function computePlannedTradeSpend(input: {
  promotions: Promotion[];
  annualWeeks: string;
  additionalReserveRate: string;
  normalWeeklyUnits: string;
  plannerInvoiceReferencePerUnit: string;
}): TradeSpendResult {
  const promotions = input.promotions.map(sanitizePromotion);
  const planInput = {
    annualWeeks: input.annualWeeks.trim() === "" ? "52" : input.annualWeeks,
    promotions,
    additionalReserveRate: input.additionalReserveRate || "0",
  };
  const needsActualUnits = promotions.some(
    (promotion) =>
      requiresActualUnits(promotion.fixedEventFee) ||
      requiresActualUnits(promotion.additionalCost) ||
      requiresActualUnits(promotion.estimatedUnits),
  );
  return needsActualUnits
    ? computeTradeSpendActualUnits(planInput, {
        normalWeeklyUnits: input.normalWeeklyUnits,
        brandInvoicePricePerUnit: input.plannerInvoiceReferencePerUnit,
      })
    : computeTradeSpendNormalized(planInput);
}

function compute(a: ScenarioAssumptions, options?: ScenarioOptions): ComputedScenario {
  // 1. Manufacturer economics (PRD §8).
  const manufacturer = priceManufacturerSale({
    cogsPerUnit: a.cogsPerUnit,
    marginSpec: { basis: a.manufacturerMarginBasis, rate: a.manufacturerMarginRate },
  });

  // 2. Landed cost (PRD §10). Customs value = purchase price in this screen.
  const landedCostLines: CostLine[] = [
    { name: "International Freight", amount: a.internationalFreightPerUnit, basis: "perUnit", owner: "brand" },
    { name: "Tariff", amount: a.tariffRate, basis: "percentOfCustomsValue", owner: "brand" },
    { name: "Domestic Freight", amount: a.domesticFreightPerUnit, basis: "perUnit", owner: "brand" },
  ];
  const landed = buildLandedCost({
    purchasePricePerUnit: manufacturer.sellPricePerUnit,
    costLines: landedCostLines,
    context: { customsValuePerUnit: manufacturer.sellPricePerUnit },
  });

  // 3. Trade spend (PRD §16): Mode A manual rate + reserve (§23), or Mode B —
  //    the promotional calendar priced by the trade spend engine (§21).
  const reserveRate = dec(a.additionalReserveRate || "0", "additionalReserveRate");
  const promotions = a.promotions.map(sanitizePromotion);
  let tradeSpendPlan: TradeSpendResult | undefined;
  let promotionalRate: Decimal;
  let totalTradeRate: Decimal;
  if (a.tradeSpendMode === "calendar") {
    tradeSpendPlan = computePlannedTradeSpend({
      promotions: a.promotions,
      annualWeeks: a.annualWeeks,
      additionalReserveRate: a.additionalReserveRate,
      normalWeeklyUnits: a.normalWeeklyUnits,
      plannerInvoiceReferencePerUnit: a.plannerInvoiceReferencePerUnit,
    });
    promotionalRate = tradeSpendPlan.promotionalTradeRate;
    totalTradeRate = tradeSpendPlan.totalTradeRate;
  } else {
    promotionalRate = dec(a.tradeSpendRate, "tradeSpendRate");
    totalTradeRate = promotionalRate.plus(reserveRate);
  }
  const tradeSpendBand = findTradeSpendBand(totalTradeRate, options?.tradeSpendBands);

  const revenueDeductions: CostLine[] = [
    { name: "Deductions", amount: a.deductionsRate, basis: "percentOfInvoice", owner: "brand" },
  ];
  const variableCosts: CostLine[] = [
    { name: "Broker Commission", amount: a.brokerRate, basis: "percentOfInvoice", owner: "brand" },
  ];
  const distributor: DistributorAssumptions | undefined = a.useDistributor
    ? {
        marginSpec: { basis: a.distributorMarginBasis, rate: a.distributorMarginRate },
        fees: [
          {
            name: "Distributor Handling",
            amount: a.distributorHandlingFeePerUnit,
            basis: "perUnit",
            owner: "distributor",
          },
        ],
      }
    : undefined;
  const retailerMarginSpec = { basis: a.retailerMarginBasis, rate: a.retailerMarginRate } as const;

  // 4. Required invoice & SRP for the contribution target (PRD §29, §32).
  const required = requiredSrpForContribution({
    landedCostPerUnit: landed.landedCostPerUnit,
    targetContributionRate: a.targetContributionRate,
    tradeSpendRate: totalTradeRate,
    revenueDeductions,
    variableCosts,
    distributor,
    retailerMarginSpec,
  });

  // Recompute the channel legs at the required invoice for waterfall traces.
  const distributorAtRequired = distributor
    ? priceThroughDistributor({
        brandInvoicePricePerUnit: required.requiredInvoicePerUnit,
        marginSpec: distributor.marginSpec,
        fees: distributor.fees,
      })
    : undefined;
  const retailerAtRequired = priceRetailerShelf({
    acquisitionCostPerUnit: required.retailerAcquisitionCostPerUnit,
    marginSpec: retailerMarginSpec,
  });

  // 5. Economics at the current shelf price (PRD §95).
  const currentSrp = optional(a.currentSrpPerUnit);
  let atCurrentSrp: ComputedScenario["atCurrentSrp"];
  let priceGap: PriceGapResult | undefined;
  let dollarAllocation: AllocationSlice[] | undefined;
  let improvement: ImprovementResult | undefined;
  if (currentSrp !== undefined) {
    const implied = impliedBrandInvoiceAtShelf({
      srpPerUnit: currentSrp,
      retailerMarginSpec,
      distributor,
    });
    const contribution = computeContribution({
      brandInvoicePricePerUnit: implied.brandInvoicePerUnit,
      tradeSpendRate: totalTradeRate,
      revenueDeductions,
      landedCostPerUnit: landed.landedCostPerUnit,
      variableCosts,
    });
    atCurrentSrp = {
      srpPerUnit: implied.srpPerUnit,
      impliedInvoicePerUnit: implied.brandInvoicePerUnit,
      retailerAcquisitionCostPerUnit: implied.retailerAcquisitionCostPerUnit,
      contribution,
    };

    // §43 dollar allocation: decompose the consumer dollar from already
    // computed engine outputs (differences of adjacent chain stages).
    const srp = implied.srpPerUnit;
    const slices: AllocationSlice[] = [];
    const pushSlice = (id: string, label: string, amount: Decimal) =>
      slices.push({ id, label, amount, share: amount.dividedBy(srp) });
    pushSlice("retailer", "Retailer", srp.minus(implied.retailerAcquisitionCostPerUnit));
    if (distributor) {
      pushSlice(
        "distributor",
        "Distributor",
        implied.retailerAcquisitionCostPerUnit.minus(implied.brandInvoicePerUnit),
      );
    }
    pushSlice("trade-spend", "Trade spend", contribution.tradeSpendPerUnit);
    pushSlice("deductions", "Deductions", contribution.deductionsPerUnit);
    pushSlice("variable-costs", "Broker & variable costs", contribution.variableCostsPerUnit);
    pushSlice("logistics", "Logistics & duty", landed.addOnCostPerUnit);
    pushSlice("manufacturing", "Manufacturing COGS", manufacturer.cogsPerUnit);
    pushSlice("manufacturer-profit", "Manufacturer profit", manufacturer.profitPerUnit);
    pushSlice("contribution", "Brand contribution", contribution.contributionPerUnit);
    dollarAllocation = slices;

    // §73 improvement levers.
    try {
      improvement = computeImprovementLevers({
        landedCostPerUnit: landed.landedCostPerUnit,
        targetContributionRate: a.targetContributionRate,
        currentSrpPerUnit: currentSrp,
        tradeSpendRate: totalTradeRate,
        revenueDeductions,
        variableCosts,
        distributor,
        retailerMarginSpec,
      });
    } catch (error) {
      if (!(error instanceof PricingEngineError)) throw error;
    }

    // Pricing gap (PRD §31): actual landed cost vs what the current SRP supports.
    try {
      const reverse = reversePriceFromShelf({
        targetSrpPerUnit: currentSrp,
        retailerMarginSpec,
        distributor,
        targetContributionRate: a.targetContributionRate,
        tradeSpendRate: totalTradeRate,
        revenueDeductions,
        variableCosts,
      });
      priceGap = computePriceGap(landed.landedCostPerUnit, reverse.maxLandedCostPerUnit);
    } catch (error) {
      if (!(error instanceof PricingEngineError)) throw error;
    }
  }

  // Shared base for the on-demand sensitivity / reverse-pricing tabs.
  const sensitivityBase: SensitivityBaseScenario = {
    landedCostPerUnit: landed.landedCostPerUnit,
    targetContributionRate: a.targetContributionRate,
    tradeSpendRate: totalTradeRate,
    revenueDeductions,
    variableCosts,
    distributor,
    retailerMarginSpec,
    currentSrpPerUnit: currentSrp,
  };

  // 6. Break-even SRP (PRD §74) for validation and summary context.
  let breakEvenSrpPerUnit: Decimal | undefined;
  try {
    breakEvenSrpPerUnit = computeBreakEven({
      landedCostPerUnit: landed.landedCostPerUnit,
      tradeSpendRate: totalTradeRate,
      revenueDeductions,
      variableCosts,
      distributor,
      retailerMarginSpec,
    }).breakEvenSrpPerUnit;
  } catch (error) {
    if (!(error instanceof PricingEngineError)) throw error;
  }

  // 7. Waterfall stages (PRD §42, §96).
  const waterfall: WaterfallStage[] = [
    {
      id: "cogs",
      label: "Manufacturing COGS",
      value: manufacturer.cogsPerUnit,
    },
    {
      id: "manufacturer-price",
      label: "Manufacturer sell price",
      value: manufacturer.sellPricePerUnit,
      delta: manufacturer.profitPerUnit,
      trace: manufacturer.trace,
    },
    {
      id: "landed",
      label: "Brand landed cost",
      value: landed.landedCostPerUnit,
      delta: landed.addOnCostPerUnit,
      trace: landed.trace,
    },
    {
      id: "invoice",
      label: "Required brand invoice",
      value: required.requiredInvoicePerUnit,
      delta: required.requiredInvoicePerUnit.minus(landed.landedCostPerUnit),
      trace: required.trace,
    },
  ];
  if (distributorAtRequired) {
    waterfall.push({
      id: "retailer-cost",
      label: "Retailer acquisition cost",
      value: distributorAtRequired.retailerAcquisitionCostPerUnit,
      delta: distributorAtRequired.retailerAcquisitionCostPerUnit.minus(required.requiredInvoicePerUnit),
      trace: distributorAtRequired.trace,
    });
  }
  waterfall.push({
    id: "srp",
    label: "Required SRP",
    value: retailerAtRequired.srpPerUnit,
    delta: retailerAtRequired.grossProfitPerUnit,
    trace: retailerAtRequired.trace,
  });

  // 8. Advisor insights (PRD §38–40) and validation warnings (PRD §71).
  const insights = runAdvisor(
    {
      landedCostPerUnit: landed.landedCostPerUnit,
      targetContributionRate: a.targetContributionRate,
      tradeSpendRate: totalTradeRate,
      revenueDeductions,
      variableCosts,
      distributor,
      retailerMarginSpec,
      currentSrpPerUnit: currentSrp,
      targetSrpPerUnit: optional(a.targetSrpPerUnit),
      tradeSpendPlan,
    },
    { tradeSpendBands: options?.tradeSpendBands },
  );
  // Annual volume for validation, derived from the weekly forecast (PRD §50).
  const annualUnits =
    a.normalWeeklyUnits.trim() === ""
      ? undefined
      : dec(a.normalWeeklyUnits, "normalWeeklyUnits").times(
          dec(a.annualWeeks.trim() === "" ? "52" : a.annualWeeks, "annualWeeks"),
        );
  const warnings = validateModel({
    retailerMarginSpec,
    distributorSelected: a.useDistributor,
    distributorMarginSpec: distributor?.marginSpec,
    tradeSpendRate: totalTradeRate,
    costLines: [...landedCostLines, ...(distributor?.fees ?? []), ...revenueDeductions, ...variableCosts],
    promotions,
    annualWeeks: a.annualWeeks.trim() === "" ? "52" : a.annualWeeks,
    annualUnits,
    contributionPerUnit: atCurrentSrp?.contribution.contributionPerUnit,
    targetSrpPerUnit: optional(a.targetSrpPerUnit),
    breakEvenSrpPerUnit,
    isImported: true,
    landedCostLines,
    manufacturerMarginSpec: { basis: a.manufacturerMarginBasis, rate: a.manufacturerMarginRate },
    manufacturingCogsPerUnit: a.cogsPerUnit,
  });

  return {
    manufacturer,
    landed,
    tradeSpend: {
      mode: a.tradeSpendMode,
      promotionalRate,
      reserveRate,
      totalRate: totalTradeRate,
      plan: tradeSpendPlan,
      band: tradeSpendBand,
    },
    requiredInvoicePerUnit: required.requiredInvoicePerUnit,
    requiredSrpPerUnit: required.requiredSrpPerUnit,
    requiredSrpTrace: required.trace,
    requiredNetRevenuePerUnit: required.netRevenuePerUnit,
    retailerAcquisitionAtRequired: required.retailerAcquisitionCostPerUnit,
    atCurrentSrp,
    priceGap,
    breakEvenSrpPerUnit,
    dollarAllocation,
    improvement,
    sensitivityBase,
    waterfall,
    insights,
    warnings,
  };
}
