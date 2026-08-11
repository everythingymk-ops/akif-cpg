import type Decimal from "decimal.js";
import { ZERO, dec, fmt } from "./money";
import {
  PricingEngineError,
  type CostLine,
  type CostOwner,
  type CostResolutionContext,
  type ResolvedCostLine,
} from "./types";

/**
 * Cost ownership system (PRD §9): every cost line carries an owner and a
 * calculation basis. This resolver turns any line into a per-unit dollar
 * figure. Percent bases multiply against an explicit reference value from the
 * context — never against an assumed one (PRD §10: tariff basis is
 * user-selectable, never assumed).
 */

const DIVISOR_BASES = {
  perCase: { key: "unitsPerCase", label: "units per case" },
  perShipment: { key: "unitsPerShipment", label: "units per shipment" },
  annual: { key: "annualUnits", label: "annual units" },
} as const;

const PERCENT_BASES = {
  percentOfCogs: { key: "cogsPerUnit", label: "COGS" },
  percentOfInvoice: { key: "invoicePricePerUnit", label: "invoice price" },
  percentOfCustomsValue: { key: "customsValuePerUnit", label: "customs value" },
  percentOfSrp: { key: "srpPerUnit", label: "SRP" },
  percentOfNetSales: { key: "netSalesPerUnit", label: "net sales" },
} as const;

function requireContext(
  line: CostLine,
  context: CostResolutionContext,
  key: keyof CostResolutionContext,
): Decimal {
  const raw = context[key];
  if (raw === undefined || raw === null) {
    throw new PricingEngineError(
      `Cost line "${line.name}" uses basis "${line.basis}" but context.${key} was not provided — ` +
        `pass it explicitly; the engine never assumes a calculation basis value (PRD §9–10)`,
    );
  }
  return dec(raw, `context.${key}`);
}

/** Resolve a single cost line to its per-unit dollar value. */
export function resolveCostLine(
  line: CostLine,
  context: CostResolutionContext = {},
): ResolvedCostLine {
  const amount = dec(line.amount, `cost line "${line.name}" amount`);

  switch (line.basis) {
    case "perUnit":
      return { line, perUnit: amount, detail: `$${fmt(amount)} per unit` };

    case "perCase":
    case "perShipment":
    case "annual": {
      const { key, label } = DIVISOR_BASES[line.basis];
      const divisor = requireContext(line, context, key);
      if (divisor.lessThanOrEqualTo(0)) {
        throw new PricingEngineError(
          `context.${key} must be > 0 to resolve cost line "${line.name}", got ${divisor.toString()}`,
        );
      }
      return {
        line,
        perUnit: amount.dividedBy(divisor),
        detail: `$${fmt(amount)} ÷ ${fmt(divisor, 2)} ${label}`,
      };
    }

    case "percentOfCogs":
    case "percentOfInvoice":
    case "percentOfCustomsValue":
    case "percentOfSrp":
    case "percentOfNetSales": {
      const { key, label } = PERCENT_BASES[line.basis];
      const reference = requireContext(line, context, key);
      return {
        line,
        perUnit: amount.times(reference),
        detail: `${fmt(amount.times(100), 2)}% of ${label} $${fmt(reference)}`,
      };
    }

    default: {
      const exhaustive: never = line.basis;
      throw new PricingEngineError(`Unknown calculation basis: ${String(exhaustive)}`);
    }
  }
}

/** Resolve a set of cost lines and total them per unit. */
export function resolveCostLines(
  lines: CostLine[],
  context: CostResolutionContext = {},
): { resolved: ResolvedCostLine[]; totalPerUnit: Decimal } {
  const resolved = lines.map((line) => resolveCostLine(line, context));
  const totalPerUnit = resolved.reduce((sum, r) => sum.plus(r.perUnit), ZERO);
  return { resolved, totalPerUnit };
}

/** Keep only the lines paid by the given owner(s) (PRD §9). */
export function filterCostLinesByOwner(
  lines: CostLine[],
  owners: CostOwner | CostOwner[],
): CostLine[] {
  const wanted = new Set(Array.isArray(owners) ? owners : [owners]);
  return lines.filter((line) => wanted.has(line.owner));
}
