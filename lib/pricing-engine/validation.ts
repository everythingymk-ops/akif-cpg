import type Decimal from "decimal.js";
import { D } from "./money";
import type { Promotion } from "./tradeSpend";
import type { CostLine, DecimalInput, MarginSpec } from "./types";

/**
 * Model validation (PRD §71): pure rule checks over a model snapshot.
 * Rules never throw — a validator that dies on bad input cannot warn about it.
 * Every finding is a warning for the user to review, not a hard failure.
 */

export interface ModelSnapshot {
  retailerMarginSpec?: MarginSpec;
  /** True when the route includes a distributor (routes B/C/E, PRD §12). */
  distributorSelected?: boolean;
  distributorMarginSpec?: MarginSpec;
  /** Total planned trade spend rate (decimal fraction). */
  tradeSpendRate?: DecimalInput;
  /** Any cost lines to check (landed cost, fees, deductions, …). */
  costLines?: CostLine[];
  promotions?: Promotion[];
  /** Planning horizon; defaults to 52 weeks. */
  annualWeeks?: DecimalInput;
  /** Computed contribution per unit, if available. */
  contributionPerUnit?: DecimalInput;
  targetSrpPerUnit?: DecimalInput;
  /** Computed break-even SRP, if available. */
  breakEvenSrpPerUnit?: DecimalInput;
  /** Annual unit volume forecast, if any. */
  annualUnits?: DecimalInput;
  /** True when the product is imported (PRD §71). */
  isImported?: boolean;
  /** Import/landed cost lines (used by the imported-but-blank rule). */
  landedCostLines?: CostLine[];
  manufacturerMarginSpec?: MarginSpec;
  manufacturingCogsPerUnit?: DecimalInput;
}

export interface ValidationWarning {
  code: string;
  message: string;
}

/** Parse without throwing — validation reports problems instead of dying on them. */
function safeDec(value: DecimalInput | undefined): Decimal | undefined {
  if (value === undefined || value === null) return undefined;
  try {
    const parsed = new D(value);
    return parsed.isFinite() ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function marginAtOrAbove100(spec: MarginSpec | undefined): boolean {
  if (!spec || spec.basis !== "margin") return false;
  const rate = safeDec(spec.rate);
  return rate !== undefined && rate.greaterThanOrEqualTo(1);
}

function datesOverlap(a: Promotion, b: Promotion): boolean {
  if (!a.startDate || !a.endDate || !b.startDate || !b.endDate) return false;
  const aStart = Date.parse(a.startDate);
  const aEnd = Date.parse(a.endDate);
  const bStart = Date.parse(b.startDate);
  const bEnd = Date.parse(b.endDate);
  if ([aStart, aEnd, bStart, bEnd].some(Number.isNaN)) return false;
  return aStart <= bEnd && bStart <= aEnd;
}

export function validateModel(snapshot: ModelSnapshot): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const warn = (code: string, message: string) => warnings.push({ code, message });

  // Margin-basis rates at or above 100% make prices infinite (PRD §71).
  if (marginAtOrAbove100(snapshot.retailerMarginSpec)) {
    warn("retailer-margin-too-high", "Retailer margin is 100% or more — the required SRP is undefined at this rate.");
  }
  if (marginAtOrAbove100(snapshot.distributorMarginSpec)) {
    warn("distributor-margin-too-high", "Distributor margin is 100% or more — the distributor sell price is undefined at this rate.");
  }

  const tradeRate = safeDec(snapshot.tradeSpendRate);
  if (tradeRate?.greaterThanOrEqualTo(1)) {
    warn("trade-spend-too-high", "Trade spend is 100% or more of gross revenue — no net revenue remains.");
  }

  // Negative cost lines (covers the generic and the freight-specific §71 rules).
  for (const line of snapshot.costLines ?? []) {
    const amount = safeDec(line.amount);
    if (amount?.lessThan(0)) {
      const isFreight = /freight/i.test(line.name);
      warn(
        isFreight ? "negative-freight" : "negative-cost",
        `Cost line "${line.name}" has a negative amount (${amount.toString()}) — confirm this is an intentional credit.`,
      );
    }
  }

  const promotions = snapshot.promotions ?? [];
  const annualWeeks = safeDec(snapshot.annualWeeks) ?? new D(52);
  const totalPromoWeeks = promotions.reduce((sum, p) => {
    const weeks = safeDec(p.weeks);
    return weeks ? sum.plus(weeks) : sum;
  }, new D(0));
  if (totalPromoWeeks.greaterThan(annualWeeks)) {
    warn(
      "promo-weeks-exceed-year",
      `Promotional weeks total ${totalPromoWeeks.toString()}, more than the ${annualWeeks.toString()}-week planning year.`,
    );
  }

  for (let i = 0; i < promotions.length; i += 1) {
    for (let j = i + 1; j < promotions.length; j += 1) {
      if (datesOverlap(promotions[i], promotions[j])) {
        warn(
          "promotion-overlap",
          `Promotions "${promotions[i].name}" and "${promotions[j].name}" have overlapping dates — confirm the calendar is intentional.`,
        );
      }
    }
  }

  const contribution = safeDec(snapshot.contributionPerUnit);
  if (contribution?.lessThan(0)) {
    warn("negative-contribution", `Contribution is negative (${contribution.toString()} per unit) — the model loses money on every unit.`);
  }

  const targetSrp = safeDec(snapshot.targetSrpPerUnit);
  const breakEvenSrp = safeDec(snapshot.breakEvenSrpPerUnit);
  if (targetSrp && breakEvenSrp && targetSrp.lessThan(breakEvenSrp)) {
    warn(
      "target-srp-below-break-even",
      `Target SRP ${targetSrp.toString()} is below the break-even SRP ${breakEvenSrp.toString()}.`,
    );
  }

  // Fixed costs without any annual volume cannot be amortized (PRD §71, §14).
  const hasFixedPromoCosts = promotions.some((p) => {
    const fee = safeDec(p.fixedEventFee);
    const extra = safeDec(p.additionalCost);
    return (fee?.greaterThan(0) ?? false) || (extra?.greaterThan(0) ?? false);
  });
  const hasAnnualCostLines = (snapshot.costLines ?? []).some((line) => line.basis === "annual");
  if ((hasFixedPromoCosts || hasAnnualCostLines) && safeDec(snapshot.annualUnits) === undefined) {
    warn(
      "fixed-costs-without-volume",
      "Fixed costs exist but no annual unit volume is set — fixed costs cannot be spread per unit.",
    );
  }

  if (snapshot.distributorSelected && !snapshot.distributorMarginSpec) {
    warn("distributor-margin-missing", "A distributor route is selected but no distributor margin is set.");
  }

  if (snapshot.isImported && (snapshot.landedCostLines ?? []).length === 0) {
    warn("import-costs-missing", "The product is imported but no import/landed cost lines are set.");
  }

  if (snapshot.manufacturerMarginSpec && safeDec(snapshot.manufacturingCogsPerUnit) === undefined) {
    warn(
      "manufacturer-margin-without-cogs",
      "A manufacturer margin is set but no manufacturing COGS exists to apply it to.",
    );
  }

  return warnings;
}
