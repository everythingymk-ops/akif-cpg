"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { DEMO_PRODUCT, type ProductSetup } from "@/lib/scenario/product";

/**
 * In-memory product store (roadmap step 6). Products live for the browser
 * session only; the localStorage repository arrives in roadmap step 9.
 */
interface ProductContextValue {
  products: ProductSetup[];
  activeProduct: ProductSetup;
  setActiveProductId: (id: string) => void;
  addProduct: (product: ProductSetup) => void;
}

const ProductContext = createContext<ProductContextValue | null>(null);

export function ProductProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<ProductSetup[]>([DEMO_PRODUCT]);
  const [activeProductId, setActiveProductId] = useState<string>(DEMO_PRODUCT.id);

  const value = useMemo<ProductContextValue>(() => {
    const activeProduct =
      products.find((product) => product.id === activeProductId) ?? products[0];
    return {
      products,
      activeProduct,
      setActiveProductId,
      addProduct: (product: ProductSetup) => {
        setProducts((previous) => [...previous, product]);
        setActiveProductId(product.id);
      },
    };
  }, [products, activeProductId]);

  return <ProductContext.Provider value={value}>{children}</ProductContext.Provider>;
}

export function useProducts(): ProductContextValue {
  const context = useContext(ProductContext);
  if (!context) {
    throw new Error("useProducts must be used within a ProductProvider");
  }
  return context;
}
