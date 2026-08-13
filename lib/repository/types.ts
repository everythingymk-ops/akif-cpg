import type { TradeSpendBand } from "@/lib/pricing-engine";
import type { ProductSetup } from "@/lib/scenario/product";
import type { DistributorProfile, RetailerProfile } from "@/lib/scenario/profiles";
import type { Scenario } from "@/lib/scenario/scenarios";

/**
 * Thin persistence boundary (locked decision: local MVP on localStorage,
 * swappable for Supabase/Postgres later without touching the engine or UI).
 * The interface is Promise-based so a remote backend drops in unchanged;
 * everything above it talks to `repository` only.
 *
 * **Writes are per record, never per collection.** An earlier version replaced
 * whole arrays (`saveProducts(allProducts)`), which is data loss the moment two
 * people edit the same workspace: whoever saves last overwrites the other's new
 * product with their own stale list. Every mutation here names the single
 * record it touches, so two editors only collide when they edit the same row.
 */

/** §44 status thresholds — configurable data, decimal-fraction strings. */
export interface PortfolioSettings {
  /** Red when contribution margin falls below this rate (default "0"). */
  redContributionBelow: string;
  /** Green needs CM ≥ target − this tolerance (default "0"). */
  greenTargetTolerance: string;
}

/** Per-person view state — never shared, or one person switching products
 *  would yank the other's screen mid-edit. */
export interface UiState {
  activeProductId?: string;
  /** Active scenario per product id. */
  activeScenarioIdByProduct?: Record<string, string>;
}

/** Everything a session needs on load, in one read. */
export interface WorkspaceSnapshot {
  products: ProductSetup[];
  scenarios: Scenario[];
  tradeSpendBands: TradeSpendBand[];
  retailerProfiles: RetailerProfile[];
  distributorProfiles: DistributorProfile[];
  portfolioSettings: PortfolioSettings;
  /**
   * Ids of the one-time example bundles already delivered to this workspace
   * (`lib/scenario/seeds.ts`). Recorded so a bundle reaches an existing
   * workspace exactly once and never reappears after the user deletes it.
   */
  appliedSeeds: string[];
  ui: UiState;
}

export const DEFAULT_PORTFOLIO_SETTINGS: PortfolioSettings = {
  redContributionBelow: "0",
  greenTargetTolerance: "0",
};

/** Somebody else saved this scenario while it was open here. */
export class ScenarioConflictError extends Error {
  constructor() {
    super("This scenario was changed elsewhere since you opened it.");
    this.name = "ScenarioConflictError";
  }
}

export interface AkifRepository {
  /** Null when nothing was persisted yet (first run) or the data is unreadable. */
  loadWorkspace(): Promise<WorkspaceSnapshot | null>;

  upsertProduct(product: ProductSetup): Promise<void>;
  deleteProduct(id: string): Promise<void>;

  /**
   * Writes a scenario and reports the timestamp it now carries.
   *
   * Pass `expectedUpdatedAt` to make the write conditional: if the stored row
   * has moved on since it was loaded, somebody else saved in the meantime and
   * this throws `ScenarioConflictError` instead of overwriting their work.
   * Omit it to overwrite deliberately.
   *
   * The returned timestamp must be adopted by the caller — the store decides
   * it, and a stale local copy would make the *next* save look like a
   * conflict when it is not.
   */
  upsertScenario(scenario: Scenario, expectedUpdatedAt?: string): Promise<{ updatedAt: string }>;
  deleteScenario(id: string): Promise<void>;

  upsertRetailerProfile(profile: RetailerProfile): Promise<void>;
  deleteRetailerProfile(id: string): Promise<void>;

  upsertDistributorProfile(profile: DistributorProfile): Promise<void>;
  deleteDistributorProfile(id: string): Promise<void>;

  /**
   * Whole-list on purpose: the bands are one small curated set edited together
   * in a single dialog, and two people tuning them at the same moment is not a
   * scenario worth the extra machinery.
   */
  replaceTradeSpendBands(bands: readonly TradeSpendBand[]): Promise<void>;

  /** A two-field singleton. */
  savePortfolioSettings(settings: PortfolioSettings): Promise<void>;

  /**
   * Add one bundle id to the delivered set. Additive on purpose: several
   * providers seed independently on the same load, and a whole-array write
   * would let the last one clobber the others' flags — which would silently
   * re-deliver a bundle the user had deleted. Idempotent.
   */
  recordAppliedSeed(seedId: string): Promise<void>;

  saveUiState(ui: UiState): Promise<void>;
}
