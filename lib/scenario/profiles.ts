import type { MarginBasis } from "@/lib/pricing-engine";
import type { ScenarioAssumptions } from "./assumptions";

/**
 * Reusable customer profiles (PRD §46–47): retailer and distributor
 * economics captured once and applied to any SKU as the "customer" layer of
 * the §45 priority resolution. Empty fields simply do not participate.
 */

export interface DistributorProfile {
  id: string;
  name: string;
  marginBasis: MarginBasis;
  /** Decimal fraction, e.g. "0.15". */
  marginRate: string;
  handlingFeePerUnit: string;
  notes: string;
}

export interface RetailerProfile {
  id: string;
  name: string;
  channel: string;
  /**
   * §47 default relationship: which distributor this retailer usually buys
   * through. Empty string = direct (no distributor).
   */
  defaultDistributorProfileId: string;
  retailerMarginBasis: MarginBasis;
  /** Decimal fraction, e.g. "0.48". */
  retailerMarginRate: string;
  brokerRate: string;
  deductionsRate: string;
  /** Optional manual trade-spend plan rate for this customer. */
  tradeSpendRate: string;
  paymentTerms: string;
  notes: string;
}

/** Assumption values a retailer profile contributes (customer scope). */
export function retailerProfileValues(profile: RetailerProfile): Partial<ScenarioAssumptions> {
  const values: Partial<ScenarioAssumptions> = {
    retailerMarginBasis: profile.retailerMarginBasis,
    retailerMarginRate: profile.retailerMarginRate,
  };
  if (profile.brokerRate.trim() !== "") values.brokerRate = profile.brokerRate;
  if (profile.deductionsRate.trim() !== "") values.deductionsRate = profile.deductionsRate;
  if (profile.tradeSpendRate.trim() !== "") {
    values.tradeSpendMode = "manual";
    values.tradeSpendRate = profile.tradeSpendRate;
  }
  return values;
}

/** Assumption values a distributor profile contributes (customer scope). */
export function distributorProfileValues(
  profile: DistributorProfile | null,
): Partial<ScenarioAssumptions> {
  if (profile === null) {
    // Direct relationship: the distributor leg switches off (PRD §47).
    return { useDistributor: false };
  }
  return {
    useDistributor: true,
    distributorMarginBasis: profile.marginBasis,
    distributorMarginRate: profile.marginRate,
    distributorHandlingFeePerUnit: profile.handlingFeePerUnit,
  };
}
