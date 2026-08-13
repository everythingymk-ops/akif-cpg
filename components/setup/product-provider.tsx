"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { repository } from "@/lib/repository";
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
  /** Save working assumptions into the active scenario with its §68 entry. */
  saveActiveScenario: (assumptions: ScenarioAssumptions, entry: AuditEntry | null) => void;
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
      .loadState()
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

        // Persist on first run (so later partial saves merge into a blob that
        // already holds the products) and whenever a bundle was just applied.
        if (state === null || godivaPending) {
          void repository
            .saveProducts(nextProducts)
            .then(() => repository.saveScenarios(nextScenarios))
            .then(() =>
              repository.saveUiState({
                activeProductId: activeId,
                activeScenarioIdByProduct: byProduct,
              }),
            )
            .then(() => (godivaPending ? repository.recordAppliedSeed(EXAMPLE_GODIVA_SEED) : undefined))
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
        const nextProducts = [...products, product];
        const nextScenarios = [...scenarios, scenario];
        const nextByProduct = { ...activeScenarioByProduct, [product.id]: scenario.id };
        setProducts(nextProducts);
        setScenarios(nextScenarios);
        setActiveProductIdState(product.id);
        setActiveScenarioByProduct(nextByProduct);
        void repository.saveProducts(nextProducts).catch(console.error);
        void repository.saveScenarios(nextScenarios).catch(console.error);
        persistUi(product.id, nextByProduct);
      },

      updateProduct: async (id, patch) => {
        const previous = products;
        const next = patchProduct(products, id, patch);
        setProducts(next);
        try {
          await repository.saveProducts(next);
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

      saveActiveScenario: (assumptions, entry) => {
        if (!activeScenario) return;
        const now = new Date().toISOString();
        const nextScenarios = scenarios.map((s) =>
          s.id === activeScenario.id ? applyScenarioSave(s, assumptions, entry, now) : s,
        );
        setScenarios(nextScenarios);
        void repository.saveScenarios(nextScenarios).catch(console.error);
      },

      createScenarioForActiveProduct: (name, assumptions) => {
        const scenario = createScenario(
          crypto.randomUUID(),
          activeProduct.id,
          name,
          assumptions,
          new Date().toISOString(),
        );
        const nextScenarios = [...scenarios, scenario];
        const nextByProduct = { ...activeScenarioByProduct, [activeProduct.id]: scenario.id };
        setScenarios(nextScenarios);
        setActiveScenarioByProduct(nextByProduct);
        void repository.saveScenarios(nextScenarios).catch(console.error);
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
