import { DEFAULT_TRADE_SPEND_BANDS } from "@/lib/pricing-engine";
import type { AkifRepository, PersistedState } from "./types";

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

  async saveUiState(ui: PersistedState["ui"]): Promise<void> {
    writePatch({ ui });
  }
}
