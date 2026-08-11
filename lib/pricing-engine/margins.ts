import type Decimal from "decimal.js";
import { ONE, dec } from "./money";
import { PricingEngineError, type DecimalInput, type MarginSpec } from "./types";

/**
 * Margin ≠ markup (PRD §8). These helpers are the single place the two bases
 * are converted into prices; every downstream module dispatches on an explicit
 * `MarginSpec.basis` and never guesses.
 */

/** price = cost ÷ (1 − margin), where margin = profit ÷ selling price. */
export function priceFromMargin(cost: DecimalInput, marginRate: DecimalInput): Decimal {
  const c = dec(cost, "cost");
  const m = dec(marginRate, "margin rate");
  if (m.greaterThanOrEqualTo(1)) {
    throw new PricingEngineError(
      `margin rate must be < 1, got ${m.toString()} — a margin of 100% or more implies an infinite selling price`,
    );
  }
  return c.dividedBy(ONE.minus(m));
}

/** price = cost × (1 + markup), where markup = profit ÷ cost. */
export function priceFromMarkup(cost: DecimalInput, markupRate: DecimalInput): Decimal {
  const c = dec(cost, "cost");
  const k = dec(markupRate, "markup rate");
  if (k.lessThanOrEqualTo(-1)) {
    throw new PricingEngineError(
      `markup rate must be > -1, got ${k.toString()} — a markup of -100% or less implies a zero or negative selling price`,
    );
  }
  return c.times(ONE.plus(k));
}

/** Dispatch on the explicit basis — the only branch between margin and markup. */
export function applyMarginSpec(cost: DecimalInput, spec: MarginSpec): Decimal {
  return spec.basis === "margin"
    ? priceFromMargin(cost, spec.rate)
    : priceFromMarkup(cost, spec.rate);
}

/** Realized margin = (price − cost) ÷ price. */
export function marginRateOf(cost: DecimalInput, price: DecimalInput): Decimal {
  const c = dec(cost, "cost");
  const p = dec(price, "price");
  if (p.isZero()) {
    throw new PricingEngineError("cannot compute a margin rate against a zero price");
  }
  return p.minus(c).dividedBy(p);
}

/** Realized markup = (price − cost) ÷ cost. */
export function markupRateOf(cost: DecimalInput, price: DecimalInput): Decimal {
  const c = dec(cost, "cost");
  const p = dec(price, "price");
  if (c.isZero()) {
    throw new PricingEngineError("cannot compute a markup rate against a zero cost");
  }
  return p.minus(c).dividedBy(c);
}

/** margin m and markup k describe the same price when k = m ÷ (1 − m). */
export function marginToMarkup(marginRate: DecimalInput): Decimal {
  const m = dec(marginRate, "margin rate");
  if (m.greaterThanOrEqualTo(1)) {
    throw new PricingEngineError(`margin rate must be < 1, got ${m.toString()}`);
  }
  return m.dividedBy(ONE.minus(m));
}

/** margin m and markup k describe the same price when m = k ÷ (1 + k). */
export function markupToMargin(markupRate: DecimalInput): Decimal {
  const k = dec(markupRate, "markup rate");
  if (k.lessThanOrEqualTo(-1)) {
    throw new PricingEngineError(`markup rate must be > -1, got ${k.toString()}`);
  }
  return k.dividedBy(ONE.plus(k));
}
