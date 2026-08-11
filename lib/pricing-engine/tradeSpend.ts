import type Decimal from "decimal.js";
import { ONE, ZERO, decNonNegative, decPositive, decRate01, fmt } from "./money";
import { PricingEngineError, type CalculationTrace, type DecimalInput, type TraceStep } from "./types";

/**
 * Trade spend engine (PRD §16–23).
 *
 * Two calculation modes (PRD §21):
 * - `normalizedWeeks`: no unit forecast needed — a normal week's volume is 1.0
 *   and promotions are weighted by weeks × lift. Fixed dollar fees cannot be
 *   expressed in this mode and are rejected.
 * - `actualUnits`: uses a weekly unit forecast and the brand invoice price, so
 *   fixed event fees and flat costs can be blended into the effective rate.
 *
 * Promotion `type` is descriptive metadata in the MVP: the user parameterizes
 * discount, lift and funding per promotion (PRD §21). Type-specific mechanics
 * (scanback vs off-invoice vs lump sum, …) are Phase 2 (PRD §80).
 */

export type PromotionType =
  | "bogo"
  | "bogo50"
  | "buy2get1"
  | "tpr"
  | "offInvoice"
  | "scanback"
  | "featureAd"
  | "display"
  | "featureAndDisplay"
  | "introductoryAllowance"
  | "caseAllowance"
  | "freeFill"
  | "newStoreOpening"
  | "loyalty"
  | "digitalCoupon"
  | "retailerCoupon"
  | "markdownSupport"
  | "other";

export interface Promotion {
  id?: string;
  name: string;
  type: PromotionType;
  /** Number of events; required when a fixed event fee is charged. */
  events?: DecimalInput;
  /** Total promotional weeks across all events. */
  weeks: DecimalInput;
  /** Effective consumer discount as a decimal fraction (50% → 0.5). */
  discountRate: DecimalInput;
  /** Share of the discount funded by the brand (100% → 1.0) — PRD §19. */
  brandFundingRate: DecimalInput;
  /** Informational in MVP: shares funded by others (not brand trade spend). */
  retailerFundingRate?: DecimalInput;
  distributorFundingRate?: DecimalInput;
  /** Promotional volume vs a normal week (2.0 = twice normal) — PRD §20. */
  salesLift: DecimalInput;
  /** Fixed fee charged per event ($) — requires `events` and actual-units mode. */
  fixedEventFee?: DecimalInput;
  /** Flat additional cost for the whole promotion ($) — actual-units mode. */
  additionalCost?: DecimalInput;
  /** Optional forecast of promoted units; overrides weeks × lift × weekly units. */
  estimatedUnits?: DecimalInput;
  /** Optional ISO dates (PRD §65) — informational; used by overlap validation. */
  startDate?: string;
  endDate?: string;
  notes?: string;
}

export type TradeSpendMode = "normalizedWeeks" | "actualUnits";

export interface TradeSpendPlanInput {
  /** Planning horizon in weeks. Defaults to 52. */
  annualWeeks?: DecimalInput;
  promotions: Promotion[];
  /** Additional trade reserve on top of calculated promo spend (PRD §23). */
  additionalReserveRate?: DecimalInput;
}

/** Unit forecast context for actual-units mode (PRD §21). */
export interface ActualUnitsContext {
  /** Unit volume of a normal (non-promoted) week. */
  normalWeeklyUnits: DecimalInput;
  /** Brand invoice price per unit — the value basis of the spend rate. */
  brandInvoicePricePerUnit: DecimalInput;
}

export interface PromotionBreakdown {
  promotion: Promotion;
  /** Equivalent units (normalized mode) or forecast promoted units. */
  promoUnits: Decimal;
  /** Discount × brand funding spend (equivalent value or dollars). */
  variableSpend: Decimal;
  /** Event fees + flat costs (always 0 in normalized mode). */
  fixedSpend: Decimal;
  totalSpend: Decimal;
  /** This promotion's contribution to the effective rate. */
  effectiveRate: Decimal;
}

export interface TradeSpendResult {
  mode: TradeSpendMode;
  annualWeeks: Decimal;
  totalPromoWeeks: Decimal;
  normalWeeks: Decimal;
  /** Annual volume: equivalent weeks (normalized) or units (actual). */
  annualUnits: Decimal;
  /** Annual gross value at full invoice price (equivalent value or dollars). */
  grossValue: Decimal;
  totalPromotionSpend: Decimal;
  /** Effective promotional trade spend ÷ gross value (PRD §21). */
  promotionalTradeRate: Decimal;
  additionalReserveRate: Decimal;
  /** promotionalTradeRate + additionalReserveRate (PRD §23). */
  totalTradeRate: Decimal;
  breakdown: PromotionBreakdown[];
  trace: CalculationTrace;
}

interface ParsedPromotion {
  promotion: Promotion;
  weeks: Decimal;
  discount: Decimal;
  brandFunding: Decimal;
  lift: Decimal;
  events?: Decimal;
  fixedEventFee: Decimal;
  additionalCost: Decimal;
  estimatedUnits?: Decimal;
}

function parsePromotion(promotion: Promotion): ParsedPromotion {
  const name = promotion.name || "(unnamed promotion)";
  const weeks = decNonNegative(promotion.weeks, `promotion "${name}" weeks`);
  const discount = decRate01(promotion.discountRate, `promotion "${name}" discountRate`);
  const brandFunding = decRate01(promotion.brandFundingRate, `promotion "${name}" brandFundingRate`);
  if (promotion.retailerFundingRate !== undefined) {
    decRate01(promotion.retailerFundingRate, `promotion "${name}" retailerFundingRate`);
  }
  if (promotion.distributorFundingRate !== undefined) {
    decRate01(promotion.distributorFundingRate, `promotion "${name}" distributorFundingRate`);
  }
  const lift = decNonNegative(promotion.salesLift, `promotion "${name}" salesLift`);

  let events: Decimal | undefined;
  if (promotion.events !== undefined) {
    events = decNonNegative(promotion.events, `promotion "${name}" events`);
    if (!events.isInteger()) {
      throw new PricingEngineError(
        `promotion "${name}" events must be a whole number, got ${events.toString()}`,
      );
    }
  }

  const fixedEventFee =
    promotion.fixedEventFee === undefined
      ? ZERO
      : decNonNegative(promotion.fixedEventFee, `promotion "${name}" fixedEventFee`);
  const additionalCost =
    promotion.additionalCost === undefined
      ? ZERO
      : decNonNegative(promotion.additionalCost, `promotion "${name}" additionalCost`);
  const estimatedUnits =
    promotion.estimatedUnits === undefined
      ? undefined
      : decNonNegative(promotion.estimatedUnits, `promotion "${name}" estimatedUnits`);

  if (fixedEventFee.greaterThan(0) && events === undefined) {
    throw new PricingEngineError(
      `promotion "${name}" has a fixedEventFee but no events count — provide events to charge per-event fees`,
    );
  }

  return {
    promotion,
    weeks,
    discount,
    brandFunding,
    lift,
    events,
    fixedEventFee,
    additionalCost,
    estimatedUnits,
  };
}

function parsePlan(input: TradeSpendPlanInput): {
  annualWeeks: Decimal;
  reserve: Decimal;
  parsed: ParsedPromotion[];
  totalPromoWeeks: Decimal;
  normalWeeks: Decimal;
} {
  const annualWeeks = decPositive(input.annualWeeks ?? 52, "annualWeeks");
  const reserve =
    input.additionalReserveRate === undefined
      ? ZERO
      : decNonNegative(input.additionalReserveRate, "additionalReserveRate");

  const parsed = input.promotions.map(parsePromotion);
  const totalPromoWeeks = parsed.reduce((sum, p) => sum.plus(p.weeks), ZERO);
  if (totalPromoWeeks.greaterThan(annualWeeks)) {
    throw new PricingEngineError(
      `total promotional weeks (${totalPromoWeeks.toString()}) exceed the planning horizon of ` +
        `${annualWeeks.toString()} weeks`,
    );
  }
  const normalWeeks = annualWeeks.minus(totalPromoWeeks);

  return { annualWeeks, reserve, parsed, totalPromoWeeks, normalWeeks };
}

function buildResult(
  mode: TradeSpendMode,
  plan: ReturnType<typeof parsePlan>,
  breakdown: PromotionBreakdown[],
  annualUnits: Decimal,
  grossValue: Decimal,
  promoSteps: TraceStep[],
  extraInputs: Record<string, string>,
): TradeSpendResult {
  if (grossValue.lessThanOrEqualTo(0)) {
    throw new PricingEngineError(
      "annual gross value is zero — cannot express trade spend as a rate (check weeks, lift and unit forecast)",
    );
  }

  const totalPromotionSpend = breakdown.reduce((sum, b) => sum.plus(b.totalSpend), ZERO);
  const promotionalTradeRate = totalPromotionSpend.dividedBy(grossValue);
  const totalTradeRate = promotionalTradeRate.plus(plan.reserve);

  const finishedBreakdown = breakdown.map((b) => ({
    ...b,
    effectiveRate: b.totalSpend.dividedBy(grossValue),
  }));

  const trace: CalculationTrace = {
    title: "Effective Annual Trade Spend",
    formula:
      "effective trade spend % = total promotion spend ÷ annual gross value; " +
      "total planned trade spend % = effective % + additional reserve %",
    inputs: {
      "Planning horizon (weeks)": fmt(plan.annualWeeks, 2),
      Promotions: String(breakdown.length),
      "Additional reserve": fmt(plan.reserve),
      ...extraInputs,
    },
    steps: [
      {
        label: "Normal (non-promoted) weeks",
        formula: `${fmt(plan.annualWeeks, 2)} − ${fmt(plan.totalPromoWeeks, 2)}`,
        value: plan.normalWeeks,
      },
      ...promoSteps,
      {
        label: mode === "normalizedWeeks" ? "Annual equivalent units" : "Annual units",
        formula: "normal volume + Σ promoted volume",
        value: annualUnits,
      },
      {
        label: "Total promotion spend",
        formula: finishedBreakdown.map((b) => fmt(b.totalSpend)).join(" + ") || "0",
        value: totalPromotionSpend,
      },
      {
        label: "Effective promotional trade spend rate",
        formula: `${fmt(totalPromotionSpend)} ÷ ${fmt(grossValue)}`,
        value: promotionalTradeRate,
      },
      {
        label: "Total planned trade spend rate (incl. additional reserve)",
        formula: `${fmt(promotionalTradeRate)} + ${fmt(plan.reserve)}`,
        value: totalTradeRate,
      },
    ],
    output: totalTradeRate,
  };

  return {
    mode,
    annualWeeks: plan.annualWeeks,
    totalPromoWeeks: plan.totalPromoWeeks,
    normalWeeks: plan.normalWeeks,
    annualUnits,
    grossValue,
    totalPromotionSpend,
    promotionalTradeRate,
    additionalReserveRate: plan.reserve,
    totalTradeRate,
    breakdown: finishedBreakdown,
    trace,
  };
}

/**
 * Normalized-weeks mode (PRD §21–22): a normal week's volume is 1.0.
 * Promo equivalent units = weeks × lift;
 * spend equivalent = weeks × lift × discount × brand funding.
 * Fixed dollar fees are rejected — use actual-units mode for those.
 */
export function computeTradeSpendNormalized(input: TradeSpendPlanInput): TradeSpendResult {
  const plan = parsePlan(input);

  const withFixedFees = plan.parsed.filter(
    (p) => p.fixedEventFee.greaterThan(0) || p.additionalCost.greaterThan(0),
  );
  if (withFixedFees.length > 0) {
    throw new PricingEngineError(
      `promotion "${withFixedFees[0].promotion.name}" carries fixed dollar costs — ` +
        `normalized-weeks mode cannot rate them against volume; use actual-units mode (PRD §21)`,
    );
  }

  const promoSteps: TraceStep[] = [];
  const breakdown: PromotionBreakdown[] = plan.parsed.map((p) => {
    const promoUnits = p.weeks.times(p.lift);
    const variableSpend = promoUnits.times(p.discount).times(p.brandFunding);
    promoSteps.push(
      {
        label: `${p.promotion.name} — equivalent units`,
        formula: `${fmt(p.weeks, 2)} weeks × ${fmt(p.lift, 2)} lift`,
        value: promoUnits,
      },
      {
        label: `${p.promotion.name} — spend equivalent`,
        formula: `${fmt(promoUnits, 2)} × ${fmt(p.discount)} discount × ${fmt(p.brandFunding)} funded`,
        value: variableSpend,
      },
    );
    return {
      promotion: p.promotion,
      promoUnits,
      variableSpend,
      fixedSpend: ZERO,
      totalSpend: variableSpend,
      effectiveRate: ZERO, // finalized against gross value in buildResult
    };
  });

  const annualUnits = breakdown.reduce((sum, b) => sum.plus(b.promoUnits), plan.normalWeeks);
  // At a normalized price of 1.0 per unit, gross value equals unit volume.
  return buildResult("normalizedWeeks", plan, breakdown, annualUnits, annualUnits, promoSteps, {
    "Normal week volume": "1.0 (normalized)",
  });
}

/**
 * Actual-units mode (PRD §21): rates spend against a real unit forecast and
 * the brand invoice price, so fixed event fees and flat costs participate.
 */
export function computeTradeSpendActualUnits(
  input: TradeSpendPlanInput,
  context: ActualUnitsContext,
): TradeSpendResult {
  const plan = parsePlan(input);
  const weeklyUnits = decPositive(context.normalWeeklyUnits, "normalWeeklyUnits");
  const invoicePrice = decPositive(context.brandInvoicePricePerUnit, "brandInvoicePricePerUnit");

  const promoSteps: TraceStep[] = [];
  const breakdown: PromotionBreakdown[] = plan.parsed.map((p) => {
    const promoUnits = p.estimatedUnits ?? p.weeks.times(p.lift).times(weeklyUnits);
    const variableSpend = promoUnits.times(invoicePrice).times(p.discount).times(p.brandFunding);
    const eventFees = p.fixedEventFee.greaterThan(0)
      ? p.fixedEventFee.times(p.events ?? ONE)
      : ZERO;
    const fixedSpend = eventFees.plus(p.additionalCost);
    const totalSpend = variableSpend.plus(fixedSpend);
    promoSteps.push(
      {
        label: `${p.promotion.name} — promoted units`,
        formula: p.estimatedUnits
          ? `forecast override (${fmt(promoUnits, 2)})`
          : `${fmt(p.weeks, 2)} weeks × ${fmt(p.lift, 2)} lift × ${fmt(weeklyUnits, 2)} units/week`,
        value: promoUnits,
      },
      {
        label: `${p.promotion.name} — spend`,
        formula:
          `${fmt(promoUnits, 2)} × $${fmt(invoicePrice)} × ${fmt(p.discount)} × ${fmt(p.brandFunding)}` +
          (fixedSpend.greaterThan(0) ? ` + $${fmt(fixedSpend, 2)} fixed` : ""),
        value: totalSpend,
      },
    );
    return {
      promotion: p.promotion,
      promoUnits,
      variableSpend,
      fixedSpend,
      totalSpend,
      effectiveRate: ZERO, // finalized against gross value in buildResult
    };
  });

  const annualUnits = breakdown.reduce(
    (sum, b) => sum.plus(b.promoUnits),
    plan.normalWeeks.times(weeklyUnits),
  );
  const grossValue = annualUnits.times(invoicePrice);

  return buildResult("actualUnits", plan, breakdown, annualUnits, grossValue, promoSteps, {
    "Normal weekly units": fmt(weeklyUnits, 2),
    "Brand invoice price / unit": fmt(invoicePrice),
  });
}
