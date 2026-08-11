import type { TradeSpendBand } from "@/lib/pricing-engine";
import type { ProductSetup } from "@/lib/scenario/product";
import type { DistributorProfile, RetailerProfile } from "@/lib/scenario/profiles";
import type { Scenario } from "@/lib/scenario/scenarios";

/**
 * Thin persistence boundary (locked decision: local MVP on localStorage,
 * swappable for Supabase/Postgres later without touching the engine or UI).
 * The interface is Promise-based so a remote backend drops in unchanged;
 * everything above it talks to `repository` only.
 */

/** §44 status thresholds — configurable data, decimal-fraction strings. */
export interface PortfolioSettings {
  /** Red when contribution margin falls below this rate (default "0"). */
  redContributionBelow: string;
  /** Green needs CM ≥ target − this tolerance (default "0"). */
  greenTargetTolerance: string;
}

export interface PersistedState {
  version: 1;
  products: ProductSetup[];
  scenarios: Scenario[];
  tradeSpendBands: TradeSpendBand[];
  retailerProfiles: RetailerProfile[];
  distributorProfiles: DistributorProfile[];
  portfolioSettings: PortfolioSettings;
  ui: {
    activeProductId?: string;
    /** Active scenario per product id. */
    activeScenarioIdByProduct?: Record<string, string>;
  };
}

export const DEFAULT_PORTFOLIO_SETTINGS: PortfolioSettings = {
  redContributionBelow: "0",
  greenTargetTolerance: "0",
};

export interface AkifRepository {
  /** Null when nothing was persisted yet (first run) or the data is unreadable. */
  loadState(): Promise<PersistedState | null>;
  saveProducts(products: ProductSetup[]): Promise<void>;
  saveScenarios(scenarios: Scenario[]): Promise<void>;
  saveTradeSpendBands(bands: readonly TradeSpendBand[]): Promise<void>;
  saveRetailerProfiles(profiles: RetailerProfile[]): Promise<void>;
  saveDistributorProfiles(profiles: DistributorProfile[]): Promise<void>;
  savePortfolioSettings(settings: PortfolioSettings): Promise<void>;
  saveUiState(ui: PersistedState["ui"]): Promise<void>;
}
