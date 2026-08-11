import type { ScenarioAssumptions } from "./assumptions";

/**
 * Assumption priority resolution (PRD §45): a value can be set globally, per
 * SKU, per customer, or per SKU+customer — the most specific layer wins:
 *
 *   SKU + Customer  >  Customer  >  SKU  >  Global default
 *
 * The resolver is pure: it merges layers over a base assumption set and
 * reports, per field, which scope supplied the winning value.
 */

export type AssumptionScope = "global" | "sku" | "customer" | "skuCustomer";

export const SCOPE_PRIORITY: Record<AssumptionScope, number> = {
  global: 0,
  sku: 1,
  customer: 2,
  skuCustomer: 3,
};

export const SCOPE_LABELS: Record<AssumptionScope, string> = {
  global: "Global default",
  sku: "SKU specific",
  customer: "Customer specific",
  skuCustomer: "SKU + customer",
};

export interface AssumptionLayer {
  scope: AssumptionScope;
  /** Only defined, non-empty values participate in resolution. */
  values: Partial<ScenarioAssumptions>;
}

export interface ResolvedAssumptions {
  assumptions: ScenarioAssumptions;
  /** Winning scope per overridden field (fields untouched stay unlisted). */
  provenance: Partial<Record<keyof ScenarioAssumptions, AssumptionScope>>;
}

function isMeaningful(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  return true;
}

/**
 * Merge layers over the base, lowest priority first, so the most specific
 * scope ends up on top (PRD §45). Equal-priority layers apply in input order
 * (later wins), which lets a retailer profile and its distributor profile
 * both contribute at "customer" priority.
 */
export function resolveAssumptions(
  base: ScenarioAssumptions,
  layers: AssumptionLayer[],
): ResolvedAssumptions {
  const ordered = [...layers].sort((a, b) => SCOPE_PRIORITY[a.scope] - SCOPE_PRIORITY[b.scope]);
  const assumptions: ScenarioAssumptions = { ...base };
  const provenance: ResolvedAssumptions["provenance"] = {};

  for (const layer of ordered) {
    for (const [key, value] of Object.entries(layer.values) as [
      keyof ScenarioAssumptions,
      ScenarioAssumptions[keyof ScenarioAssumptions],
    ][]) {
      if (!isMeaningful(value)) continue;
      (assumptions as unknown as Record<string, unknown>)[key] = value;
      provenance[key] = layer.scope;
    }
  }

  return { assumptions, provenance };
}
