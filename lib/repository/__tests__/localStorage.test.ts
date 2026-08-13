import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_TRADE_SPEND_BANDS } from "@/lib/pricing-engine";
import { DEMO_ASSUMPTIONS } from "@/lib/scenario/assumptions";
import { DEMO_PRODUCT } from "@/lib/scenario/product";
import type { RetailerProfile } from "@/lib/scenario/profiles";
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

const otherProduct = { ...DEMO_PRODUCT, id: "other-product" };

function retailer(id: string, name: string): RetailerProfile {
  return {
    id,
    name,
    channel: "Mass",
    defaultDistributorProfileId: "",
    retailerMarginBasis: "margin",
    retailerMarginRate: "0.4",
    brokerRate: "",
    deductionsRate: "",
    tradeSpendRate: "",
    paymentTerms: "Net 60",
    notes: "",
  };
}

describe("LocalStorageRepository", () => {
  it("returns null on first run", async () => {
    const repo = new LocalStorageRepository();
    expect(await repo.loadWorkspace()).toBeNull();
  });

  it("round-trips every collection", async () => {
    const repo = new LocalStorageRepository();
    const scenario = createScenario(
      "s1",
      DEMO_PRODUCT.id,
      "Base",
      DEMO_ASSUMPTIONS,
      "2026-08-11T10:00:00.000Z",
    );

    await repo.upsertProduct(DEMO_PRODUCT);
    await repo.upsertScenario(scenario);
    await repo.replaceTradeSpendBands([{ ...DEFAULT_TRADE_SPEND_BANDS[0], label: "Edited" }]);
    await repo.upsertRetailerProfile(retailer("r1", "Target"));
    await repo.savePortfolioSettings({ redContributionBelow: "0.01", greenTargetTolerance: "0" });
    await repo.saveUiState({
      activeProductId: DEMO_PRODUCT.id,
      activeScenarioIdByProduct: { [DEMO_PRODUCT.id]: "s1" },
    });

    const state = await repo.loadWorkspace();
    expect(state?.products).toEqual([DEMO_PRODUCT]);
    expect(state?.scenarios).toEqual([scenario]);
    expect(state?.tradeSpendBands[0].label).toBe("Edited");
    expect(state?.retailerProfiles[0].name).toBe("Target");
    expect(state?.portfolioSettings.redContributionBelow).toBe("0.01");
    expect(state?.ui.activeProductId).toBe(DEMO_PRODUCT.id);
  });

  it("writing one record leaves the other collections alone", async () => {
    const repo = new LocalStorageRepository();
    await repo.upsertProduct(DEMO_PRODUCT);
    await repo.upsertRetailerProfile(retailer("r1", "Target"));

    await repo.saveUiState({ activeProductId: DEMO_PRODUCT.id });

    const state = await repo.loadWorkspace();
    expect(state?.products).toHaveLength(1);
    expect(state?.retailerProfiles).toHaveLength(1);
  });
});

describe("per-record writes", () => {
  it("upsert appends a new record and replaces an existing one by id", async () => {
    const repo = new LocalStorageRepository();
    await repo.upsertProduct(DEMO_PRODUCT);
    await repo.upsertProduct(otherProduct);
    expect((await repo.loadWorkspace())?.products).toHaveLength(2);

    await repo.upsertProduct({
      ...DEMO_PRODUCT,
      basics: { ...DEMO_PRODUCT.basics, name: "Renamed" },
    });

    const products = (await repo.loadWorkspace())?.products ?? [];
    expect(products).toHaveLength(2);
    expect(products.find((p) => p.id === DEMO_PRODUCT.id)?.basics.name).toBe("Renamed");
    expect(products.find((p) => p.id === otherProduct.id)?.basics.name).toBe(
      DEMO_PRODUCT.basics.name,
    );
  });

  it("upsert keeps the record's position, so lists don't reshuffle on every edit", async () => {
    const repo = new LocalStorageRepository();
    await repo.upsertProduct(DEMO_PRODUCT);
    await repo.upsertProduct(otherProduct);

    await repo.upsertProduct({ ...DEMO_PRODUCT, simpleCogsPerUnit: "9.99" });

    expect((await repo.loadWorkspace())?.products.map((p) => p.id)).toEqual([
      DEMO_PRODUCT.id,
      otherProduct.id,
    ]);
  });

  /**
   * The whole point of the interface: this is the write that used to be
   * `saveProducts(myWholeStaleList)` and would have dropped a colleague's
   * product created a second earlier.
   */
  it("a write does not disturb records the writer never knew about", async () => {
    const repo = new LocalStorageRepository();
    await repo.upsertProduct(otherProduct); // arrived from elsewhere

    await repo.upsertProduct(DEMO_PRODUCT); // this session only knows its own

    const products = (await repo.loadWorkspace())?.products ?? [];
    expect(products.map((p) => p.id).sort()).toEqual([DEMO_PRODUCT.id, otherProduct.id].sort());
  });

  it("deletes by id and leaves the rest", async () => {
    const repo = new LocalStorageRepository();
    await repo.upsertProduct(DEMO_PRODUCT);
    await repo.upsertProduct(otherProduct);

    await repo.deleteProduct(DEMO_PRODUCT.id);

    expect((await repo.loadWorkspace())?.products.map((p) => p.id)).toEqual([otherProduct.id]);
  });

  it("deleting something that is already gone is not an error", async () => {
    const repo = new LocalStorageRepository();
    await repo.upsertProduct(DEMO_PRODUCT);
    await expect(repo.deleteProduct("never-existed")).resolves.toBeUndefined();
    expect((await repo.loadWorkspace())?.products).toHaveLength(1);
  });

  it("scenarios and profiles follow the same upsert/delete rules", async () => {
    const repo = new LocalStorageRepository();
    const scenario = createScenario(
      "s1",
      DEMO_PRODUCT.id,
      "Base",
      DEMO_ASSUMPTIONS,
      "2026-08-11T10:00:00.000Z",
    );
    await repo.upsertScenario(scenario);
    await repo.upsertScenario({ ...scenario, id: "s2", name: "Retailer Request" });
    await repo.deleteScenario("s1");
    expect((await repo.loadWorkspace())?.scenarios.map((s) => s.name)).toEqual([
      "Retailer Request",
    ]);

    await repo.upsertRetailerProfile(retailer("r1", "Target"));
    await repo.upsertRetailerProfile(retailer("r2", "Costco"));
    await repo.deleteRetailerProfile("r1");
    expect((await repo.loadWorkspace())?.retailerProfiles.map((p) => p.name)).toEqual(["Costco"]);

    await repo.upsertDistributorProfile({
      id: "d1",
      name: "UNFI",
      marginBasis: "margin",
      marginRate: "0.18",
      handlingFeePerUnit: "0.1",
      notes: "",
    });
    await repo.deleteDistributorProfile("d1");
    expect((await repo.loadWorkspace())?.distributorProfiles).toEqual([]);
  });
});

describe("seed bundles", () => {
  it("round-trips the applied example bundles", async () => {
    const repo = new LocalStorageRepository();
    await repo.upsertProduct(DEMO_PRODUCT);
    await repo.recordAppliedSeed("example-profiles-v1");

    const state = await repo.loadWorkspace();
    expect(state?.appliedSeeds).toEqual(["example-profiles-v1"]);
    expect(state?.products).toHaveLength(1);
  });

  it("accumulates seed ids instead of replacing them, and is idempotent", async () => {
    const repo = new LocalStorageRepository();
    // Two providers seeding on the same load must not drop each other's flag;
    // losing one would silently re-deliver a bundle the user deleted.
    await repo.recordAppliedSeed("example-profiles-v1");
    await repo.recordAppliedSeed("example-godiva-product-v1");
    await repo.recordAppliedSeed("example-profiles-v1");

    expect((await repo.loadWorkspace())?.appliedSeeds).toEqual([
      "example-profiles-v1",
      "example-godiva-product-v1",
    ]);
  });
});

describe("reading blobs written by older versions", () => {
  const write = (value: unknown) =>
    (globals.window as { localStorage: Storage }).localStorage.setItem(
      "akif-cpg/workspace/v1",
      JSON.stringify(value),
    );

  it("normalizes missing profile fields to defaults", async () => {
    const repo = new LocalStorageRepository();
    write({ version: 1, products: [DEMO_PRODUCT], scenarios: [] });
    const state = await repo.loadWorkspace();
    expect(state?.retailerProfiles).toEqual([]);
    expect(state?.distributorProfiles).toEqual([]);
    expect(state?.portfolioSettings.redContributionBelow).toBe("0");
  });

  it("treats a blob without appliedSeeds as 'no bundle delivered'", async () => {
    const repo = new LocalStorageRepository();
    write({ version: 1, products: [DEMO_PRODUCT], scenarios: [] });
    expect((await repo.loadWorkspace())?.appliedSeeds).toEqual([]);
  });

  it("loads a product that predates logoDataUrl with it undefined", async () => {
    const repo = new LocalStorageRepository();
    const legacyProduct = { ...DEMO_PRODUCT } as Record<string, unknown>;
    delete legacyProduct.logoDataUrl;
    write({ version: 1, products: [legacyProduct], scenarios: [] });

    const state = await repo.loadWorkspace();
    expect(state?.products[0].logoDataUrl).toBeUndefined();
    expect(state?.products[0].basics.name).toBe(DEMO_PRODUCT.basics.name);
  });

  it("round-trips a product logo data URL", async () => {
    const repo = new LocalStorageRepository();
    await repo.upsertProduct({ ...DEMO_PRODUCT, logoDataUrl: "data:image/png;base64,AAAA" });
    expect((await repo.loadWorkspace())?.products[0].logoDataUrl).toBe(
      "data:image/png;base64,AAAA",
    );
  });

  it("treats corrupted JSON as first run instead of crashing", async () => {
    const repo = new LocalStorageRepository();
    (globals.window as { localStorage: Storage }).localStorage.setItem(
      "akif-cpg/workspace/v1",
      "{not json",
    );
    expect(await repo.loadWorkspace()).toBeNull();
  });

  it("rejects unknown versions", async () => {
    const repo = new LocalStorageRepository();
    write({ version: 99, products: [], scenarios: [] });
    expect(await repo.loadWorkspace()).toBeNull();
  });

  it("never leaks the storage version into the snapshot", async () => {
    const repo = new LocalStorageRepository();
    await repo.upsertProduct(DEMO_PRODUCT);
    // `version` is a localStorage concern; the contract above it must not
    // carry a field Supabase has no equivalent for.
    expect(await repo.loadWorkspace()).not.toHaveProperty("version");
  });
});

describe("environment failures", () => {
  it("is a no-op without a window (SSR safety)", async () => {
    delete globals.window;
    const repo = new LocalStorageRepository();
    expect(await repo.loadWorkspace()).toBeNull();
    await expect(repo.upsertProduct(DEMO_PRODUCT)).resolves.toBeUndefined();
  });

  it("upsertProduct rejects when the storage write throws (quota)", async () => {
    const repo = new LocalStorageRepository();
    const storage = (globals.window as { localStorage: MemoryStorage }).localStorage;
    storage.setItem = () => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    };
    // The rejection is what makes updateProduct roll back and LogoPicker show
    // its inline error (components/setup/product-provider.tsx).
    await expect(repo.upsertProduct(DEMO_PRODUCT)).rejects.toThrow("quota exceeded");
  });
});
