import type Decimal from "decimal.js";
import { dec } from "@/lib/pricing-engine";
import type { PortfolioSettings } from "@/lib/repository/types";

/**
 * §44 portfolio status: Green = commercially healthy, Yellow = review
 * economics, Red = negative / below the configurable threshold. Thresholds
 * are editable data (PortfolioSettings), never hardcoded policy.
 */
export type PortfolioStatus = "green" | "yellow" | "red";

export function portfolioStatus(
  contributionMarginRate: Decimal,
  targetContributionRate: Decimal,
  settings: PortfolioSettings,
): PortfolioStatus {
  const redBelow = dec(settings.redContributionBelow || "0", "redContributionBelow");
  const tolerance = dec(settings.greenTargetTolerance || "0", "greenTargetTolerance");
  if (contributionMarginRate.lessThan(redBelow)) return "red";
  if (contributionMarginRate.greaterThanOrEqualTo(targetContributionRate.minus(tolerance))) {
    return "green";
  }
  return "yellow";
}
