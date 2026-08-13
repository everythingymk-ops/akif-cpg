import { GODIVA_LOGO_DATA_URL } from "./godivaLogo";
import { assumptionsForProduct, type ProductSetup } from "./product";
import type { DistributorProfile, RetailerProfile } from "./profiles";
import { createScenario, type Scenario } from "./scenarios";

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

// ── Example product: Godiva Sticks ──────────────────────────────────────────

/** Bump the suffix only to deliberately re-deliver a changed bundle. */
export const EXAMPLE_GODIVA_SEED = "example-godiva-product-v1";

/**
 * Second example product — an imported premium confection, deliberately
 * unlike the demo supplement: detailed COGS instead of a single number, a
 * three-promotion calendar, and a shelf price that sits *below* what the
 * target contribution needs. That last part is the teaching value: the model
 * opens with a real gap, so the Advisor, the pricing gap and "Improve
 * economics" all have something to say from the first screen.
 *
 * These are the exact inputs behind
 * `docs/Akif-CPG-Ornek-Rehber-Godiva-Sticks.pdf`; changing a number here
 * silently invalidates every figure in that guide (re-shoot the screenshots
 * and rebuild it with docs/make-example-guide.py).
 *
 * The cost, margin and promotion values are representative planning
 * assumptions for a product of this type — not Godiva's real economics.
 */
export const GODIVA_PRODUCT: ProductSetup = {
  id: "example-godiva-sticks",
  basics: {
    name: "Godiva Sticks (example)",
    sku: "GDV-STK-08",
    brand: "Godiva",
    category: "Confectionery",
    subcategory: "Premium chocolate",
    unitSize: "88 g",
    countPerUnit: "8 sticks",
    casePack: "12",
    countryOfManufacture: "Türkiye",
    currency: "USD",
    targetMarket: "United States",
    targetRetailer: "Target",
  },
  structure: "contractManufacturerBrand",
  route: "B",
  cogsMode: "detailed",
  simpleCogsPerUnit: "1.48",
  // Sums to $1.48: material 0.80, packaging 0.34, manufacturing 0.34.
  cogsComponents: [
    { name: "Chocolate & cocoa mass", category: "formula", amountPerUnit: "0.62" },
    { name: "Filling & flavours", category: "formula", amountPerUnit: "0.18" },
    { name: "Box, film, tray", category: "packaging", amountPerUnit: "0.34" },
    { name: "Conversion & labour", category: "manufacturing", amountPerUnit: "0.26" },
    { name: "QC, waste, other", category: "manufacturing", amountPerUnit: "0.08" },
  ],
  logoDataUrl: GODIVA_LOGO_DATA_URL,
  assumptionOverrides: {
    manufacturerMarginBasis: "margin",
    manufacturerMarginRate: "0.22",

    // Türkiye → US: ocean freight, US chocolate-confectionery duty on the
    // customs value, then domestic delivery.
    internationalFreightPerUnit: "0.08",
    tariffRate: "0.056",
    domesticFreightPerUnit: "0.11",

    brokerRate: "0.03",
    deductionsRate: "0.015",

    distributorMarginBasis: "margin",
    distributorMarginRate: "0.15",
    distributorHandlingFeePerUnit: "0.04",

    retailerMarginBasis: "margin",
    retailerMarginRate: "0.40",

    // Calendar mode: seasonal confection leans on a few heavy weeks.
    tradeSpendMode: "calendar",
    tradeSpendRate: "0.0712",
    additionalReserveRate: "0.02",
    annualWeeks: "52",
    promotions: [
      {
        id: "godiva-valentines",
        name: "Valentine's feature & display",
        type: "featureAndDisplay",
        weeks: "3",
        discountRate: "0.30",
        brandFundingRate: "1",
        salesLift: "3.0",
      },
      {
        id: "godiva-holiday",
        name: "Holiday off-invoice",
        type: "offInvoice",
        weeks: "5",
        discountRate: "0.15",
        brandFundingRate: "1",
        salesLift: "1.6",
      },
      {
        id: "godiva-summer",
        name: "Summer TPR",
        type: "tpr",
        weeks: "4",
        discountRate: "0.20",
        brandFundingRate: "0.5",
        salesLift: "1.4",
      },
    ],

    targetContributionRate: "0.22",
    currentSrpPerUnit: "5.99",
    targetSrpPerUnit: "6.49",
  },
};

/** Deterministic so the seed is identical on every machine and SSR-safe. */
export const GODIVA_SCENARIO: Scenario = createScenario(
  "example-godiva-base",
  GODIVA_PRODUCT.id,
  "Base",
  assumptionsForProduct(GODIVA_PRODUCT),
  "2026-08-13T00:00:00.000Z",
);

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
