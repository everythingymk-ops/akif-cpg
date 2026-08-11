import type Decimal from "decimal.js";
import { dec, roundMoney } from "@/lib/pricing-engine";

/** Display-only formatting helpers (rounding happens only at this boundary). */

export function formatMoney(value: Decimal, currency = "$"): string {
  const rounded = roundMoney(value);
  const sign = rounded.isNegative() ? "−" : "";
  return `${sign}${currency}${rounded.abs().toFixed(2)}`;
}

/** 0.0948 → "9.48%" (rate stored as decimal fraction, PRD §61). */
export function formatPercent(value: Decimal, decimalPlaces = 1): string {
  return `${value.times(100).toDecimalPlaces(decimalPlaces).toString()}%`;
}

/** Percentage points with sign: 0.059 → "+5.9 pp". */
export function formatPercentPoints(value: Decimal, decimalPlaces = 1): string {
  const points = value.times(100).toDecimalPlaces(decimalPlaces);
  return `${points.isNegative() ? "−" : "+"}${points.abs().toString()} pp`;
}

/** Whole-dollar display with thousands separators: 114800 → "$114,800". */
export function formatMoneyWhole(value: Decimal, currency = "$"): string {
  const rounded = roundMoney(value, 0);
  const sign = rounded.isNegative() ? "−" : "";
  const digits = rounded.abs().toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${currency}${digits}`;
}

/** Compact numeric string for trace values (up to 6 dp, trimmed). */
export function formatNumber(value: Decimal, decimalPlaces = 6): string {
  return value.toDecimalPlaces(decimalPlaces).toString();
}

/** Parse for display without throwing — returns null for invalid/empty input. */
export function tryDec(value: string): Decimal | null {
  try {
    return dec(value);
  } catch {
    return null;
  }
}

/** Decimal-fraction rate string → percentage-points string for inputs ("0.15" → "15"). */
export function rateToPointsString(rate: string): string {
  try {
    return dec(rate).times(100).toString();
  } catch {
    return rate;
  }
}

/** Percentage-points input string → decimal-fraction rate string ("15" → "0.15"). */
export function pointsToRateString(points: string): string {
  try {
    return dec(points).dividedBy(100).toString();
  } catch {
    return points;
  }
}
