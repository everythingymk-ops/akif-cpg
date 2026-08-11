import type Decimal from "decimal.js";
import { resolveCostLine } from "./costLines";
import { priceThroughDistributor } from "./distribution";
import { applyMarginSpec, costFromPrice } from "./margins";
import { ONE, ZERO, dec, decPositive, decRate01, fmt } from "./money";
import { priceRetailerShelf } from "./retailer";
import {
  PricingEngineError,
  type CalculationTrace,
  type CostLine,
  type CostResolutionContext,
  type DecimalInput,
  type MarginSpec,
  type TraceStep,
} from "./types";

/**
 * Reverse pricing (PRD §30–32): work backward from a target shelf price to the
 * maximum brand invoice, maximum landed cost and maximum manufacturing COGS
 * that still protect the target contribution — plus the forward-solving twins
 * (required invoice / required SRP for a contribution target) and the price
 * gap (PRD §31).
 *
 * Percent-based cost lines are linearized against the unknown being solved:
 * `percentOfInvoice` deductions/variable costs ride the brand invoice, and in
 * the landed-cost inversion `percentOfInvoice` rides the purchase price (the
 * supplier invoice — same convention as buildLandedCost's default). Customs
 * value never defaults: set `customsValueEqualsPurchasePrice: true` or provide
 * an explicit `context.customsValuePerUnit` (PRD §10).
 */

export interface DistributorAssumptions {
  marginSpec: MarginSpec;
  /** Pass-through fees on top of the distributor sell price (PRD §13). */
  fees?: CostLine[];
}

export interface LinearizedNettingCosts {
  /** Per-unit dollars resolvable without knowing the invoice. */
  fixedPerUnit: Decimal;
  /** Sum of percentOfInvoice amounts (rides the unknown invoice). */
  invoiceRate: Decimal;
  /** Sum of percentOfNetSales amounts (rides the unknown net revenue). */
  netSalesRate: Decimal;
}

/**
 * Split cost lines into fixed dollars vs rates riding the unknown invoice /
 * net revenue. An explicit `context.invoicePricePerUnit` pins invoice-based
 * lines to that value (they become fixed).
 */
export function linearizeNettingCosts(
  lines: CostLine[],
  context: CostResolutionContext,
  options: { allowNetSalesBasis: boolean; label: string },
): LinearizedNettingCosts {
  let fixedPerUnit = ZERO;
  let invoiceRate = ZERO;
  let netSalesRate = ZERO;

  for (const line of lines) {
    const amountLabel = `cost line "${line.name}" amount`;
    if (line.basis === "percentOfInvoice" && context.invoicePricePerUnit === undefined) {
      invoiceRate = invoiceRate.plus(dec(line.amount, amountLabel));
    } else if (line.basis === "percentOfNetSales") {
      if (!options.allowNetSalesBasis) {
        throw new PricingEngineError(
          `${options.label}: cost line "${line.name}" uses percentOfNetSales, which is circular ` +
            `here — reclassify it or use a different basis (PRD §28)`,
        );
      }
      netSalesRate = netSalesRate.plus(dec(line.amount, amountLabel));
    } else {
      fixedPerUnit = fixedPerUnit.plus(resolveCostLine(line, context).perUnit);
    }
  }

  return { fixedPerUnit, invoiceRate, netSalesRate };
}

interface LinearizedPurchaseCosts {
  fixedPerUnit: Decimal;
  /** Sum of rates riding the unknown purchase price. */
  purchaseRate: Decimal;
}

function linearizePurchaseRelativeCosts(
  lines: CostLine[],
  context: CostResolutionContext,
  customsValueEqualsPurchasePrice: boolean,
): LinearizedPurchaseCosts {
  let fixedPerUnit = ZERO;
  let purchaseRate = ZERO;

  for (const line of lines) {
    const amountLabel = `cost line "${line.name}" amount`;
    switch (line.basis) {
      case "percentOfInvoice":
        // The supplier invoice is the purchase price being solved
        // (same default as buildLandedCost) unless explicitly pinned.
        if (context.invoicePricePerUnit === undefined) {
          purchaseRate = purchaseRate.plus(dec(line.amount, amountLabel));
        } else {
          fixedPerUnit = fixedPerUnit.plus(resolveCostLine(line, context).perUnit);
        }
        break;
      case "percentOfCustomsValue":
        if (context.customsValuePerUnit !== undefined) {
          fixedPerUnit = fixedPerUnit.plus(resolveCostLine(line, context).perUnit);
        } else if (customsValueEqualsPurchasePrice) {
          purchaseRate = purchaseRate.plus(dec(line.amount, amountLabel));
        } else {
          throw new PricingEngineError(
            `landed cost line "${line.name}" uses percentOfCustomsValue — provide ` +
              `context.customsValuePerUnit or set customsValueEqualsPurchasePrice: true; ` +
              `the engine never assumes a customs value (PRD §10)`,
          );
        }
        break;
      case "percentOfCogs":
        if (context.cogsPerUnit === undefined) {
          throw new PricingEngineError(
            `landed cost line "${line.name}" uses percentOfCogs, which is circular when solving ` +
              `backward toward COGS — provide context.cogsPerUnit or use a different basis`,
          );
        }
        fixedPerUnit = fixedPerUnit.plus(resolveCostLine(line, context).perUnit);
        break;
      case "percentOfNetSales":
        throw new PricingEngineError(
          `landed cost line "${line.name}" uses percentOfNetSales, which is not meaningful in a ` +
            `landed-cost build`,
        );
      default:
        fixedPerUnit = fixedPerUnit.plus(resolveCostLine(line, context).perUnit);
    }
  }

  return { fixedPerUnit, purchaseRate };
}

export interface NettingAssumptions {
  tradeSpendRate?: DecimalInput;
  revenueDeductions?: CostLine[];
  variableCosts?: CostLine[];
  context?: CostResolutionContext;
}

export interface ParsedNetting {
  tradeRate: Decimal;
  deductions: LinearizedNettingCosts;
  variables: LinearizedNettingCosts;
  /** a = 1 − trade spend − invoice-based deduction rates. */
  invoiceToNetRate: Decimal;
}

export function parseNettingAssumptions(input: NettingAssumptions, context: CostResolutionContext): ParsedNetting {
  const tradeRate =
    input.tradeSpendRate === undefined ? ZERO : decRate01(input.tradeSpendRate, "tradeSpendRate");
  const deductions = linearizeNettingCosts(input.revenueDeductions ?? [], context, {
    allowNetSalesBasis: false,
    label: "revenue deductions",
  });
  const variables = linearizeNettingCosts(input.variableCosts ?? [], context, {
    allowNetSalesBasis: true,
    label: "variable costs",
  });
  const invoiceToNetRate = ONE.minus(tradeRate).minus(deductions.invoiceRate);
  if (invoiceToNetRate.lessThanOrEqualTo(0)) {
    throw new PricingEngineError(
      "trade spend plus invoice-based deductions are 100% or more of the invoice — no net revenue remains",
    );
  }
  return { tradeRate, deductions, variables, invoiceToNetRate };
}

/**
 * Build the reverse-solving context: the brand invoice is the unknown, so an
 * inherited `invoicePricePerUnit` is dropped, and the target SRP is available
 * to percentOfSrp lines.
 */
export function reverseSolvingContext(
  context: CostResolutionContext | undefined,
  srp?: Decimal,
): CostResolutionContext {
  const out: CostResolutionContext = { ...context };
  delete out.invoicePricePerUnit;
  if (out.srpPerUnit === undefined && srp !== undefined) {
    out.srpPerUnit = srp;
  }
  return out;
}

export interface ImpliedInvoiceInput {
  srpPerUnit: DecimalInput;
  retailerMarginSpec: MarginSpec;
  /** Omit for a direct brand → retailer route. */
  distributor?: DistributorAssumptions;
  context?: CostResolutionContext;
}

export interface ImpliedInvoiceResult {
  srpPerUnit: Decimal;
  retailerAcquisitionCostPerUnit: Decimal;
  distributorSellPricePerUnit?: Decimal;
  /** The brand invoice the channel implies at this shelf price. */
  brandInvoicePerUnit: Decimal;
  /** Linearized distributor fees (present when a distributor was given). */
  distributorFees?: LinearizedNettingCosts;
  /** Sell-price multiplier from the distributor margin spec. */
  distributorMarginMultiplier?: Decimal;
}

/**
 * Chain algebra only (no contribution target): what brand invoice does a given
 * shelf price imply through the retailer margin and distributor economics?
 * Used by reverse pricing, sensitivity ("contribution at current SRP") and the
 * Advisor.
 */
export function impliedBrandInvoiceAtShelf(input: ImpliedInvoiceInput): ImpliedInvoiceResult {
  const srp = decPositive(input.srpPerUnit, "srpPerUnit");
  const context = reverseSolvingContext(input.context, srp);

  const retailerCost = costFromPrice(srp, input.retailerMarginSpec);
  if (retailerCost.lessThanOrEqualTo(0)) {
    throw new PricingEngineError("retailer margin leaves a zero acquisition cost at this SRP");
  }

  if (!input.distributor) {
    return {
      srpPerUnit: srp,
      retailerAcquisitionCostPerUnit: retailerCost,
      brandInvoicePerUnit: retailerCost,
    };
  }

  const fees = linearizeNettingCosts(input.distributor.fees ?? [], context, {
    allowNetSalesBasis: false,
    label: "distributor fees",
  });
  const sellAfterFixedFees = retailerCost.minus(fees.fixedPerUnit);
  if (sellAfterFixedFees.lessThanOrEqualTo(0)) {
    throw new PricingEngineError("fixed distributor fees meet or exceed the retailer acquisition cost");
  }
  // retailerCost = invoice × M + fixedFees + feeRate × invoice, M from the margin spec.
  const marginMultiplier = applyMarginSpec(ONE, input.distributor.marginSpec);
  const invoice = sellAfterFixedFees.dividedBy(marginMultiplier.plus(fees.invoiceRate));
  if (invoice.lessThanOrEqualTo(0)) {
    throw new PricingEngineError("the channel assumptions leave a zero brand invoice");
  }

  return {
    srpPerUnit: srp,
    retailerAcquisitionCostPerUnit: retailerCost,
    distributorSellPricePerUnit: applyMarginSpec(invoice, input.distributor.marginSpec),
    brandInvoicePerUnit: invoice,
    distributorFees: fees,
    distributorMarginMultiplier: marginMultiplier,
  };
}

export interface ReversePricingInput extends NettingAssumptions {
  targetSrpPerUnit: DecimalInput;
  retailerMarginSpec: MarginSpec;
  /** Omit for a direct brand → retailer route (PRD §3E). */
  distributor?: DistributorAssumptions;
  /** Contribution target to protect; pass 0 for pure break-even. */
  targetContributionRate: DecimalInput;
  /** Landed cost lines to invert from landed cost down to the purchase price. */
  landedCostLines?: CostLine[];
  /** Explicit reverse-mode choice for percentOfCustomsValue lines (PRD §10). */
  customsValueEqualsPurchasePrice?: boolean;
  /** Provide to continue from purchase price down to manufacturing COGS. */
  manufacturerMarginSpec?: MarginSpec;
}

export interface ReversePricingResult {
  targetSrpPerUnit: Decimal;
  retailerAcquisitionCostPerUnit: Decimal;
  distributorSellPricePerUnit?: Decimal;
  maxBrandInvoicePerUnit: Decimal;
  netRevenuePerUnit: Decimal;
  maxLandedCostPerUnit: Decimal;
  /** Present when landedCostLines were provided (else equals max landed cost). */
  maxPurchasePricePerUnit?: Decimal;
  /** Present when manufacturerMarginSpec was provided. */
  maxManufacturingCogsPerUnit?: Decimal;
  trace: CalculationTrace;
}

export function reversePriceFromShelf(input: ReversePricingInput): ReversePricingResult {
  const targetRate = dec(input.targetContributionRate, "targetContributionRate");
  const steps: TraceStep[] = [];

  // 1–2. Channel algebra: SRP → retailer cost → maximum brand invoice.
  const implied = impliedBrandInvoiceAtShelf({
    srpPerUnit: input.targetSrpPerUnit,
    retailerMarginSpec: input.retailerMarginSpec,
    distributor: input.distributor,
    context: input.context,
  });
  const srp = implied.srpPerUnit;
  const context = reverseSolvingContext(input.context, srp);
  const retailerCost = implied.retailerAcquisitionCostPerUnit;
  const maxInvoice = implied.brandInvoicePerUnit;

  steps.push({
    label: "Retailer acquisition cost",
    formula:
      input.retailerMarginSpec.basis === "margin"
        ? `${fmt(srp)} × (1 − ${fmt(dec(input.retailerMarginSpec.rate))})`
        : `${fmt(srp)} ÷ (1 + ${fmt(dec(input.retailerMarginSpec.rate))})`,
    value: retailerCost,
  });
  if (input.distributor && implied.distributorFees && implied.distributorMarginMultiplier) {
    steps.push({
      label: "Maximum brand invoice (through distributor)",
      formula: `(${fmt(retailerCost)} − ${fmt(implied.distributorFees.fixedPerUnit)} fees) ÷ (${fmt(implied.distributorMarginMultiplier)} + ${fmt(implied.distributorFees.invoiceRate)})`,
      value: maxInvoice,
    });
  } else {
    steps.push({
      label: "Maximum brand invoice (direct to retailer)",
      formula: "equals retailer acquisition cost",
      value: maxInvoice,
    });
  }

  // 3. Netting: from invoice down to the maximum landed cost at target contribution.
  const netting = parseNettingAssumptions(input, context);
  const oneMinusTargetAndNetCosts = ONE.minus(targetRate).minus(netting.variables.netSalesRate);
  if (oneMinusTargetAndNetCosts.lessThanOrEqualTo(0)) {
    throw new PricingEngineError(
      "target contribution plus net-sales-based variable costs are 100% or more of net revenue",
    );
  }
  const netRevenue = netting.invoiceToNetRate.times(maxInvoice).minus(netting.deductions.fixedPerUnit);
  if (netRevenue.lessThanOrEqualTo(0)) {
    throw new PricingEngineError("deductions consume the entire brand invoice — no net revenue remains");
  }
  const maxLandedCost = netRevenue
    .times(oneMinusTargetAndNetCosts)
    .minus(netting.variables.invoiceRate.times(maxInvoice))
    .minus(netting.variables.fixedPerUnit);
  if (maxLandedCost.lessThanOrEqualTo(0)) {
    throw new PricingEngineError(
      "the commercial assumptions leave no room for product cost at the target contribution",
    );
  }
  steps.push(
    {
      label: "Net revenue at maximum invoice",
      formula: `${fmt(netting.invoiceToNetRate)} × ${fmt(maxInvoice)} − ${fmt(netting.deductions.fixedPerUnit)}`,
      value: netRevenue,
    },
    {
      label: "Maximum landed cost",
      formula:
        `${fmt(netRevenue)} × (1 − ${fmt(targetRate)} − ${fmt(netting.variables.netSalesRate)}) − ` +
        `${fmt(netting.variables.invoiceRate)} × ${fmt(maxInvoice)} − ${fmt(netting.variables.fixedPerUnit)}`,
      value: maxLandedCost,
    },
  );

  // 4. Landed cost lines: invert down to the maximum purchase price.
  let maxPurchasePrice: Decimal | undefined;
  if (input.landedCostLines && input.landedCostLines.length > 0) {
    const landedLines = linearizePurchaseRelativeCosts(
      input.landedCostLines,
      context,
      input.customsValueEqualsPurchasePrice === true,
    );
    const purchaseBudget = maxLandedCost.minus(landedLines.fixedPerUnit);
    if (purchaseBudget.lessThanOrEqualTo(0)) {
      throw new PricingEngineError(
        "fixed landed cost lines meet or exceed the maximum landed cost",
      );
    }
    maxPurchasePrice = purchaseBudget.dividedBy(ONE.plus(landedLines.purchaseRate));
    steps.push({
      label: "Maximum purchase price",
      formula: `(${fmt(maxLandedCost)} − ${fmt(landedLines.fixedPerUnit)}) ÷ (1 + ${fmt(landedLines.purchaseRate)})`,
      value: maxPurchasePrice,
    });
  }

  // 5. Manufacturer margin: down to the maximum manufacturing COGS.
  let maxCogs: Decimal | undefined;
  if (input.manufacturerMarginSpec) {
    const purchase = maxPurchasePrice ?? maxLandedCost;
    maxCogs = costFromPrice(purchase, input.manufacturerMarginSpec);
    steps.push({
      label: "Maximum manufacturing COGS",
      formula:
        input.manufacturerMarginSpec.basis === "margin"
          ? `${fmt(purchase)} × (1 − ${fmt(dec(input.manufacturerMarginSpec.rate))})`
          : `${fmt(purchase)} ÷ (1 + ${fmt(dec(input.manufacturerMarginSpec.rate))})`,
      value: maxCogs,
    });
  }

  const trace: CalculationTrace = {
    title: "Reverse Pricing from Shelf",
    formula:
      "SRP → retailer cost → max brand invoice → net revenue → max landed cost → max purchase price → max COGS",
    inputs: {
      "Target SRP": fmt(srp),
      "Target contribution": fmt(targetRate),
      Route: input.distributor ? "through distributor" : "direct to retailer",
    },
    steps,
    output: maxLandedCost,
  };

  return {
    targetSrpPerUnit: srp,
    retailerAcquisitionCostPerUnit: retailerCost,
    distributorSellPricePerUnit: implied.distributorSellPricePerUnit,
    maxBrandInvoicePerUnit: maxInvoice,
    netRevenuePerUnit: netRevenue,
    maxLandedCostPerUnit: maxLandedCost,
    maxPurchasePricePerUnit: maxPurchasePrice,
    maxManufacturingCogsPerUnit: maxCogs,
    trace,
  };
}

export interface RequiredInvoiceInput extends NettingAssumptions {
  landedCostPerUnit: DecimalInput;
  targetContributionRate: DecimalInput;
}

export interface RequiredInvoiceResult {
  landedCostPerUnit: Decimal;
  requiredInvoicePerUnit: Decimal;
  netRevenuePerUnit: Decimal;
  trace: CalculationTrace;
}

/**
 * Forward-solving twin (PRD §29, §32): the brand invoice needed to hit the
 * target contribution given the landed cost and commercial assumptions.
 *
 *   I = [landed + varFixed + dedFixed × (1 − t − varNetRate)]
 *       ÷ [a × (1 − t − varNetRate) − varInvoiceRate],   a = 1 − trade − dedInvoiceRate
 */
export function requiredBrandInvoiceForContribution(
  input: RequiredInvoiceInput,
): RequiredInvoiceResult {
  const landedCost = decPositive(input.landedCostPerUnit, "landedCostPerUnit");
  const targetRate = dec(input.targetContributionRate, "targetContributionRate");
  const context = reverseSolvingContext(input.context);
  const netting = parseNettingAssumptions(input, context);

  const oneMinusTargetAndNetCosts = ONE.minus(targetRate).minus(netting.variables.netSalesRate);
  if (oneMinusTargetAndNetCosts.lessThanOrEqualTo(0)) {
    throw new PricingEngineError(
      "target contribution plus net-sales-based variable costs are 100% or more of net revenue",
    );
  }
  const denominator = netting.invoiceToNetRate
    .times(oneMinusTargetAndNetCosts)
    .minus(netting.variables.invoiceRate);
  if (denominator.lessThanOrEqualTo(0)) {
    throw new PricingEngineError(
      "the commercial rates consume the entire invoice — no invoice price can reach the target contribution",
    );
  }
  const numerator = landedCost
    .plus(netting.variables.fixedPerUnit)
    .plus(netting.deductions.fixedPerUnit.times(oneMinusTargetAndNetCosts));
  const requiredInvoice = numerator.dividedBy(denominator);
  const netRevenue = netting.invoiceToNetRate
    .times(requiredInvoice)
    .minus(netting.deductions.fixedPerUnit);
  if (netRevenue.lessThanOrEqualTo(0)) {
    throw new PricingEngineError("deductions consume the required invoice — no net revenue remains");
  }

  const trace: CalculationTrace = {
    title: "Required Brand Invoice for Target Contribution",
    formula:
      "invoice = [landed + fixed variable costs + fixed deductions × (1 − target − net-based rates)] ÷ " +
      "[(1 − trade − invoice-based deduction rates) × (1 − target − net-based rates) − invoice-based variable rates]",
    inputs: {
      "Landed cost / unit": fmt(landedCost),
      "Target contribution": fmt(targetRate),
      "Trade spend rate": fmt(netting.tradeRate),
    },
    steps: [
      {
        label: "Required brand invoice",
        formula: `${fmt(numerator)} ÷ ${fmt(denominator)}`,
        value: requiredInvoice,
      },
      {
        label: "Net revenue at required invoice",
        formula: `${fmt(netting.invoiceToNetRate)} × ${fmt(requiredInvoice)} − ${fmt(netting.deductions.fixedPerUnit)}`,
        value: netRevenue,
      },
    ],
    output: requiredInvoice,
  };

  return { landedCostPerUnit: landedCost, requiredInvoicePerUnit: requiredInvoice, netRevenuePerUnit: netRevenue, trace };
}

export interface RequiredSrpInput extends RequiredInvoiceInput {
  /** Omit for a direct brand → retailer route. */
  distributor?: DistributorAssumptions;
  retailerMarginSpec: MarginSpec;
}

export interface RequiredSrpResult extends RequiredInvoiceResult {
  retailerAcquisitionCostPerUnit: Decimal;
  requiredSrpPerUnit: Decimal;
}

/** PRD §32: required invoice → (distributor) → retailer cost → required SRP. */
export function requiredSrpForContribution(input: RequiredSrpInput): RequiredSrpResult {
  const invoice = requiredBrandInvoiceForContribution(input);

  const retailerCost = input.distributor
    ? priceThroughDistributor({
        brandInvoicePricePerUnit: invoice.requiredInvoicePerUnit,
        marginSpec: input.distributor.marginSpec,
        fees: input.distributor.fees,
        context: input.context,
      }).retailerAcquisitionCostPerUnit
    : invoice.requiredInvoicePerUnit;

  const retailer = priceRetailerShelf({
    acquisitionCostPerUnit: retailerCost,
    marginSpec: input.retailerMarginSpec,
  });

  const trace: CalculationTrace = {
    title: "Required SRP for Target Contribution",
    formula: "required invoice → distributor economics → retailer margin → required SRP",
    inputs: invoice.trace.inputs,
    steps: [
      ...invoice.trace.steps,
      {
        label: "Retailer acquisition cost",
        formula: input.distributor ? "required invoice through distributor" : "equals required invoice",
        value: retailerCost,
      },
      {
        label: "Required SRP",
        formula:
          input.retailerMarginSpec.basis === "margin"
            ? `${fmt(retailerCost)} ÷ (1 − ${fmt(dec(input.retailerMarginSpec.rate))})`
            : `${fmt(retailerCost)} × (1 + ${fmt(dec(input.retailerMarginSpec.rate))})`,
        value: retailer.srpPerUnit,
      },
    ],
    output: retailer.srpPerUnit,
  };

  return {
    ...invoice,
    retailerAcquisitionCostPerUnit: retailerCost,
    requiredSrpPerUnit: retailer.srpPerUnit,
    trace,
  };
}

export interface PriceGapResult {
  actualLandedCostPerUnit: Decimal;
  maxSupportedLandedCostPerUnit: Decimal;
  /** Positive = actual cost exceeds what the shelf price supports (PRD §31). */
  gapPerUnit: Decimal;
  exceedsSupportedCost: boolean;
  trace: CalculationTrace;
}

/** PRD §31: actual landed cost vs the maximum the target shelf price supports. */
export function computePriceGap(
  actualLandedCostPerUnit: DecimalInput,
  maxSupportedLandedCostPerUnit: DecimalInput,
): PriceGapResult {
  const actual = decPositive(actualLandedCostPerUnit, "actualLandedCostPerUnit");
  const maxSupported = decPositive(maxSupportedLandedCostPerUnit, "maxSupportedLandedCostPerUnit");
  const gap = actual.minus(maxSupported);

  const trace: CalculationTrace = {
    title: "Pricing Gap",
    formula: "gap = actual landed cost − maximum supported landed cost",
    inputs: {
      "Actual landed cost": fmt(actual),
      "Maximum supported landed cost": fmt(maxSupported),
    },
    steps: [
      {
        label: "Gap per unit",
        formula: `${fmt(actual)} − ${fmt(maxSupported)}`,
        value: gap,
      },
    ],
    output: gap,
  };

  return {
    actualLandedCostPerUnit: actual,
    maxSupportedLandedCostPerUnit: maxSupported,
    gapPerUnit: gap,
    exceedsSupportedCost: gap.greaterThan(0),
    trace,
  };
}
