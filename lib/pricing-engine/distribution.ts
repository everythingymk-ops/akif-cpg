import type Decimal from "decimal.js";
import { resolveCostLines } from "./costLines";
import { applyMarginSpec } from "./margins";
import { dec, decPositive, fmt } from "./money";
import type {
  CalculationTrace,
  CostLine,
  CostResolutionContext,
  DecimalInput,
  MarginSpec,
  ResolvedCostLine,
  TraceStep,
} from "./types";

/**
 * Distributor economics (PRD §13, validated against the §96 waterfall):
 * the distributor buys at the brand invoice price, applies its margin/markup
 * to reach its sell price, and pass-through fees (handling, freight, fuel, …)
 * land on top of the sell price to form the retailer's acquisition cost:
 * $8.90 ÷ (1 − 0.15) + $0.50 ≈ $10.97 (PRD §96).
 */

export interface DistributorPricingInput {
  /** Brand invoice price to the distributor per unit (distributor buy price). */
  brandInvoicePricePerUnit: DecimalInput;
  /** Distributor margin or markup — basis always explicit (PRD §13). */
  marginSpec: MarginSpec;
  /** Distributor fees passed through on top of the sell price. */
  fees?: CostLine[];
  /**
   * Reference values for fee bases. `invoicePricePerUnit` defaults to the
   * brand invoice price (the distributor's acquisition invoice).
   */
  context?: CostResolutionContext;
}

export interface DistributorPricingResult {
  brandInvoicePricePerUnit: Decimal;
  /** Distributor net acquisition cost per unit (MVP: equals brand invoice). */
  netAcquisitionCostPerUnit: Decimal;
  /** Distributor sell price to the retailer, before pass-through fees. */
  sellPricePerUnit: Decimal;
  marginDollarsPerUnit: Decimal;
  /** Realized margin (margin dollars ÷ sell price), whatever the input basis. */
  marginRate: Decimal;
  /** Realized markup (margin dollars ÷ acquisition cost). */
  markupRate: Decimal;
  resolvedFees: ResolvedCostLine[];
  feesPerUnit: Decimal;
  /** Retailer landed acquisition cost = sell price + pass-through fees. */
  retailerAcquisitionCostPerUnit: Decimal;
  trace: CalculationTrace;
}

export function priceThroughDistributor(
  input: DistributorPricingInput,
): DistributorPricingResult {
  const brandInvoice = decPositive(input.brandInvoicePricePerUnit, "brandInvoicePricePerUnit");
  const rate = dec(input.marginSpec.rate, `distributor ${input.marginSpec.basis} rate`);
  const isMargin = input.marginSpec.basis === "margin";

  const netAcquisition = brandInvoice;
  const sellPrice = applyMarginSpec(netAcquisition, input.marginSpec);
  const marginDollars = sellPrice.minus(netAcquisition);
  const marginRate = marginDollars.dividedBy(sellPrice);
  const markupRate = marginDollars.dividedBy(netAcquisition);

  const context: CostResolutionContext = { ...input.context };
  if (context.invoicePricePerUnit === undefined) {
    context.invoicePricePerUnit = brandInvoice;
  }
  const { resolved, totalPerUnit } = resolveCostLines(input.fees ?? [], context);
  const retailerAcquisition = sellPrice.plus(totalPerUnit);

  const feeSteps: TraceStep[] = resolved.map((r) => ({
    label: r.line.name,
    formula: r.detail,
    value: r.perUnit,
  }));

  const trace: CalculationTrace = {
    title: "Distributor Pricing",
    formula: isMargin
      ? "sell price = acquisition cost ÷ (1 − margin); retailer cost = sell price + fees"
      : "sell price = acquisition cost × (1 + markup); retailer cost = sell price + fees",
    inputs: {
      "Brand invoice / unit": fmt(brandInvoice),
      [`Distributor ${input.marginSpec.basis} rate`]: fmt(rate),
      "Fee lines": String(resolved.length),
    },
    steps: [
      {
        label: isMargin
          ? "Apply distributor margin (profit ÷ selling price)"
          : "Apply distributor markup (profit ÷ cost)",
        formula: isMargin
          ? `${fmt(netAcquisition)} ÷ (1 − ${fmt(rate)})`
          : `${fmt(netAcquisition)} × (1 + ${fmt(rate)})`,
        value: sellPrice,
      },
      {
        label: "Distributor margin dollars / unit",
        formula: `${fmt(sellPrice)} − ${fmt(netAcquisition)}`,
        value: marginDollars,
      },
      ...feeSteps,
      {
        label: "Retailer landed acquisition cost / unit",
        formula: `${fmt(sellPrice)} + ${fmt(totalPerUnit)}`,
        value: retailerAcquisition,
      },
    ],
    output: retailerAcquisition,
  };

  return {
    brandInvoicePricePerUnit: brandInvoice,
    netAcquisitionCostPerUnit: netAcquisition,
    sellPricePerUnit: sellPrice,
    marginDollarsPerUnit: marginDollars,
    marginRate,
    markupRate,
    resolvedFees: resolved,
    feesPerUnit: totalPerUnit,
    retailerAcquisitionCostPerUnit: retailerAcquisition,
    trace,
  };
}
