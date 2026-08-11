import type { ScenarioAssumptions } from "./assumptions";
import { formatMoney, formatPercent, tryDec } from "./format";

/**
 * Scenario model (PRD §37, §68, §70): named assumption snapshots per product,
 * with an audit trail of what changed on every save. Pure data + pure
 * functions; persistence goes through the repository, state lives in the
 * providers.
 */

export interface AuditChange {
  field: string;
  label: string;
  /** Preformatted display values — history must not reformat later. */
  from: string;
  to: string;
}

export interface AuditEntry {
  /** ISO timestamp of the save. */
  at: string;
  changes: AuditChange[];
}

export interface Scenario {
  id: string;
  productId: string;
  name: string;
  assumptions: ScenarioAssumptions;
  createdAt: string;
  updatedAt: string;
  history: AuditEntry[];
}

/** Suggested scenario names (PRD §37). */
export const SCENARIO_NAME_PRESETS: readonly string[] = [
  "Base",
  "Conservative",
  "Target",
  "Aggressive Launch",
  "Direct Retail",
  "Distributor",
  "Retailer Request",
  "Broker Proposal",
];

type FieldKind = "money" | "rate" | "text" | "bool";

const FIELD_META: { key: keyof ScenarioAssumptions; label: string; kind: FieldKind }[] = [
  { key: "cogsPerUnit", label: "Manufacturing COGS", kind: "money" },
  { key: "manufacturerMarginBasis", label: "Manufacturer basis", kind: "text" },
  { key: "manufacturerMarginRate", label: "Manufacturer margin", kind: "rate" },
  { key: "internationalFreightPerUnit", label: "International freight", kind: "money" },
  { key: "tariffRate", label: "Tariff", kind: "rate" },
  { key: "domesticFreightPerUnit", label: "Domestic freight", kind: "money" },
  { key: "useDistributor", label: "Distributor route", kind: "bool" },
  { key: "distributorMarginBasis", label: "Distributor basis", kind: "text" },
  { key: "distributorMarginRate", label: "Distributor margin", kind: "rate" },
  { key: "distributorHandlingFeePerUnit", label: "Distributor handling", kind: "money" },
  { key: "retailerMarginBasis", label: "Retailer basis", kind: "text" },
  { key: "retailerMarginRate", label: "Retailer margin", kind: "rate" },
  { key: "brokerRate", label: "Broker", kind: "rate" },
  { key: "deductionsRate", label: "Deductions", kind: "rate" },
  { key: "tradeSpendMode", label: "Trade spend mode", kind: "text" },
  { key: "tradeSpendRate", label: "Trade spend", kind: "rate" },
  { key: "additionalReserveRate", label: "Trade reserve", kind: "rate" },
  { key: "annualWeeks", label: "Planning weeks", kind: "text" },
  { key: "normalWeeklyUnits", label: "Weekly units", kind: "text" },
  { key: "plannerInvoiceReferencePerUnit", label: "Planner invoice reference", kind: "money" },
  { key: "targetContributionRate", label: "Target contribution", kind: "rate" },
  { key: "currentSrpPerUnit", label: "Current SRP", kind: "money" },
  { key: "targetSrpPerUnit", label: "Target SRP", kind: "money" },
];

function formatValue(value: unknown, kind: FieldKind): string {
  if (kind === "bool") return value ? "on" : "off";
  const text = String(value ?? "").trim();
  if (text === "") return "—";
  const parsed = tryDec(text);
  if (kind === "money") return parsed ? formatMoney(parsed) : text;
  if (kind === "rate") return parsed ? formatPercent(parsed, 2) : text;
  return text;
}

/**
 * Field-level assumption diff in §68 display form
 * ("Trade Spend: 10% → 15%"). Promotions are compared as one summarized
 * change; identical assumption sets produce an empty list.
 */
export function diffAssumptions(
  previous: ScenarioAssumptions,
  next: ScenarioAssumptions,
): AuditChange[] {
  const changes: AuditChange[] = [];
  for (const { key, label, kind } of FIELD_META) {
    const before = previous[key];
    const after = next[key];
    if (String(before) !== String(after)) {
      changes.push({
        field: key,
        label,
        from: formatValue(before, kind),
        to: formatValue(after, kind),
      });
    }
  }
  if (JSON.stringify(previous.promotions) !== JSON.stringify(next.promotions)) {
    changes.push({
      field: "promotions",
      label: "Promotional calendar",
      from: `${previous.promotions.length} promotion${previous.promotions.length === 1 ? "" : "s"}`,
      to: `${next.promotions.length} promotion${next.promotions.length === 1 ? "" : "s"}`,
    });
  }
  return changes;
}

/** Assemble a §68 audit entry; null when nothing changed. */
export function buildAuditEntry(
  previous: ScenarioAssumptions,
  next: ScenarioAssumptions,
  at: string,
  outputChanges: AuditChange[] = [],
): AuditEntry | null {
  const changes = [...diffAssumptions(previous, next), ...outputChanges];
  if (changes.length === 0) return null;
  return { at, changes };
}

export function createScenario(
  id: string,
  productId: string,
  name: string,
  assumptions: ScenarioAssumptions,
  at: string,
): Scenario {
  return {
    id,
    productId,
    name,
    assumptions,
    createdAt: at,
    updatedAt: at,
    history: [],
  };
}

/** Save new assumptions into a scenario, appending the audit entry (if any). */
export function applyScenarioSave(
  scenario: Scenario,
  assumptions: ScenarioAssumptions,
  entry: AuditEntry | null,
  at: string,
): Scenario {
  return {
    ...scenario,
    assumptions,
    updatedAt: at,
    history: entry ? [entry, ...scenario.history] : scenario.history,
  };
}
