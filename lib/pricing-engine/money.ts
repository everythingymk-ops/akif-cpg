import Decimal from "decimal.js";
import { PricingEngineError, type DecimalInput } from "./types";

/**
 * Engine-local Decimal constructor, isolated from any global Decimal.js
 * configuration: 40 significant digits, ROUND_HALF_UP.
 */
export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export const ZERO = new D(0);
export const ONE = new D(1);

/** Convert any accepted input to a Decimal, rejecting non-finite values. */
export function dec(value: DecimalInput, label = "value"): Decimal {
  let out: Decimal;
  try {
    out = new D(value);
  } catch {
    throw new PricingEngineError(`${label} is not a valid number: ${String(value)}`);
  }
  if (!out.isFinite()) {
    throw new PricingEngineError(`${label} must be a finite number, got ${out.toString()}`);
  }
  return out;
}

/** dec() that additionally requires the value to be ≥ 0. */
export function decNonNegative(value: DecimalInput, label: string): Decimal {
  const out = dec(value, label);
  if (out.lessThan(0)) {
    throw new PricingEngineError(`${label} must be ≥ 0, got ${out.toString()}`);
  }
  return out;
}

/** dec() that additionally requires the value to be > 0. */
export function decPositive(value: DecimalInput, label: string): Decimal {
  const out = dec(value, label);
  if (out.lessThanOrEqualTo(0)) {
    throw new PricingEngineError(`${label} must be > 0, got ${out.toString()}`);
  }
  return out;
}

/**
 * Round to currency precision (default 2 dp, half-up). Display boundary only —
 * calculation chains always continue from unrounded values.
 */
export function roundMoney(value: DecimalInput, decimalPlaces = 2): Decimal {
  return dec(value).toDecimalPlaces(decimalPlaces, Decimal.ROUND_HALF_UP);
}

/** Round a decimal-fraction rate (default 4 dp: 0.0948 ↔ 9.48%). */
export function roundRate(value: DecimalInput, decimalPlaces = 4): Decimal {
  return dec(value).toDecimalPlaces(decimalPlaces, Decimal.ROUND_HALF_UP);
}

/** Short display string for trace/formula text (default 4 dp, trimmed). */
export function fmt(value: DecimalInput, decimalPlaces = 4): string {
  return dec(value).toDecimalPlaces(decimalPlaces, Decimal.ROUND_HALF_UP).toString();
}
