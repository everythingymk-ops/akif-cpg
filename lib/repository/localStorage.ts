import { DEFAULT_TRADE_SPEND_BANDS, type TradeSpendBand } from "@/lib/pricing-engine";
import type { ProductSetup } from "@/lib/scenario/product";
import type { DistributorProfile, RetailerProfile } from "@/lib/scenario/profiles";
import type { Scenario } from "@/lib/scenario/scenarios";
import {
  DEFAULT_PORTFOLIO_SETTINGS,
  ScenarioConflictError,
  type AkifRepository,
  type PortfolioSettings,
  type UiState,
  type WorkspaceSnapshot,
} from "./types";

/**
 * localStorage-backed repository (MVP). One namespaced key holds the whole
 * workspace as JSON; every write read-modify-writes the blob, replacing just
 * the one record it was given. A future Supabase implementation maps the same
 * methods to single-row upserts and deletes.
 */

const STORAGE_KEY = "akif-cpg/workspace/v1";

/** The stored blob: the snapshot plus a schema version that never leaves this file. */
interface PersistedState extends WorkspaceSnapshot {
  version: 1;
}

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

/** Read one collection, apply `change`, write only that collection back. */
function mutateCollection<K extends keyof PersistedState>(
  key: K,
  change: (current: PersistedState[K]) => PersistedState[K],
): void {
  const storage = getStorage();
  if (!storage) return;
  const current = readState(storage) ?? emptyState();
  writePatch({ [key]: change(current[key]) } as Partial<PersistedState>);
}

/** Replace the record sharing this id, or append it when it is new. */
function upsertById<T extends { id: string }>(collection: T[], record: T): T[] {
  const index = collection.findIndex((existing) => existing.id === record.id);
  if (index === -1) return [...collection, record];
  const next = [...collection];
  next[index] = record;
  return next;
}

export class LocalStorageRepository implements AkifRepository {
  async loadWorkspace(): Promise<WorkspaceSnapshot | null> {
    const storage = getStorage();
    if (!storage) return null;
    const state = readState(storage);
    if (state === null) return null;
    // `version` is a storage detail; the contract above must not carry a field
    // the Supabase implementation has no equivalent for.
    const snapshot: WorkspaceSnapshot = {
      products: state.products,
      scenarios: state.scenarios,
      tradeSpendBands: state.tradeSpendBands,
      retailerProfiles: state.retailerProfiles,
      distributorProfiles: state.distributorProfiles,
      portfolioSettings: state.portfolioSettings,
      appliedSeeds: state.appliedSeeds,
      ui: state.ui,
    };
    return snapshot;
  }

  async upsertProduct(product: ProductSetup): Promise<void> {
    mutateCollection("products", (products) => upsertById(products, product));
  }

  async deleteProduct(id: string): Promise<void> {
    mutateCollection("products", (products) => products.filter((p) => p.id !== id));
  }

  async upsertScenario(
    scenario: Scenario,
    expectedUpdatedAt?: string,
  ): Promise<{ updatedAt: string }> {
    if (expectedUpdatedAt !== undefined) {
      const storage = getStorage();
      const stored = storage
        ? (readState(storage)?.scenarios ?? []).find((s) => s.id === scenario.id)
        : undefined;
      if (stored && stored.updatedAt !== expectedUpdatedAt) throw new ScenarioConflictError();
    }
    mutateCollection("scenarios", (scenarios) => upsertById(scenarios, scenario));
    return { updatedAt: scenario.updatedAt };
  }

  async deleteScenario(id: string): Promise<void> {
    mutateCollection("scenarios", (scenarios) => scenarios.filter((s) => s.id !== id));
  }

  async upsertRetailerProfile(profile: RetailerProfile): Promise<void> {
    mutateCollection("retailerProfiles", (profiles) => upsertById(profiles, profile));
  }

  async deleteRetailerProfile(id: string): Promise<void> {
    mutateCollection("retailerProfiles", (profiles) => profiles.filter((p) => p.id !== id));
  }

  async upsertDistributorProfile(profile: DistributorProfile): Promise<void> {
    mutateCollection("distributorProfiles", (profiles) => upsertById(profiles, profile));
  }

  async deleteDistributorProfile(id: string): Promise<void> {
    mutateCollection("distributorProfiles", (profiles) => profiles.filter((p) => p.id !== id));
  }

  async replaceTradeSpendBands(bands: readonly TradeSpendBand[]): Promise<void> {
    writePatch({ tradeSpendBands: [...bands] });
  }

  async savePortfolioSettings(settings: PortfolioSettings): Promise<void> {
    writePatch({ portfolioSettings: settings });
  }

  async recordAppliedSeed(seedId: string): Promise<void> {
    const storage = getStorage();
    if (!storage) return;
    // Read-modify-write the union so concurrent seeders can't drop each
    // other's flags (writePatch re-reads the blob, so this stays consistent).
    const applied = (readState(storage) ?? emptyState()).appliedSeeds;
    if (applied.includes(seedId)) return;
    writePatch({ appliedSeeds: [...applied, seedId] });
  }

  async saveUiState(ui: UiState): Promise<void> {
    writePatch({ ui });
  }
}
