import { DEFAULT_TRADE_SPEND_BANDS } from "@/lib/pricing-engine";
import { DEFAULT_PORTFOLIO_SETTINGS, type AkifRepository, type PersistedState } from "./types";

/**
 * localStorage-backed repository (MVP). One namespaced key holds the whole
 * workspace as JSON; partial saves read-modify-write the blob. A future
 * Supabase implementation maps each save* method to its own table.
 */

const STORAGE_KEY = "akif-cpg/workspace/v1";

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    // Storage can be blocked (privacy mode); the app then runs in-memory only.
    return null;
  }
}

function emptyState(): PersistedState {
  return {
    version: 1,
    products: [],
    scenarios: [],
    tradeSpendBands: [...DEFAULT_TRADE_SPEND_BANDS],
    retailerProfiles: [],
    distributorProfiles: [],
    portfolioSettings: { ...DEFAULT_PORTFOLIO_SETTINGS },
    appliedSeeds: [],
    ui: {},
  };
}

function readState(storage: Storage): PersistedState | null {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as { version?: unknown }).version !== 1 ||
      !Array.isArray((parsed as { products?: unknown }).products) ||
      !Array.isArray((parsed as { scenarios?: unknown }).scenarios)
    ) {
      return null;
    }
    const state = parsed as PersistedState;
    return {
      ...emptyState(),
      ...state,
      tradeSpendBands: Array.isArray(state.tradeSpendBands)
        ? state.tradeSpendBands
        : [...DEFAULT_TRADE_SPEND_BANDS],
      retailerProfiles: Array.isArray(state.retailerProfiles) ? state.retailerProfiles : [],
      distributorProfiles: Array.isArray(state.distributorProfiles)
        ? state.distributorProfiles
        : [],
      portfolioSettings:
        typeof state.portfolioSettings === "object" && state.portfolioSettings !== null
          ? { ...DEFAULT_PORTFOLIO_SETTINGS, ...state.portfolioSettings }
          : { ...DEFAULT_PORTFOLIO_SETTINGS },
      // Absent in blobs written before example bundles existed: an empty list
      // means "no bundle delivered yet", which is exactly right for them.
      appliedSeeds: Array.isArray(state.appliedSeeds) ? state.appliedSeeds : [],
      ui: typeof state.ui === "object" && state.ui !== null ? state.ui : {},
    };
  } catch {
    // Corrupted JSON: treat as first run rather than crashing the app.
    return null;
  }
}

function writePatch(patch: Partial<PersistedState>): void {
  const storage = getStorage();
  if (!storage) return;
  const current = readState(storage) ?? emptyState();
  storage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...patch }));
}

export class LocalStorageRepository implements AkifRepository {
  async loadState(): Promise<PersistedState | null> {
    const storage = getStorage();
    if (!storage) return null;
    return readState(storage);
  }

  async saveProducts(products: PersistedState["products"]): Promise<void> {
    writePatch({ products });
  }

  async saveScenarios(scenarios: PersistedState["scenarios"]): Promise<void> {
    writePatch({ scenarios });
  }

  async saveTradeSpendBands(bands: PersistedState["tradeSpendBands"]): Promise<void> {
    writePatch({ tradeSpendBands: [...bands] });
  }

  async saveRetailerProfiles(profiles: PersistedState["retailerProfiles"]): Promise<void> {
    writePatch({ retailerProfiles: profiles });
  }

  async saveDistributorProfiles(profiles: PersistedState["distributorProfiles"]): Promise<void> {
    writePatch({ distributorProfiles: profiles });
  }

  async savePortfolioSettings(settings: PersistedState["portfolioSettings"]): Promise<void> {
    writePatch({ portfolioSettings: settings });
  }

  async saveAppliedSeeds(seedIds: string[]): Promise<void> {
    writePatch({ appliedSeeds: seedIds });
  }

  async saveUiState(ui: PersistedState["ui"]): Promise<void> {
    writePatch({ ui });
  }
}
