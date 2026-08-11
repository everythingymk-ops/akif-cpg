import type Decimal from "decimal.js";
import { computeContribution } from "./contribution";
import { priceThroughDistributor } from "./distribution";
import { ONE, dec, decPositive, fmt } from "./money";
import {
  impliedBrandInvoiceAtShelf,
  parseNettingAssumptions,
  requiredBrandInvoiceForContribution,
  requiredSrpForContribution,
  reversePriceFromShelf,
  reverseSolvingContext,
  type DistributorAssumptions,
  type NettingAssumptions,
} from "./reversePricing";
import {
  PricingEngineError,
  type CalculationTrace,
  type DecimalInput,
  type MarginSpec,
  type TraceStep,
} from "./types";

/**
 * "What Should I Change?" (PRD §73): identify the highest-impact single
 * levers that carry the model from its current contribution to the target —
 * each quantified against the live model, none applied automatically
 * (PRD §40). Every lever is exact: applying its required value reproduces the
 * target contribution precisely.
 */

export interface ImprovementInput extends NettingAssumptions {
  landedCostPerUnit: DecimalInput;
  targetContributionRate: DecimalInput;
  currentSrpPerUnit: DecimalInput;
  retailerMarginSpec: MarginSpec;
  /** Omit for a direct brand → retailer route. */
  distributor?: DistributorAssumptions;
}

export type ImprovementLeverId =
  | "increase-srp"
  | "reduce-landed-cost"
  | "reduce-trade-spend"
  | "reduce-retailer-margin"
  | "sell-direct";

export interface ImprovementLever {
  id: ImprovementLeverId;
  /** Value in the model today (SRP $, landed $, rate, margin rate, CM rate). */
  currentValue: Decimal;
  /** Value that would exactly reach the target contribution. */
  requiredValue: Decimal;
  /** Magnitude of the change (always ≥ 0 for feasible levers). */
  delta: Decimal;
  /** False when the lever cannot reach the target (e.g. negative rate). */
  feasible: boolean;
}

export interface ImprovementResult {
  currentContributionMarginRate: Decimal;
  targetContributionRate: Decimal;
  requiredSrpPerUnit: Decimal;
  /** Percentage-point shortfall: target − current margin (negative = above). */
  gapToTarget: Decimal;
  alreadyOnTarget: boolean;
  levers: ImprovementLever[];
  trace: CalculationTrace;
}

/**
 * The trade-spend rate at which the current shelf price exactly reaches the
 * target contribution (generalizes §74's break-even solve to a target t):
 *   net_required = (landed + varFixed + varInvoiceRate × I) ÷ (1 − t − varNetRate)
 *   rate = 1 − dedInvoiceRate − (dedFixed + net_required) ÷ I
 */
export function requiredTradeSpendRateForContribution(input: {
  brandInvoicePricePerUnit: DecimalInput;
  landedCostPerUnit: DecimalInput;
  targetContributionRate: DecimalInput;
  revenueDeductions?: NettingAssumptions["revenueDeductions"];
  variableCosts?: NettingAssumptions["variableCosts"];
  context?: NettingAssumptions["context"];
}): Decimal {
  const invoice = decPositive(input.brandInvoicePricePerUnit, "brandInvoicePricePerUnit");
  const landedCost = decPositive(input.landedCostPerUnit, "landedCostPerUnit");
  const targetRate = dec(input.targetContributionRate, "targetContributionRate");
  const context = reverseSolvingContext(input.context);
  // Trade spend is the unknown — parse the rest of the netting stack at 0.
  const netting = parseNettingAssumptions(
    {
      tradeSpendRate: 0,
      revenueDeductions: input.revenueDeductions,
      variableCosts: input.variableCosts,
      context: input.context,
    },
    context,
  );
  const deductionInvoiceRate = ONE.minus(netting.invoiceToNetRate);
  const oneMinusTargetAndNetCosts = ONE.minus(targetRate).minus(netting.variables.netSalesRate);
  if (oneMinusTargetAndNetCosts.lessThanOrEqualTo(0)) {
    throw new PricingEngineError(
      "target contribution plus net-sales-based variable costs are 100% or more of net revenue",
    );
  }
  const netRequired = landedCost
    .plus(netting.variables.fixedPerUnit)
    .plus(netting.variables.invoiceRate.times(invoice))
    .dividedBy(oneMinusTargetAndNetCosts);
  return ONE.minus(deductionInvoiceRate).minus(
    netting.deductions.fixedPerUnit.plus(netRequired).dividedBy(invoice),
  );
}

export function computeImprovementLevers(input: ImprovementInput): ImprovementResult {
  const currentSrp = decPositive(input.currentSrpPerUnit, "currentSrpPerUnit");
  const landedCost = decPositive(input.landedCostPerUnit, "landedCostPerUnit");
  const targetRate = dec(input.targetContributionRate, "targetContributionRate");
  const currentTradeRate =
    input.tradeSpendRate === undefined ? dec(0) : dec(input.tradeSpendRate, "tradeSpendRate");

  const implied = impliedBrandInvoiceAtShelf({
    srpPerUnit: currentSrp,
    retailerMarginSpec: input.retailerMarginSpec,
    distributor: input.distributor,
    context: input.context,
  });
  const atCurrent = computeContribution({
    brandInvoicePricePerUnit: implied.brandInvoicePerUnit,
    tradeSpendRate: input.tradeSpendRate,
    revenueDeductions: input.revenueDeductions,
    landedCostPerUnit: landedCost,
    variableCosts: input.variableCosts,
    context: input.context,
  });
  const required = requiredSrpForContribution({
    landedCostPerUnit: landedCost,
    targetContributionRate: targetRate,
    tradeSpendRate: input.tradeSpendRate,
    revenueDeductions: input.revenueDeductions,
    variableCosts: input.variableCosts,
    context: input.context,
    distributor: input.distributor,
    retailerMarginSpec: input.retailerMarginSpec,
  });

  const gapToTarget = targetRate.minus(atCurrent.contributionMarginRate);
  const alreadyOnTarget = !gapToTarget.greaterThan(0);
  const levers: ImprovementLever[] = [];
  const steps: TraceStep[] = [];

  if (!alreadyOnTarget) {
    // 1. Increase the shelf price to the required SRP.
    const srpIncrease = required.requiredSrpPerUnit.minus(currentSrp);
    levers.push({
      id: "increase-srp",
      currentValue: currentSrp,
      requiredValue: required.requiredSrpPerUnit,
      delta: srpIncrease,
      feasible: true,
    });
    steps.push({
      label: "Increase SRP",
      formula: `${fmt(required.requiredSrpPerUnit)} − ${fmt(currentSrp)}`,
      value: srpIncrease,
    });

    // 2. Reduce the landed cost to what the current shelf price supports.
    try {
      const reverse = reversePriceFromShelf({
        targetSrpPerUnit: currentSrp,
        retailerMarginSpec: input.retailerMarginSpec,
        distributor: input.distributor,
        targetContributionRate: targetRate,
        tradeSpendRate: input.tradeSpendRate,
        revenueDeductions: input.revenueDeductions,
        variableCosts: input.variableCosts,
        context: input.context,
      });
      levers.push({
        id: "reduce-landed-cost",
        currentValue: landedCost,
        requiredValue: reverse.maxLandedCostPerUnit,
        delta: landedCost.minus(reverse.maxLandedCostPerUnit),
        feasible: reverse.maxLandedCostPerUnit.greaterThan(0),
      });
      steps.push({
        label: "Reduce landed cost",
        formula: `${fmt(landedCost)} − ${fmt(reverse.maxLandedCostPerUnit)}`,
        value: landedCost.minus(reverse.maxLandedCostPerUnit),
      });
    } catch (error) {
      if (!(error instanceof PricingEngineError)) throw error;
    }

    // 3. Reduce trade spend until the current shelf price reaches the target.
    try {
      const requiredTradeRate = requiredTradeSpendRateForContribution({
        brandInvoicePricePerUnit: implied.brandInvoicePerUnit,
        landedCostPerUnit: landedCost,
        targetContributionRate: targetRate,
        revenueDeductions: input.revenueDeductions,
        variableCosts: input.variableCosts,
        context: input.context,
      });
      levers.push({
        id: "reduce-trade-spend",
        currentValue: currentTradeRate,
        requiredValue: requiredTradeRate,
        delta: currentTradeRate.minus(requiredTradeRate),
        feasible:
          requiredTradeRate.greaterThanOrEqualTo(0) && requiredTradeRate.lessThan(currentTradeRate),
      });
      steps.push({
        label: "Reduce trade spend",
        formula: `${fmt(currentTradeRate)} → ${fmt(requiredTradeRate)}`,
        value: requiredTradeRate,
      });
    } catch (error) {
      if (!(error instanceof PricingEngineError)) throw error;
    }

    // 4. Negotiate the retailer margin down (margin basis only).
    if (input.retailerMarginSpec.basis === "margin") {
      const currentRetailerMargin = dec(input.retailerMarginSpec.rate, "retailer margin rate");
      const requiredInvoice = requiredBrandInvoiceForContribution({
        landedCostPerUnit: landedCost,
        targetContributionRate: targetRate,
        tradeSpendRate: input.tradeSpendRate,
        revenueDeductions: input.revenueDeductions,
        variableCosts: input.variableCosts,
        context: input.context,
      });
      const neededRetailerCost = input.distributor
        ? priceThroughDistributor({
            brandInvoicePricePerUnit: requiredInvoice.requiredInvoicePerUnit,
            marginSpec: input.distributor.marginSpec,
            fees: input.distributor.fees,
            context: input.context,
          }).retailerAcquisitionCostPerUnit
        : requiredInvoice.requiredInvoicePerUnit;
      const requiredMargin = ONE.minus(neededRetailerCost.dividedBy(currentSrp));
      levers.push({
        id: "reduce-retailer-margin",
        currentValue: currentRetailerMargin,
        requiredValue: requiredMargin,
        delta: currentRetailerMargin.minus(requiredMargin),
        feasible: requiredMargin.greaterThan(0) && requiredMargin.lessThan(currentRetailerMargin),
      });
      steps.push({
        label: "Negotiate retailer margin",
        formula: `1 − ${fmt(neededRetailerCost)} ÷ ${fmt(currentSrp)}`,
        value: requiredMargin,
      });
    }

    // 5. Sell direct — eliminate the distributor leg at the same shelf price.
    if (input.distributor) {
      try {
        const directImplied = impliedBrandInvoiceAtShelf({
          srpPerUnit: currentSrp,
          retailerMarginSpec: input.retailerMarginSpec,
          context: input.context,
        });
        const direct = computeContribution({
          brandInvoicePricePerUnit: directImplied.brandInvoicePerUnit,
          tradeSpendRate: input.tradeSpendRate,
          revenueDeductions: input.revenueDeductions,
          landedCostPerUnit: landedCost,
          variableCosts: input.variableCosts,
          context: input.context,
        });
        levers.push({
          id: "sell-direct",
          currentValue: atCurrent.contributionMarginRate,
          requiredValue: direct.contributionMarginRate,
          delta: direct.contributionMarginRate.minus(atCurrent.contributionMarginRate),
          feasible: direct.contributionMarginRate.greaterThanOrEqualTo(targetRate),
        });
        steps.push({
          label: "Sell direct",
          formula: `contribution ${fmt(atCurrent.contributionMarginRate)} → ${fmt(direct.contributionMarginRate)}`,
          value: direct.contributionMarginRate,
        });
      } catch (error) {
        if (!(error instanceof PricingEngineError)) throw error;
      }
    }
  }

  const trace: CalculationTrace = {
    title: "Improve Economics",
    formula:
      "each lever solves for the single change that carries the current shelf price to the target contribution (PRD §73)",
    inputs: {
      "Current SRP": fmt(currentSrp),
      "Current contribution": fmt(atCurrent.contributionMarginRate),
      "Target contribution": fmt(targetRate),
    },
    steps,
    output: gapToTarget,
  };

  return {
    currentContributionMarginRate: atCurrent.contributionMarginRate,
    targetContributionRate: targetRate,
    requiredSrpPerUnit: required.requiredSrpPerUnit,
    gapToTarget,
    alreadyOnTarget,
    levers,
    trace,
  };
}
