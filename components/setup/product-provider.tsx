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
        if (state === null) {
          // First run: persist the seed so later partial saves (scenarios,
          // ui state) merge into a blob that already contains the product.
          void repository.saveProducts([DEMO_PRODUCT]).catch(console.error);
          void repository.saveScenarios([SEED_SCENARIO]).catch(console.error);
          void repository
            .saveUiState({
              activeProductId: DEMO_PRODUCT.id,
              activeScenarioIdByProduct: { [DEMO_PRODUCT.id]: SEED_SCENARIO.id },
            })
            .catch(console.error);
        } else {
          // Normalize field by field — an empty collection never discards
          // the others.
          const loadedProducts = state.products.length > 0 ? state.products : [DEMO_PRODUCT];
          const loadedScenarios =
            state.scenarios.length > 0 || state.products.length > 0
              ? state.scenarios
              : [SEED_SCENARIO];
          const activeId =
            state.ui.activeProductId &&
            loadedProducts.some((p) => p.id === state.ui.activeProductId)
              ? state.ui.activeProductId
              : loadedProducts[0].id;
          setProducts(loadedProducts);
          setScenarios(loadedScenarios);
          setActiveProductIdState(activeId);
          setActiveScenarioByProduct(state.ui.activeScenarioIdByProduct ?? {});
        }
        setHydrated(true);
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
