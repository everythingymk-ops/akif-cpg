import type { DistributorProfile, RetailerProfile } from "./profiles";

/**
 * Example data bundles shipped with the app (PRD §99 in spirit): realistic
 * starting points a new user can price against immediately, and a live
 * demonstration of the §46–47 customer-profile layer.
 *
 * Delivery rule: each bundle carries a stable id recorded in
 * `PersistedState.appliedSeeds` once it has been handed to a workspace. That
 * makes delivery **exactly once** — existing workspaces receive it on the next
 * load, and a bundle the user deletes never comes back.
 *
 * Every figure below is a representative planning assumption, not a real
 * trade term of the named retailer or distributor; the `notes` field of each
 * record says so, and every name carries an "(example)" suffix.
 */

/** Bump the suffix only to deliberately re-deliver a changed bundle. */
export const EXAMPLE_PROFILES_SEED = "example-profiles-v1";

export const EXAMPLE_DISTRIBUTOR_PROFILES: readonly DistributorProfile[] = [
  {
    id: "example-dist-unfi",
    name: "UNFI (example)",
    marginBasis: "margin",
    marginRate: "0.18",
    handlingFeePerUnit: "0.10",
    notes:
      "Broadline natural & conventional distributor. Example profile — representative planning terms, not actual UNFI terms.",
  },
  {
    id: "example-dist-kehe",
    name: "KeHE (example)",
    marginBasis: "margin",
    marginRate: "0.17",
    handlingFeePerUnit: "0.08",
    notes:
      "Natural & specialty broadline distributor. Example profile — representative planning terms, not actual KeHE terms.",
  },
  {
    id: "example-dist-dsd",
    name: "Regional DSD Partner (example)",
    marginBasis: "margin",
    marginRate: "0.25",
    handlingFeePerUnit: "0.15",
    notes:
      "Direct-store-delivery partner: the higher margin covers route service and in-store merchandising. Example profile — representative planning terms.",
  },
];

export const EXAMPLE_RETAILER_PROFILES: readonly RetailerProfile[] = [
  {
    id: "example-retailer-target",
    name: "Target (example)",
    channel: "Mass",
    defaultDistributorProfileId: "",
    retailerMarginBasis: "margin",
    retailerMarginRate: "0.40",
    brokerRate: "0.03",
    deductionsRate: "0.015",
    tradeSpendRate: "",
    paymentTerms: "Net 60",
    notes:
      "Buys direct — no distributor leg. Example profile — representative planning terms, not actual Target terms.",
  },
  {
    id: "example-retailer-walmart",
    name: "Walmart (example)",
    channel: "Mass / EDLP",
    defaultDistributorProfileId: "",
    retailerMarginBasis: "margin",
    retailerMarginRate: "0.32",
    brokerRate: "0.02",
    deductionsRate: "0.02",
    tradeSpendRate: "0.05",
    paymentTerms: "Net 90",
    notes:
      "Everyday-low-price: thinner retail margin, light promotional calendar. Heads up — this profile carries a trade-spend rate, so selecting it switches trade spend to a manual 5% plan and replaces the promotional calendar. Example profile — representative planning terms, not actual Walmart terms.",
  },
  {
    id: "example-retailer-costco",
    name: "Costco (example)",
    channel: "Club",
    defaultDistributorProfileId: "",
    retailerMarginBasis: "margin",
    retailerMarginRate: "0.14",
    brokerRate: "0.02",
    deductionsRate: "0.01",
    tradeSpendRate: "",
    paymentTerms: "Net 30",
    notes:
      "Club: very thin retail margin on club-pack sizes, carried by volume. Example profile — representative planning terms, not actual Costco terms.",
  },
  {
    id: "example-retailer-wholefoods",
    name: "Whole Foods Market (example)",
    channel: "Natural",
    defaultDistributorProfileId: "example-dist-unfi",
    retailerMarginBasis: "margin",
    retailerMarginRate: "0.44",
    brokerRate: "0.05",
    deductionsRate: "0.03",
    tradeSpendRate: "",
    paymentTerms: "Net 30",
    notes:
      "Natural channel, typically supplied through a broadline distributor — selecting it brings the UNFI profile with it. Example profile — representative planning terms, not actual Whole Foods Market terms.",
  },
  {
    id: "example-retailer-sprouts",
    name: "Sprouts (example)",
    channel: "Natural",
    defaultDistributorProfileId: "example-dist-kehe",
    retailerMarginBasis: "margin",
    retailerMarginRate: "0.42",
    brokerRate: "0.05",
    deductionsRate: "0.025",
    tradeSpendRate: "",
    paymentTerms: "Net 45",
    notes:
      "Natural channel via a specialty distributor. Example profile — representative planning terms, not actual Sprouts terms.",
  },
];

/**
 * Append the seed records whose ids are missing, in bundle order, leaving
 * every existing record untouched. Id collisions keep the user's version:
 * their edits always win over shipped data.
 */
export function mergeSeedRecords<T extends { id: string }>(
  existing: readonly T[],
  seeds: readonly T[],
): T[] {
  const taken = new Set(existing.map((record) => record.id));
  return [...existing, ...seeds.filter((seed) => !taken.has(seed.id))];
}

/** True when this bundle has not been delivered to the workspace yet. */
export function needsSeed(appliedSeeds: readonly string[] | undefined, seedId: string): boolean {
  return !(appliedSeeds ?? []).includes(seedId);
}
