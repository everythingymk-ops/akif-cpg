import type Decimal from "decimal.js";
import { priceThroughDistributor } from "./distribution";
import { costFromPrice } from "./margins";
import { ONE, decPositive, fmt } from "./money";
import { priceRetailerShelf } from "./retailer";
import {
  linearizeNettingCosts,
  parseNettingAssumptions,
  requiredBrandInvoiceForContribution,
  reversePriceFromShelf,
  reverseSolvingContext,
  type DistributorAssumptions,
  type NettingAssumptions,
} from "./reversePricing";
import type {
  CalculationTrace,
  CostLine,
  DecimalInput,
  MarginSpec,
  TraceStep,
} from "./types";

/**
 * Break-even engine (PRD §74) — negotiation metrics. Every metric answers
 * "where does contribution hit zero?" from a different side of the deal.
 * The bundle computes whatever the provided inputs allow; metrics whose
 * inputs are missing come back undefined.
 */

export interface BreakEvenInput extends NettingAssumptions {
  landedCostPerUnit: DecimalInput;
  /** Omit for a direct brand → retailer route. */
  distributor?: DistributorAssumptions;
  retailerMarginSpec?: MarginSpec;
  /** Enables the max-trade-spend and max-retailer-margin solves. */
  currentBrandInvoicePerUnit?: DecimalInput;
  /** Enables the shelf-anchored solves (max margins, max COGS). */
  currentSrpPerUnit?: DecimalInput;
  /** Enable continuing the max-COGS chain below landed cost. */
  landedCostLines?: CostLine[];
  customsValueEqualsPurchasePrice?: boolean;
  manufacturerMarginSpec?: MarginSpec;
}

export interface BreakEvenResult {
  /** Brand invoice at which contribution is exactly zero. */
  breakEvenBrandInvoicePerUnit: Decimal;
  /** Retailer acquisition cost implied by the break-even invoice. */
  breakEvenRetailerCostPerUnit: Decimal;
  /** SRP implied by the break-even invoice (needs retailerMarginSpec). */
  breakEvenSrpPerUnit?: Decimal;
  /** Highest trade spend rate before contribution goes negative at the current invoice. */
  maxTradeSpendRate?: Decimal;
  /**
   * Highest retailer margin (margin basis) the current SRP supports given the
   * current chain cost (needs currentSrpPerUnit + currentBrandInvoicePerUnit).
   */
  maxRetailerMarginRate?: Decimal;
  /**
   * Highest distributor margin (margin basis) that still connects the
   * break-even invoice to the current SRP at the required retailer margin.
   * Undefined when distributor fees alone exceed the allowed retailer cost.
   */
  maxDistributorMarginRate?: Decimal;
  /** Maximum landed cost the current SRP supports at zero contribution. */
  maxLandedCostPerUnit?: Decimal;
  maxPurchasePricePerUnit?: Decimal;
  maxManufacturingCogsPerUnit?: Decimal;
  trace: CalculationTrace;
}

export function computeBreakEven(input: BreakEvenInput): BreakEvenResult {
  const landedCost = decPositive(input.landedCostPerUnit, "landedCostPerUnit");
  const currentSrp =
    input.currentSrpPerUnit === undefined
      ? undefined
      : decPositive(input.currentSrpPerUnit, "currentSrpPerUnit");
  const currentInvoice =
    input.currentBrandInvoicePerUnit === undefined
      ? undefined
      : decPositive(input.currentBrandInvoicePerUnit, "currentBrandInvoicePerUnit");
  const solvingContext = reverseSolvingContext(input.context, currentSrp);
  const steps: TraceStep[] = [];

  // 1. Break-even brand invoice: contribution = 0.
  const breakEvenInvoice = requiredBrandInvoiceForContribution({
    landedCostPerUnit: landedCost,
    targetContributionRate: 0,
    tradeSpendRate: input.tradeSpendRate,
    revenueDeductions: input.revenueDeductions,
    variableCosts: input.variableCosts,
    context: input.context,
  }).requiredInvoicePerUnit;
  steps.push({
    label: "Break-even brand invoice (contribution = 0)",
    formula: "required invoice at 0% target contribution",
    value: breakEvenInvoice,
  });

  // 2. Break-even retailer cost through the channel.
  const breakEvenRetailerCost = input.distributor
    ? priceThroughDistributor({
        brandInvoicePricePerUnit: breakEvenInvoice,
        marginSpec: input.distributor.marginSpec,
        fees: input.distributor.fees,
        context: input.context,
      }).retailerAcquisitionCostPerUnit
    : breakEvenInvoice;
  steps.push({
    label: "Break-even retailer cost",
    formula: input.distributor ? "break-even invoice through distributor" : "equals break-even invoice",
    value: breakEvenRetailerCost,
  });

  // 3. Break-even SRP.
  let breakEvenSrp: Decimal | undefined;
  if (input.retailerMarginSpec) {
    breakEvenSrp = priceRetailerShelf({
      acquisitionCostPerUnit: breakEvenRetailerCost,
      marginSpec: input.retailerMarginSpec,
    }).srpPerUnit;
    steps.push({
      label: "Break-even SRP",
      formula: "break-even retailer cost through retailer margin",
      value: breakEvenSrp,
    });
  }

  const netting = parseNettingAssumptions(input, solvingContext);

  // 4. Maximum trade spend before negative contribution (at the current invoice).
  //    net_be = (landed + varFixed + varInvoiceRate × I) ÷ (1 − varNetRate)
  //    t_max  = 1 − dedInvoiceRate − (dedFixed + net_be) ÷ I
  //    (1 − varNetRate > 0 is guaranteed: step 1 already solved at target 0.)
  let maxTradeSpendRate: Decimal | undefined;
  if (currentInvoice) {
    const netAtBreakEven = landedCost
      .plus(netting.variables.fixedPerUnit)
      .plus(netting.variables.invoiceRate.times(currentInvoice))
      .dividedBy(ONE.minus(netting.variables.netSalesRate));
    maxTradeSpendRate = ONE.minus(netting.deductions.invoiceRate).minus(
      netting.deductions.fixedPerUnit.plus(netAtBreakEven).dividedBy(currentInvoice),
    );
    steps.push({
      label: "Maximum trade spend before negative contribution",
      formula: `1 − ${fmt(netting.deductions.invoiceRate)} − (${fmt(netting.deductions.fixedPerUnit)} + ${fmt(netAtBreakEven)}) ÷ ${fmt(currentInvoice)}`,
      value: maxTradeSpendRate,
    });
  }

  // 5. Maximum retailer margin the current SRP supports at the current chain cost.
  let maxRetailerMarginRate: Decimal | undefined;
  if (currentSrp && currentInvoice) {
    const chainCost = input.distributor
      ? priceThroughDistributor({
          brandInvoicePricePerUnit: currentInvoice,
          marginSpec: input.distributor.marginSpec,
          fees: input.distributor.fees,
          context: input.context,
        }).retailerAcquisitionCostPerUnit
      : currentInvoice;
    maxRetailerMarginRate = ONE.minus(chainCost.dividedBy(currentSrp));
    steps.push({
      label: "Maximum retailer margin at current SRP (margin basis)",
      formula: `1 − ${fmt(chainCost)} ÷ ${fmt(currentSrp)}`,
      value: maxRetailerMarginRate,
    });
  }

  // 6. Maximum distributor margin: the break-even invoice is the floor; the
  //    current SRP and required retailer margin cap the retailer cost.
  let maxDistributorMarginRate: Decimal | undefined;
  if (currentSrp && input.retailerMarginSpec && input.distributor) {
    const allowedRetailerCost = costFromPrice(currentSrp, input.retailerMarginSpec);
    const fees = linearizeNettingCosts(input.distributor.fees ?? [], solvingContext, {
      allowNetSalesBasis: false,
      label: "distributor fees",
    });
    const allowedSellPrice = allowedRetailerCost
      .minus(fees.fixedPerUnit)
      .minus(fees.invoiceRate.times(breakEvenInvoice));
    if (allowedSellPrice.greaterThan(0)) {
      maxDistributorMarginRate = ONE.minus(breakEvenInvoice.dividedBy(allowedSellPrice));
      steps.push({
        label: "Maximum distributor margin (margin basis)",
        formula: `1 − ${fmt(breakEvenInvoice)} ÷ ${fmt(allowedSellPrice)}`,
        value: maxDistributorMarginRate,
      });
    }
  }

  // 7. Maximum landed cost / purchase price / COGS the current SRP supports.
  let maxLandedCostPerUnit: Decimal | undefined;
  let maxPurchasePricePerUnit: Decimal | undefined;
  let maxManufacturingCogsPerUnit: Decimal | undefined;
  if (currentSrp && input.retailerMarginSpec) {
    const reverse = reversePriceFromShelf({
      targetSrpPerUnit: currentSrp,
      retailerMarginSpec: input.retailerMarginSpec,
      distributor: input.distributor,
      targetContributionRate: 0,
      tradeSpendRate: input.tradeSpendRate,
      revenueDeductions: input.revenueDeductions,
      variableCosts: input.variableCosts,
      context: input.context,
      landedCostLines: input.landedCostLines,
      customsValueEqualsPurchasePrice: input.customsValueEqualsPurchasePrice,
      manufacturerMarginSpec: input.manufacturerMarginSpec,
    });
    maxLandedCostPerUnit = reverse.maxLandedCostPerUnit;
    maxPurchasePricePerUnit = reverse.maxPurchasePricePerUnit;
    maxManufacturingCogsPerUnit = reverse.maxManufacturingCogsPerUnit;
    steps.push({
      label: "Maximum landed cost at current SRP (contribution = 0)",
      formula: "reverse pricing from shelf at 0% target contribution",
      value: reverse.maxLandedCostPerUnit,
    });
  }

  const trace: CalculationTrace = {
    title: "Break-Even Analysis",
    formula: "each metric solves for the point where contribution = 0 (PRD §74)",
    inputs: {
      "Landed cost / unit": fmt(landedCost),
      "Current brand invoice": currentInvoice ? fmt(currentInvoice) : "—",
      "Current SRP": currentSrp ? fmt(currentSrp) : "—",
      Route: input.distributor ? "through distributor" : "direct to retailer",
    },
    steps,
    output: breakEvenInvoice,
  };

  return {
    breakEvenBrandInvoicePerUnit: breakEvenInvoice,
    breakEvenRetailerCostPerUnit: breakEvenRetailerCost,
    breakEvenSrpPerUnit: breakEvenSrp,
    maxTradeSpendRate,
    maxRetailerMarginRate,
    maxDistributorMarginRate,
    maxLandedCostPerUnit,
    maxPurchasePricePerUnit,
    maxManufacturingCogsPerUnit,
    trace,
  };
}
