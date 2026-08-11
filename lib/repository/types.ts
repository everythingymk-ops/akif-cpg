import type { TradeSpendBand } from "@/lib/pricing-engine";
import type { ProductSetup } from "@/lib/scenario/product";
import type { Scenario } from "@/lib/scenario/scenarios";

/**
 * Thin persistence boundary (locked decision: local MVP on localStorage,
 * swappable for Supabase/Postgres later without touching the engine or UI).
 * The interface is Promise-based so a remote backend drops in unchanged;
 * everything above it talks to `repository` only.
 */

export interface PersistedState {
  version: 1;
  products: ProductSetup[];
  scenarios: Scenario[];
  tradeSpendBands: TradeSpendBand[];
  ui: {
    activeProductId?: string;
    /** Active scenario per product id. */
    activeScenarioIdByProduct?: Record<string, string>;
  };
}

export interface AkifRepository {
  /** Null when nothing was persisted yet (first run) or the data is unreadable. */
  loadState(): Promise<PersistedState | null>;
  saveProducts(products: ProductSetup[]): Promise<void>;
  saveScenarios(scenarios: Scenario[]): Promise<void>;
  saveTradeSpendBands(bands: readonly TradeSpendBand[]): Promise<void>;
  saveUiState(ui: PersistedState["ui"]): Promise<void>;
}
