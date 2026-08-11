import { buildDetailedCogs, type CogsComponent } from "@/lib/pricing-engine";
import { DEMO_ASSUMPTIONS, type ScenarioAssumptions } from "./assumptions";

/**
 * Product setup model (roadmap step 6): business structures (PRD §3),
 * onboarding questionnaire (PRD §4), product basics (PRD §5), simple/detailed
 * COGS (PRD §6–7) and channel routes with automatic field visibility
 * (PRD §12, §52). Everything here is pure data + pure functions; persistence
 * arrives in roadmap step 9.
 */

// ── Business structures (PRD §3 A–E) ────────────────────────────────────────

export type BusinessStructure =
  | "contractManufacturerBrand" // A
  | "manufacturerSupplier" // B
  | "verticallyIntegrated" // C
  | "privateLabelManufacturer" // D
  | "directBrand"; // E

export const BUSINESS_STRUCTURES: Record<
  BusinessStructure,
  { code: "A" | "B" | "C" | "D" | "E"; label: string; description: string }
> = {
  contractManufacturerBrand: {
    code: "A",
    label: "Brand using a contract manufacturer",
    description:
      "A manufacturer produces the product and sells finished goods to you; you own freight, trade spend and retail economics.",
  },
  manufacturerSupplier: {
    code: "B",
    label: "Manufacturer selling to independent brands",
    description:
      "You quote finished goods to brand customers and may model their downstream retail economics to sanity-check the quote.",
  },
  verticallyIntegrated: {
    code: "C",
    label: "Vertically integrated manufacturer + brand",
    description:
      "One group manufactures and sells; an internal transfer price separates manufacturer and brand economics.",
  },
  privateLabelManufacturer: {
    code: "D",
    label: "Private label manufacturer",
    description:
      "You produce a retailer-owned item; branded trade spend and broker costs usually do not apply.",
  },
  directBrand: {
    code: "E",
    label: "Brand selling direct to retailer",
    description: "No distributor: COGS → landed cost → your price to the retailer → SRP.",
  },
};

// ── Channel routes (PRD §12 A–E) ────────────────────────────────────────────

export type ChannelRoute = "A" | "B" | "C" | "D" | "E";

export const CHANNEL_ROUTES: Record<
  ChannelRoute,
  { label: string; usesDistributor: boolean; privateLabel: boolean }
> = {
  A: { label: "Brand → Retailer", usesDistributor: false, privateLabel: false },
  B: { label: "Brand → Distributor → Retailer", usesDistributor: true, privateLabel: false },
  C: {
    label: "Manufacturer → Brand → Distributor → Retailer",
    usesDistributor: true,
    privateLabel: false,
  },
  D: { label: "Manufacturer → Retailer (Private Label)", usesDistributor: false, privateLabel: true },
  E: { label: "Manufacturer → Distributor → Retailer", usesDistributor: true, privateLabel: false },
};

/** Which assumption sections the selected route exposes (PRD §12, §52). */
export interface SectionVisibility {
  manufacturing: boolean;
  landedCost: boolean;
  commercial: boolean;
  distributor: boolean;
  retailer: boolean;
  promotions: boolean;
}

export function getSectionVisibility(route: ChannelRoute): SectionVisibility {
  const meta = CHANNEL_ROUTES[route];
  return {
    manufacturing: true,
    landedCost: true,
    retailer: true,
    // The distributor section only exists on distributor routes — the fields
    // disappear automatically on direct routes (PRD §3E, §12).
    distributor: meta.usesDistributor,
    // Private label keeps the sections visible but defaults them to zero
    // (PRD §52: trade spend and broker default 0%, editable).
    commercial: true,
    promotions: true,
  };
}

// ── Onboarding questionnaire (PRD §4) ───────────────────────────────────────

export type CompanyType =
  | "brand"
  | "manufacturer"
  | "manufacturerAndBrand"
  | "privateLabelManufacturer"
  | "importerDistributor"
  | "consultantBroker";

export type ManufacturingSource =
  | "ourselves"
  | "contractManufacturer"
  | "relatedCompany"
  | "bySku";

export type Importer =
  | "manufacturer"
  | "brand"
  | "distributor"
  | "retailer"
  | "notImported"
  | "dependsOnCustomer";

export type SalesMethod =
  | "directToRetailer"
  | "throughDistributor"
  | "privateLabel"
  | "wholesale"
  | "amazon"
  | "dtc"
  | "club"
  | "foodservice";

export type RetailChannel =
  | "grocery"
  | "naturalSpecialty"
  | "drug"
  | "mass"
  | "club"
  | "convenience"
  | "beauty"
  | "ecommerce"
  | "other";

export interface OnboardingAnswers {
  companyType: CompanyType;
  manufacturingSource: ManufacturingSource;
  importer: Importer;
  salesMethods: SalesMethod[];
  retailChannels: RetailChannel[];
}

export interface SetupSuggestion {
  structure: BusinessStructure;
  route: ChannelRoute;
}

/**
 * Heuristic mapping from questionnaire answers to a suggested structure and
 * route. It is a suggestion only — the wizard shows it and the user confirms
 * or changes it; nothing is silently assumed (PRD §3–4).
 */
export function suggestSetup(answers: OnboardingAnswers): SetupSuggestion {
  const sellsThroughDistributor = answers.salesMethods.includes("throughDistributor");
  const sellsPrivateLabel = answers.salesMethods.includes("privateLabel");

  if (
    answers.companyType === "privateLabelManufacturer" ||
    (answers.companyType === "manufacturer" && sellsPrivateLabel)
  ) {
    return { structure: "privateLabelManufacturer", route: "D" };
  }

  if (
    answers.companyType === "manufacturerAndBrand" ||
    answers.manufacturingSource === "ourselves" ||
    answers.manufacturingSource === "relatedCompany"
  ) {
    return {
      structure: "verticallyIntegrated",
      route: sellsThroughDistributor ? "C" : "A",
    };
  }

  if (answers.companyType === "manufacturer") {
    return {
      structure: "manufacturerSupplier",
      route: sellsThroughDistributor ? "E" : "C",
    };
  }

  // Brands, importers and consultants model brand economics.
  if (sellsThroughDistributor) {
    return { structure: "contractManufacturerBrand", route: "B" };
  }
  return { structure: "directBrand", route: "A" };
}

// ── Product basics (PRD §5) ─────────────────────────────────────────────────

export type Currency = "USD" | "EUR" | "GBP" | "TRY" | "CAD";

export interface ProductBasics {
  name: string;
  sku: string;
  brand: string;
  category: string;
  subcategory: string;
  unitSize: string;
  countPerUnit: string;
  casePack: string;
  countryOfManufacture: string;
  currency: Currency;
  targetMarket: string;
  targetRetailer: string;
}

export type CogsMode = "simple" | "detailed";

export interface ProductSetup {
  id: string;
  basics: ProductBasics;
  structure: BusinessStructure;
  route: ChannelRoute;
  cogsMode: CogsMode;
  /** Simple mode (PRD §6): finished COGS per unit. */
  simpleCogsPerUnit: string;
  /** Detailed mode (PRD §7): components summed by the engine. */
  cogsComponents: CogsComponent[];
  onboarding?: OnboardingAnswers;
  /** Assumption overrides captured at creation (SRP targets, rates, …). */
  assumptionOverrides?: Partial<ScenarioAssumptions>;
}

/** Effective COGS/unit for a product, honoring the selected mode (PRD §6–7). */
export function effectiveCogsPerUnit(product: ProductSetup): string {
  if (product.cogsMode === "simple") {
    return product.simpleCogsPerUnit;
  }
  return buildDetailedCogs(product.cogsComponents).totalCogsPerUnit.toString();
}

/**
 * Initial pricing-screen assumptions for a product: route drives the
 * distributor leg, private label zeroes trade spend and broker by default
 * (PRD §52 — editable afterwards like everything else, PRD §97).
 */
export function assumptionsForProduct(product: ProductSetup): ScenarioAssumptions {
  const routeMeta = CHANNEL_ROUTES[product.route];
  const base: ScenarioAssumptions = {
    ...DEMO_ASSUMPTIONS,
    productName: product.basics.name,
    sku: product.basics.sku,
    cogsPerUnit: effectiveCogsPerUnit(product),
    useDistributor: routeMeta.usesDistributor,
    currentSrpPerUnit: "",
    targetSrpPerUnit: "",
  };
  if (routeMeta.privateLabel) {
    base.tradeSpendRate = "0";
    base.additionalReserveRate = "0";
    base.brokerRate = "0";
  }
  return { ...base, ...product.assumptionOverrides };
}

// ── In-memory demo product (roadmap step 5/6; numbers per PRD §99) ─────────

export const DEMO_PRODUCT: ProductSetup = {
  id: "demo-supplement-60",
  basics: {
    name: "Example Supplement 60 Count",
    sku: "DEMO-SUP-60",
    brand: "Akif Labs",
    category: "Supplements",
    subcategory: "Herbal Oils",
    unitSize: "60 count",
    countPerUnit: "60",
    casePack: "12",
    countryOfManufacture: "Türkiye",
    currency: "USD",
    targetMarket: "United States",
    targetRetailer: "",
  },
  structure: "contractManufacturerBrand",
  route: "B",
  cogsMode: "simple",
  simpleCogsPerUnit: "3.65",
  cogsComponents: [],
  assumptionOverrides: {
    currentSrpPerUnit: DEMO_ASSUMPTIONS.currentSrpPerUnit,
    targetSrpPerUnit: DEMO_ASSUMPTIONS.targetSrpPerUnit,
  },
};
