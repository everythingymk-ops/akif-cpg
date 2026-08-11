import type Decimal from "decimal.js";
import {
  PricingEngineError,
  buildLandedCost,
  computeBreakEven,
  computeContribution,
  computePriceGap,
  dec,
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
  type DistributorAssumptions,
  type LandedCostResult,
  type ManufacturerPricingResult,
  type PriceGapResult,
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

export interface ComputedScenario {
  manufacturer: ManufacturerPricingResult;
  landed: LandedCostResult;
  tradeSpend: { promotionalRate: Decimal; reserveRate: Decimal; totalRate: Decimal };
  requiredInvoicePerUnit: Decimal;
  requiredSrpPerUnit: Decimal;
  requiredSrpTrace: CalculationTrace;
  requiredNetRevenuePerUnit: Decimal;
  retailerAcquisitionAtRequired: Decimal;
  atCurrentSrp?: {
    srpPerUnit: Decimal;
    impliedInvoicePerUnit: Decimal;
    contribution: ContributionResult;
  };
  priceGap?: PriceGapResult;
  breakEvenSrpPerUnit?: Decimal;
  waterfall: WaterfallStage[];
  insights: AdvisorInsight[];
  warnings: ValidationWarning[];
}

export type ScenarioComputation =
  | { ok: true; scenario: ComputedScenario }
  | { ok: false; error: string };

function optional(value: string): string | undefined {
  return value.trim() === "" ? undefined : value.trim();
}

export function computeScenario(assumptions: ScenarioAssumptions): ScenarioComputation {
  try {
    return { ok: true, scenario: compute(assumptions) };
  } catch (error) {
    if (error instanceof PricingEngineError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}

function compute(a: ScenarioAssumptions): ComputedScenario {
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

  // 3. Trade spend stack (PRD §23): manual promotional rate + reserve.
  const promotionalRate = dec(a.tradeSpendRate, "tradeSpendRate");
  const reserveRate = dec(a.additionalReserveRate || "0", "additionalReserveRate");
  const totalTradeRate = promotionalRate.plus(reserveRate);

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
      contribution,
    };

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
  const insights = runAdvisor({
    landedCostPerUnit: landed.landedCostPerUnit,
    targetContributionRate: a.targetContributionRate,
    tradeSpendRate: totalTradeRate,
    revenueDeductions,
    variableCosts,
    distributor,
    retailerMarginSpec,
    currentSrpPerUnit: currentSrp,
    targetSrpPerUnit: optional(a.targetSrpPerUnit),
  });
  const warnings = validateModel({
    retailerMarginSpec,
    distributorSelected: a.useDistributor,
    distributorMarginSpec: distributor?.marginSpec,
    tradeSpendRate: totalTradeRate,
    costLines: [...landedCostLines, ...(distributor?.fees ?? []), ...revenueDeductions, ...variableCosts],
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
    tradeSpend: { promotionalRate, reserveRate, totalRate: totalTradeRate },
    requiredInvoicePerUnit: required.requiredInvoicePerUnit,
    requiredSrpPerUnit: required.requiredSrpPerUnit,
    requiredSrpTrace: required.trace,
    requiredNetRevenuePerUnit: required.netRevenuePerUnit,
    retailerAcquisitionAtRequired: required.retailerAcquisitionCostPerUnit,
    atCurrentSrp,
    priceGap,
    breakEvenSrpPerUnit,
    waterfall,
    insights,
    warnings,
  };
}
