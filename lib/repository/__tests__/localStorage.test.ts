import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_TRADE_SPEND_BANDS } from "@/lib/pricing-engine";
import { DEMO_ASSUMPTIONS } from "@/lib/scenario/assumptions";
import { DEMO_PRODUCT } from "@/lib/scenario/product";
import { createScenario } from "@/lib/scenario/scenarios";
import { LocalStorageRepository } from "../localStorage";

/** Minimal in-memory Storage stub — vitest runs in node without a DOM. */
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }
  get length(): number {
    return this.store.size;
  }
}

const globals = globalThis as { window?: unknown };

beforeEach(() => {
  const storage = new MemoryStorage();
  globals.window = { localStorage: storage };
});

afterEach(() => {
  delete globals.window;
});

describe("LocalStorageRepository", () => {
  it("returns null on first run", async () => {
    const repo = new LocalStorageRepository();
    expect(await repo.loadState()).toBeNull();
  });

  it("round-trips products, scenarios, bands and ui state", async () => {
    const repo = new LocalStorageRepository();
    const scenario = createScenario("s1", DEMO_PRODUCT.id, "Base", DEMO_ASSUMPTIONS, "2026-08-11T10:00:00.000Z");

    await repo.saveProducts([DEMO_PRODUCT]);
    await repo.saveScenarios([scenario]);
    await repo.saveTradeSpendBands([{ ...DEFAULT_TRADE_SPEND_BANDS[0], label: "Edited" }]);
    await repo.saveUiState({
      activeProductId: DEMO_PRODUCT.id,
      activeScenarioIdByProduct: { [DEMO_PRODUCT.id]: "s1" },
    });

    const state = await repo.loadState();
    expect(state?.version).toBe(1);
    expect(state?.products).toHaveLength(1);
    expect(state?.products[0].basics.name).toBe(DEMO_PRODUCT.basics.name);
    expect(state?.scenarios[0].name).toBe("Base");
    expect(state?.scenarios[0].assumptions.cogsPerUnit).toBe("3.65");
    expect(state?.tradeSpendBands[0].label).toBe("Edited");
    expect(state?.ui.activeScenarioIdByProduct?.[DEMO_PRODUCT.id]).toBe("s1");
  });

  it("partial saves preserve the other collections", async () => {
    const repo = new LocalStorageRepository();
    await repo.saveProducts([DEMO_PRODUCT]);
    await repo.saveUiState({ activeProductId: DEMO_PRODUCT.id });
    const state = await repo.loadState();
    expect(state?.products).toHaveLength(1);
    expect(state?.ui.activeProductId).toBe(DEMO_PRODUCT.id);
  });

  it("treats corrupted JSON as first run instead of crashing", async () => {
    const repo = new LocalStorageRepository();
    (globals.window as { localStorage: Storage }).localStorage.setItem(
      "akif-cpg/workspace/v1",
      "{not json",
    );
    expect(await repo.loadState()).toBeNull();
  });

  it("rejects unknown versions", async () => {
    const repo = new LocalStorageRepository();
    (globals.window as { localStorage: Storage }).localStorage.setItem(
      "akif-cpg/workspace/v1",
      JSON.stringify({ version: 99, products: [], scenarios: [] }),
    );
    expect(await repo.loadState()).toBeNull();
  });

  it("is a no-op without a window (SSR safety)", async () => {
    delete globals.window;
    const repo = new LocalStorageRepository();
    expect(await repo.loadState()).toBeNull();
    await expect(repo.saveProducts([DEMO_PRODUCT])).resolves.toBeUndefined();
  });
});
