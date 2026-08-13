"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { repository } from "@/lib/repository";
import { ScenarioConflictError } from "@/lib/repository/types";
import {
  markWorkspaceLoaded,
  refreshWorkspace,
  startWorkspaceAutoRefresh,
  subscribeToWorkspace,
} from "@/lib/repository/workspaceSync";
import type { ScenarioAssumptions } from "@/lib/scenario/assumptions";
import {
  DEMO_PRODUCT,
  assumptionsForProduct,
  patchProduct,
  type ProductSetup,
} from "@/lib/scenario/product";
import {
  applyScenarioSave,
  createScenario,
  type AuditEntry,
  type Scenario,
} from "@/lib/scenario/scenarios";
import {
  EXAMPLE_GODIVA_SEED,
  GODIVA_PRODUCT,
  GODIVA_SCENARIO,
  mergeSeedRecords,
  needsSeed,
} from "@/lib/scenario/seeds";

/**
 * Workspace store (roadmap step 9): products and their scenarios, persisted
 * through the repository (localStorage for the MVP — locked decision).
 * Children render only after hydration so the screen always mounts with the
 * persisted state, never a flash of seed data.
 */

// Deterministic seed for the very first run (also SSR-safe).
const SEED_SCENARIO: Scenario = createScenario(
  "demo-base",
  DEMO_PRODUCT.id,
  "Base",
  assumptionsForProduct(DEMO_PRODUCT),
  "2026-08-11T00:00:00.000Z",
);

interface ProductContextValue {
  products: ProductSetup[];
  activeProduct: ProductSetup;
  setActiveProductId: (id: string) => void;
  addProduct: (product: ProductSetup) => void;
  /**
   * Merge a partial patch into one product (e.g. the logo) and persist.
   * Scenarios and audit history are untouched. Rejects AFTER rolling state
   * back when persistence fails (storage quota) — memory must match storage.
   */
  updateProduct: (id: string, patch: Partial<Omit<ProductSetup, "id">>) => Promise<void>;
  /** All scenarios across products (portfolio view, PRD §44). */
  scenarios: Scenario[];
  /** Active scenario id per product id. */
  activeScenarioIdByProduct: Record<string, string>;
  /** Scenarios of the active product, newest last (PRD §37, §70). */
  scenariosForActiveProduct: Scenario[];
  activeScenario: Scenario | null;
  setActiveScenarioId: (id: string) => void;
  /**
   * Save working assumptions into the active scenario with its §68 entry.
   * Resolves "conflict" when somebody else saved it first — the caller decides
   * whether to reload or overwrite, `force` does the latter.
   */
  saveActiveScenario: (
    assumptions: ScenarioAssumptions,
    entry: AuditEntry | null,
    force?: boolean,
  ) => Promise<"saved" | "conflict">;
  /** Re-read the workspace now (after resolving a conflict, say). */
  refresh: () => Promise<void>;
  /** Create (Save as / Duplicate) a scenario for the active product and activate it. */
  createScenarioForActiveProduct: (name: string, assumptions: ScenarioAssumptions) => void;
}

const ProductContext = createContext<ProductContextValue | null>(null);

export function ProductProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [products, setProducts] = useState<ProductSetup[]>([DEMO_PRODUCT]);
  const [scenarios, setScenarios] = useState<Scenario[]>([SEED_SCENARIO]);
  const [activeProductId, setActiveProductIdState] = useState<string>(DEMO_PRODUCT.id);
  const [activeScenarioByProduct, setActiveScenarioByProduct] = useState<Record<string, string>>({
    [DEMO_PRODUCT.id]: SEED_SCENARIO.id,
  });

  useEffect(() => {
    let cancelled = false;
    repository
      .loadWorkspace()
      .then((state) => {
        if (cancelled) return;

        // Normalize field by field — an empty collection never discards the
        // others. First run starts from the §99 demo product.
        const baseProducts =
          state === null || state.products.length === 0 ? [DEMO_PRODUCT] : state.products;
        const baseScenarios =
          state === null || (state.scenarios.length === 0 && state.products.length === 0)
            ? [SEED_SCENARIO]
            : state.scenarios;

        // One-time delivery of the Godiva example — to first runs and to
        // workspaces that predate it alike. mergeSeedRecords keeps the user's
        // own record if the id already exists, and recording the seed id is
        // what stops a deleted example from reappearing on the next load.
        const godivaPending = needsSeed(state?.appliedSeeds, EXAMPLE_GODIVA_SEED);
        const nextProducts = godivaPending
          ? mergeSeedRecords(baseProducts, [GODIVA_PRODUCT])
          : baseProducts;
        const nextScenarios =
          godivaPending && nextProducts.length !== baseProducts.length
            ? mergeSeedRecords(baseScenarios, [GODIVA_SCENARIO])
            : baseScenarios;

        const activeId =
          state?.ui.activeProductId && nextProducts.some((p) => p.id === state.ui.activeProductId)
            ? state.ui.activeProductId
            : nextProducts[0].id;
        const byProduct = {
          ...(state?.ui.activeScenarioIdByProduct ?? {
            [DEMO_PRODUCT.id]: SEED_SCENARIO.id,
          }),
          ...(godivaPending ? { [GODIVA_PRODUCT.id]: GODIVA_SCENARIO.id } : {}),
        };

        setProducts(nextProducts);
        setScenarios(nextScenarios);
        setActiveProductIdState(activeId);
        setActiveScenarioByProduct(byProduct);
        setHydrated(true);
        markWorkspaceLoaded();

        // Persist on first run (so the workspace exists at all) and whenever a
        // bundle was just applied — writing only the records we just added,
        // never the whole collection.
        if (state === null || godivaPending) {
          const newProducts = nextProducts.filter(
            (p) => !(state?.products ?? []).some((existing) => existing.id === p.id),
          );
          const newScenarios = nextScenarios.filter(
            (s) => !(state?.scenarios ?? []).some((existing) => existing.id === s.id),
          );
          // Products first, then scenarios — the foreign key makes the order
          // load-bearing, and firing both at once loses the race intermittently.
          void Promise.all(newProducts.map((product) => repository.upsertProduct(product)))
            .then(() =>
              Promise.all(newScenarios.map((scenario) => repository.upsertScenario(scenario))),
            )
            .then(() =>
              repository.saveUiState({
                activeProductId: activeId,
                activeScenarioIdByProduct: byProduct,
              }),
            )
            .then(() =>
              godivaPending ? repository.recordAppliedSeed(EXAMPLE_GODIVA_SEED) : undefined,
            )
            .catch((error: unknown) => console.error("Failed to persist workspace seed", error));
        }
      })
      .catch((error: unknown) => {
        console.error("Failed to load persisted workspace", error);
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Somebody else's save arrives here: adopt the collections, but never yank
  // the active selection out from under whoever is looking at the screen.
  useEffect(() => {
    const unsubscribe = subscribeToWorkspace((snapshot) => {
      if (snapshot.products.length > 0) setProducts(snapshot.products);
      setScenarios(snapshot.scenarios);
    });
    const stop = startWorkspaceAutoRefresh();
    return () => {
      unsubscribe();
      stop();
    };
  }, []);

  const value = useMemo<ProductContextValue>(() => {
    const activeProduct = products.find((p) => p.id === activeProductId) ?? products[0];
    const scenariosForActiveProduct = scenarios.filter((s) => s.productId === activeProduct.id);
    const activeScenarioId = activeScenarioByProduct[activeProduct.id];
    const activeScenario =
      scenariosForActiveProduct.find((s) => s.id === activeScenarioId) ??
      scenariosForActiveProduct[0] ??
      null;

    const persistUi = (productId: string, byProduct: Record<string, string>) =>
      void repository
        .saveUiState({ activeProductId: productId, activeScenarioIdByProduct: byProduct })
        .catch((error: unknown) => console.error("Failed to persist UI state", error));

    return {
      products,
      activeProduct,
      scenarios,
      activeScenarioIdByProduct: activeScenarioByProduct,
      scenariosForActiveProduct,
      activeScenario,

      setActiveProductId: (id) => {
        setActiveProductIdState(id);
        persistUi(id, activeScenarioByProduct);
      },

      addProduct: (product) => {
        const scenario = createScenario(
          crypto.randomUUID(),
          product.id,
          "Base",
          assumptionsForProduct(product),
          new Date().toISOString(),
        );
        const nextByProduct = { ...activeScenarioByProduct, [product.id]: scenario.id };
        setProducts([...products, product]);
        setScenarios([...scenarios, scenario]);
        setActiveProductIdState(product.id);
        setActiveScenarioByProduct(nextByProduct);
        // Two rows, not two whole collections: a colleague's product created a
        // moment ago stays untouched. Sequential, not concurrent: scenarios
        // carry a foreign key to their product, so a scenario that overtakes
        // its product is rejected by the database.
        void repository
          .upsertProduct(product)
          .then(() => repository.upsertScenario(scenario))
          .catch((error: unknown) => console.error("Failed to persist new product", error));
        persistUi(product.id, nextByProduct);
      },

      updateProduct: async (id, patch) => {
        const previous = products;
        const next = patchProduct(products, id, patch);
        const updated = next.find((p) => p.id === id);
        if (!updated) return;
        setProducts(next);
        try {
          await repository.upsertProduct(updated);
        } catch (error) {
          setProducts(previous);
          throw error;
        }
      },

      setActiveScenarioId: (id) => {
        const nextByProduct = { ...activeScenarioByProduct, [activeProduct.id]: id };
        setActiveScenarioByProduct(nextByProduct);
        persistUi(activeProduct.id, nextByProduct);
      },

      saveActiveScenario: async (assumptions, entry, force = false) => {
        if (!activeScenario) return "saved";
        const saved = applyScenarioSave(
          activeScenario,
          assumptions,
          entry,
          new Date().toISOString(),
        );
        try {
          const { updatedAt } = await repository.upsertScenario(
            saved,
            force ? undefined : activeScenario.updatedAt,
          );
          // Adopt the store's timestamp: keeping our own would make the next
          // save look like a conflict against a row we just wrote.
          setScenarios(scenarios.map((s) => (s.id === saved.id ? { ...saved, updatedAt } : s)));
          return "saved";
        } catch (error) {
          if (error instanceof ScenarioConflictError) return "conflict";
          console.error("Failed to save scenario", error);
          return "saved";
        }
      },

      refresh: () => refreshWorkspace(true),

      createScenarioForActiveProduct: (name, assumptions) => {
        const scenario = createScenario(
          crypto.randomUUID(),
          activeProduct.id,
          name,
          assumptions,
          new Date().toISOString(),
        );
        const nextByProduct = { ...activeScenarioByProduct, [activeProduct.id]: scenario.id };
        setScenarios([...scenarios, scenario]);
        setActiveScenarioByProduct(nextByProduct);
        void repository.upsertScenario(scenario).catch(console.error);
        persistUi(activeProduct.id, nextByProduct);
      },
    };
  }, [products, scenarios, activeProductId, activeScenarioByProduct]);

  if (!hydrated) return null;
  return <ProductContext.Provider value={value}>{children}</ProductContext.Provider>;
}

export function useProducts(): ProductContextValue {
  const context = useContext(ProductContext);
  if (!context) {
    throw new Error("useProducts must be used within a ProductProvider");
  }
  return context;
}
