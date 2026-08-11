import type Decimal from "decimal.js";
import { computeBreakEven } from "./breakEven";
import { computeContribution, type ContributionResult } from "./contribution";
import { ZERO, dec, decPositive, fmt, roundMoney } from "./money";
import {
  impliedBrandInvoiceAtShelf,
  requiredSrpForContribution,
  reversePriceFromShelf,
  type RequiredSrpResult,
} from "./reversePricing";
import type { SensitivityBaseScenario } from "./sensitivity";
import type { TradeSpendResult } from "./tradeSpend";
import { PricingEngineError, type DecimalInput } from "./types";

/**
 * Commercial Advisor rule engine (PRD §38–40).
 *
 * Pure and side-effect free: it evaluates the model and returns ranked,
 * numeric insights. It NEVER changes an input — applying a suggestion is an
 * explicit user action in the UI (PRD §40). Messages follow the guidance
 * language rules (PRD §56): observations and stress-test suggestions, never
 * prescriptions.
 *
 * Planning bands are editable data records, not hardcoded UI strings
 * (PRD §24, §55): pass custom bands via AdvisorSettings.
 */

export type AdvisorPriority = "critical" | "warning" | "opportunity";

export interface AdvisorInsight {
  code: string;
  priority: AdvisorPriority;
  /** Specific numerical observation (PRD §38) in guidance language (§56). */
  message: string;
  /** Key figures backing the message, preformatted for display. */
  metrics: Record<string, string>;
}

/** Editable trade-spend planning band (PRD §24, §55). */
export interface TradeSpendBand {
  id: string;
  label: string;
  /** Inclusive lower bound (decimal fraction). */
  minRate: DecimalInput;
  /** Exclusive upper bound; omit for an open-ended top band. */
  maxRate?: DecimalInput;
  guidance: string;
  /** Insight priority when the modeled rate lands here; null = informational only. */
  advisorPriority: AdvisorPriority | null;
}

/** Initial suggested planning bands (PRD §24) — data, safe to edit/replace. */
export const DEFAULT_TRADE_SPEND_BANDS: readonly TradeSpendBand[] = [
  {
    id: "low",
    label: "Low Promotional Support",
    minRate: "0.05",
    maxRate: "0.10",
    guidance:
      "Your trade-spend budget is relatively conservative. This may be sufficient for businesses with limited promotional commitments, strong everyday pricing, private-label relationships, or retailer-funded promotions.",
    advisorPriority: null,
  },
  {
    id: "moderate",
    label: "Moderate Support",
    minRate: "0.10",
    maxRate: "0.15",
    guidance:
      "This represents a moderate promotional budget. Review your planned TPRs, OIs, digital promotions, introductory programs, and retailer allowances to confirm they fit within this reserve.",
    advisorPriority: null,
  },
  {
    id: "active",
    label: "Active Retail Support",
    minRate: "0.15",
    maxRate: "0.20",
    guidance:
      "Your trade-spend budget represents meaningful retail support. Verify that your expected promotional lift and incremental sales justify the margin investment.",
    advisorPriority: null,
  },
  {
    id: "high",
    label: "Highly Promotional",
    minRate: "0.20",
    guidance:
      "Trade spend is consuming a significant portion of gross sales. Review promotional ROI, retailer requirements, and whether base pricing is sufficient to support this level of investment.",
    advisorPriority: "warning",
  },
];

/** Find the planning band a trade-spend rate falls into, if any. */
export function findTradeSpendBand(
  rate: DecimalInput,
  bands: readonly TradeSpendBand[] = DEFAULT_TRADE_SPEND_BANDS,
): TradeSpendBand | undefined {
  const r = dec(rate, "trade spend rate");
  return bands.find((band) => {
    if (r.lessThan(dec(band.minRate, `band "${band.id}" minRate`))) return false;
    return band.maxRate === undefined || r.lessThan(dec(band.maxRate, `band "${band.id}" maxRate`));
  });
}

export interface AdvisorScenario extends SensitivityBaseScenario {
  /** Enables the target-vs-required SRP comparison (PRD §39). */
  targetSrpPerUnit?: DecimalInput;
  /** Promotion plan result, for promotional-burden rules. */
  tradeSpendPlan?: TradeSpendResult;
}

/** All thresholds are editable planning parameters, not hardcoded advice. */
export interface AdvisorSettings {
  tradeSpendBands?: readonly TradeSpendBand[];
  /** Contribution margin below this is flagged (default 0.05). */
  lowContributionThreshold?: DecimalInput;
  /** Relative target-vs-required SRP gap that triggers a warning (default 0.10). */
  srpGapThreshold?: DecimalInput;
  /** Retailer margin probe step for the leverage rule (default 0.04 = 4 pp). */
  retailerMarginProbeStep?: DecimalInput;
  /** Trade spend probe step (default 0.02 = 2 pp). */
  tradeSpendProbeStep?: DecimalInput;
  /** Landed cost probe step in dollars (default 0.10). */
  landedCostProbeStep?: DecimalInput;
  /** Minimum SRP movement worth surfacing, in dollars (default 0.25). */
  minSrpImpact?: DecimalInput;
  /** Minimum contribution-margin gain worth surfacing (default 0.02 = 2 pp). */
  minMarginGain?: DecimalInput;
  /** Fixed-fee share of promo spend that triggers a warning (default 0.30). */
  fixedFeeShareThreshold?: DecimalInput;
  /** Required-SRP-per-dollar-of-landed-cost leverage threshold (default 2). */
  cogsLeverageThreshold?: DecimalInput;
}

const PRIORITY_ORDER: Record<AdvisorPriority, number> = {
  critical: 0,
  warning: 1,
  opportunity: 2,
};

const pct = (rate: Decimal, dp = 1): string => `${fmt(rate.times(100), dp)}%`;
const money = (value: Decimal): string => `$${roundMoney(value).toFixed(2)}`;

export function runAdvisor(
  scenario: AdvisorScenario,
  settings: AdvisorSettings = {},
): AdvisorInsight[] {
  const bands = settings.tradeSpendBands ?? DEFAULT_TRADE_SPEND_BANDS;
  const lowContribution = dec(settings.lowContributionThreshold ?? "0.05", "lowContributionThreshold");
  const srpGapThreshold = dec(settings.srpGapThreshold ?? "0.10", "srpGapThreshold");
  const retailerProbe = dec(settings.retailerMarginProbeStep ?? "0.04", "retailerMarginProbeStep");
  const tradeProbe = dec(settings.tradeSpendProbeStep ?? "0.02", "tradeSpendProbeStep");
  const landedProbe = dec(settings.landedCostProbeStep ?? "0.10", "landedCostProbeStep");
  const minSrpImpact = dec(settings.minSrpImpact ?? "0.25", "minSrpImpact");
  const minMarginGain = dec(settings.minMarginGain ?? "0.02", "minMarginGain");
  const fixedFeeShareThreshold = dec(settings.fixedFeeShareThreshold ?? "0.30", "fixedFeeShareThreshold");
  const cogsLeverageThreshold = dec(settings.cogsLeverageThreshold ?? "2", "cogsLeverageThreshold");

  const landedCost = decPositive(scenario.landedCostPerUnit, "landedCostPerUnit");
  const targetRate = dec(scenario.targetContributionRate, "targetContributionRate");
  const tradeRate =
    scenario.tradeSpendRate === undefined ? ZERO : dec(scenario.tradeSpendRate, "tradeSpendRate");
  const currentSrp =
    scenario.currentSrpPerUnit === undefined
      ? undefined
      : decPositive(scenario.currentSrpPerUnit, "currentSrpPerUnit");
  const targetSrp =
    scenario.targetSrpPerUnit === undefined
      ? undefined
      : decPositive(scenario.targetSrpPerUnit, "targetSrpPerUnit");

  const insights: AdvisorInsight[] = [];

  const requiredFor = (overrides: Partial<AdvisorScenario>): RequiredSrpResult =>
    requiredSrpForContribution({
      landedCostPerUnit: scenario.landedCostPerUnit,
      targetContributionRate: scenario.targetContributionRate,
      tradeSpendRate: scenario.tradeSpendRate,
      revenueDeductions: scenario.revenueDeductions,
      variableCosts: scenario.variableCosts,
      context: scenario.context,
      distributor: scenario.distributor,
      retailerMarginSpec: scenario.retailerMarginSpec,
      ...overrides,
    });

  // Base model: required SRP for the target contribution.
  let required: RequiredSrpResult | undefined;
  try {
    required = requiredFor({});
  } catch (error) {
    if (!(error instanceof PricingEngineError)) throw error;
    insights.push({
      code: "impossible-target-economics",
      priority: "critical",
      message:
        `No brand invoice can reach the ${pct(targetRate)} contribution target with the current ` +
        `rate structure (${error.message}). The assumption set itself may be worth revisiting.`,
      metrics: { "Target contribution": pct(targetRate) },
    });
  }

  // Contribution the current shelf price actually leaves.
  let atCurrent: ContributionResult | undefined;
  if (currentSrp) {
    try {
      const implied = impliedBrandInvoiceAtShelf({
        srpPerUnit: currentSrp,
        retailerMarginSpec: scenario.retailerMarginSpec,
        distributor: scenario.distributor,
        context: scenario.context,
      });
      atCurrent = computeContribution({
        brandInvoicePricePerUnit: implied.brandInvoicePerUnit,
        tradeSpendRate: scenario.tradeSpendRate,
        revenueDeductions: scenario.revenueDeductions,
        landedCostPerUnit: scenario.landedCostPerUnit,
        variableCosts: scenario.variableCosts,
        context: scenario.context,
      });
    } catch (error) {
      if (!(error instanceof PricingEngineError)) throw error;
      insights.push({
        code: "current-srp-economics-broken",
        priority: "critical",
        message: `The current ${money(currentSrp)} SRP cannot support the model at all: ${error.message}`,
        metrics: { "Current SRP": money(currentSrp) },
      });
    }
  }

  // Break-even SRP for the price-below-break-even check.
  let breakEvenSrp: Decimal | undefined;
  try {
    breakEvenSrp = computeBreakEven({
      landedCostPerUnit: scenario.landedCostPerUnit,
      tradeSpendRate: scenario.tradeSpendRate,
      revenueDeductions: scenario.revenueDeductions,
      variableCosts: scenario.variableCosts,
      context: scenario.context,
      distributor: scenario.distributor,
      retailerMarginSpec: scenario.retailerMarginSpec,
    }).breakEvenSrpPerUnit;
  } catch (error) {
    if (!(error instanceof PricingEngineError)) throw error;
  }

  // ── Critical ──────────────────────────────────────────────────────────────
  if (atCurrent && currentSrp) {
    if (atCurrent.contributionMarginRate.lessThan(0)) {
      insights.push({
        code: "negative-contribution",
        priority: "critical",
        message:
          `At the current ${money(currentSrp)} SRP, contribution is ${pct(atCurrent.contributionMarginRate)} ` +
          `(${money(atCurrent.contributionPerUnit)} per unit) — the model loses money on every unit.`,
        metrics: {
          "Current SRP": money(currentSrp),
          "Contribution margin": pct(atCurrent.contributionMarginRate),
          "Contribution / unit": money(atCurrent.contributionPerUnit),
        },
      });
    }
    if (landedCost.greaterThanOrEqualTo(atCurrent.netRevenuePerUnit)) {
      insights.push({
        code: "cost-exceeds-net-revenue",
        priority: "critical",
        message:
          `Landed cost ${money(landedCost)} meets or exceeds the ${money(atCurrent.netRevenuePerUnit)} ` +
          `net revenue the current ${money(currentSrp)} SRP leaves — product cost alone consumes the revenue.`,
        metrics: {
          "Landed cost": money(landedCost),
          "Net revenue": money(atCurrent.netRevenuePerUnit),
        },
      });
    }
  }

  const anchorSrp = currentSrp ?? targetSrp;
  if (anchorSrp && breakEvenSrp && anchorSrp.lessThan(breakEvenSrp)) {
    insights.push({
      code: "srp-below-break-even",
      priority: "critical",
      message:
        `The ${money(anchorSrp)} shelf price is below the ${money(breakEvenSrp)} break-even SRP ` +
        `(gap ${money(breakEvenSrp.minus(anchorSrp))}).`,
      metrics: {
        "Shelf price": money(anchorSrp),
        "Break-even SRP": money(breakEvenSrp),
      },
    });
  }

  // ── Warning ───────────────────────────────────────────────────────────────
  const band = findTradeSpendBand(tradeRate, bands);
  if (band?.advisorPriority) {
    insights.push({
      code: `trade-spend-band-${band.id}`,
      priority: band.advisorPriority,
      message: `Modeled trade spend is ${pct(tradeRate)} (${band.label}). ${band.guidance}`,
      metrics: { "Trade spend": pct(tradeRate), Band: band.label },
    });
  }

  if (atCurrent && !atCurrent.contributionMarginRate.lessThan(0) &&
      atCurrent.contributionMarginRate.lessThan(lowContribution)) {
    insights.push({
      code: "low-contribution",
      priority: "warning",
      message:
        `Contribution margin at the current SRP is ${pct(atCurrent.contributionMarginRate)}, below the ` +
        `${pct(lowContribution)} planning floor — a thin buffer that deductions or promo overruns could erase.`,
      metrics: {
        "Contribution margin": pct(atCurrent.contributionMarginRate),
        "Planning floor": pct(lowContribution),
      },
    });
  }

  const plan = scenario.tradeSpendPlan;
  if (plan && plan.totalPromotionSpend.greaterThan(0)) {
    const fixedSpend = plan.breakdown.reduce((sum, b) => sum.plus(b.fixedSpend), ZERO);
    const fixedShare = fixedSpend.dividedBy(plan.totalPromotionSpend);
    if (fixedShare.greaterThan(fixedFeeShareThreshold)) {
      insights.push({
        code: "high-fixed-promo-fees",
        priority: "warning",
        message:
          `Fixed event fees are ${pct(fixedShare)} of promotional spend — a heavy fixed component ` +
          `relative to volume; confirm the unit forecast supports these events.`,
        metrics: {
          "Fixed share of promo spend": pct(fixedShare),
          "Fixed spend": money(fixedSpend),
        },
      });
    }
  }

  if (targetSrp && required) {
    const gap = targetSrp.minus(required.requiredSrpPerUnit).abs();
    const relativeGap = gap.dividedBy(required.requiredSrpPerUnit);
    if (relativeGap.greaterThan(srpGapThreshold)) {
      insights.push({
        code: "target-srp-gap",
        priority: "warning",
        message:
          `The ${money(targetSrp)} target SRP differs from the ${money(required.requiredSrpPerUnit)} ` +
          `calculated requirement by ${pct(relativeGap)} — worth reconciling before committing to shelf pricing.`,
        metrics: {
          "Target SRP": money(targetSrp),
          "Required SRP": money(required.requiredSrpPerUnit),
          Gap: money(gap),
        },
      });
    }
  }

  if (currentSrp && required && currentSrp.lessThan(required.requiredSrpPerUnit)) {
    const srpIncrease = required.requiredSrpPerUnit.minus(currentSrp);
    const metrics: Record<string, string> = {
      "Current SRP": money(currentSrp),
      "Required SRP": money(required.requiredSrpPerUnit),
      "SRP increase needed": money(srpIncrease),
    };
    let remedy = "";
    try {
      const reverse = reversePriceFromShelf({
        targetSrpPerUnit: currentSrp,
        retailerMarginSpec: scenario.retailerMarginSpec,
        distributor: scenario.distributor,
        targetContributionRate: scenario.targetContributionRate,
        tradeSpendRate: scenario.tradeSpendRate,
        revenueDeductions: scenario.revenueDeductions,
        variableCosts: scenario.variableCosts,
        context: scenario.context,
      });
      const landedReduction = landedCost.minus(reverse.maxLandedCostPerUnit);
      if (landedReduction.greaterThan(0)) {
        remedy = ` or approximately ${money(landedReduction)} lower landed cost`;
        metrics["Landed cost reduction needed"] = money(landedReduction);
      }
    } catch (error) {
      if (!(error instanceof PricingEngineError)) throw error;
    }
    insights.push({
      code: "target-unreachable-at-current-srp",
      priority: "warning",
      message:
        `At the current ${money(currentSrp)} SRP the ${pct(targetRate)} contribution target is out of ` +
        `reach. Reaching it would take approximately a ${money(srpIncrease)} SRP increase${remedy}.`,
      metrics,
    });
  }

  // ── Opportunity ───────────────────────────────────────────────────────────
  if (scenario.distributor && atCurrent && currentSrp) {
    try {
      const directImplied = impliedBrandInvoiceAtShelf({
        srpPerUnit: currentSrp,
        retailerMarginSpec: scenario.retailerMarginSpec,
        context: scenario.context,
      });
      const direct = computeContribution({
        brandInvoicePricePerUnit: directImplied.brandInvoicePerUnit,
        tradeSpendRate: scenario.tradeSpendRate,
        revenueDeductions: scenario.revenueDeductions,
        landedCostPerUnit: scenario.landedCostPerUnit,
        variableCosts: scenario.variableCosts,
        context: scenario.context,
      });
      const gain = direct.contributionMarginRate.minus(atCurrent.contributionMarginRate);
      if (gain.greaterThanOrEqualTo(minMarginGain)) {
        insights.push({
          code: "direct-distribution-improves-margin",
          priority: "opportunity",
          message:
            `Selling direct at the same ${money(currentSrp)} SRP could move contribution margin from ` +
            `${pct(atCurrent.contributionMarginRate)} to ${pct(direct.contributionMarginRate)} ` +
            `(+${fmt(gain.times(100), 1)} pp) — worth stress-testing if the route is feasible.`,
          metrics: {
            "With distributor": pct(atCurrent.contributionMarginRate),
            Direct: pct(direct.contributionMarginRate),
          },
        });
      }
    } catch (error) {
      if (!(error instanceof PricingEngineError)) throw error;
    }
  }

  if (required && scenario.retailerMarginSpec.basis === "margin") {
    const baseRate = dec(scenario.retailerMarginSpec.rate, "retailer margin rate");
    const probedRate = baseRate.minus(retailerProbe);
    if (probedRate.greaterThan(0)) {
      try {
        const probed = requiredFor({
          retailerMarginSpec: { basis: "margin", rate: probedRate },
        });
        const srpDrop = required.requiredSrpPerUnit.minus(probed.requiredSrpPerUnit);
        if (srpDrop.greaterThanOrEqualTo(minSrpImpact)) {
          insights.push({
            code: "retailer-margin-leverage",
            priority: "opportunity",
            message:
              `Retailer margin is ${pct(baseRate)}. At ${pct(probedRate)}, the required shelf price ` +
              `drops by approximately ${money(srpDrop)} (from ${money(required.requiredSrpPerUnit)} to ` +
              `${money(probed.requiredSrpPerUnit)}) — a lever worth exploring in retailer negotiations.`,
            metrics: {
              "Retailer margin": pct(baseRate),
              "Probed margin": pct(probedRate),
              "SRP impact": money(srpDrop),
            },
          });
        }
      } catch (error) {
        if (!(error instanceof PricingEngineError)) throw error;
      }
    }
  }

  if (required && tradeRate.greaterThanOrEqualTo(tradeProbe)) {
    try {
      const probed = requiredFor({ tradeSpendRate: tradeRate.minus(tradeProbe) });
      const srpDrop = required.requiredSrpPerUnit.minus(probed.requiredSrpPerUnit);
      if (srpDrop.greaterThanOrEqualTo(minSrpImpact)) {
        insights.push({
          code: "trade-spend-leverage",
          priority: "opportunity",
          message:
            `Reducing trade spend from ${pct(tradeRate)} to ${pct(tradeRate.minus(tradeProbe))} would ` +
            `lower the required SRP by approximately ${money(srpDrop)} — promotional efficiency has ` +
            `direct shelf-price leverage here.`,
          metrics: {
            "Trade spend": pct(tradeRate),
            "SRP impact": money(srpDrop),
          },
        });
      }
    } catch (error) {
      if (!(error instanceof PricingEngineError)) throw error;
    }
  }

  if (required && landedCost.greaterThan(landedProbe)) {
    try {
      const probed = requiredFor({ landedCostPerUnit: landedCost.minus(landedProbe) });
      const srpDrop = required.requiredSrpPerUnit.minus(probed.requiredSrpPerUnit);
      const leverage = srpDrop.dividedBy(landedProbe);
      if (leverage.greaterThanOrEqualTo(cogsLeverageThreshold)) {
        insights.push({
          code: "cogs-leverage",
          priority: "opportunity",
          message:
            `Each ${money(landedProbe)} of landed-cost reduction lowers the required SRP by approximately ` +
            `${money(srpDrop)} (×${fmt(leverage, 1)} leverage) — cost reduction is a high-impact lever in ` +
            `this rate structure.`,
          metrics: {
            "Probe step": money(landedProbe),
            "SRP impact": money(srpDrop),
            Leverage: `×${fmt(leverage, 1)}`,
          },
        });
      }
    } catch (error) {
      if (!(error instanceof PricingEngineError)) throw error;
    }
  }

  return insights
    .map((insight, index) => ({ insight, index }))
    .sort(
      (a, b) =>
        PRIORITY_ORDER[a.insight.priority] - PRIORITY_ORDER[b.insight.priority] ||
        a.index - b.index,
    )
    .map(({ insight }) => insight);
}
