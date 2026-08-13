"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_TRADE_SPEND_BANDS, type TradeSpendBand } from "@/lib/pricing-engine";
import { repository } from "@/lib/repository";
import { subscribeToWorkspace } from "@/lib/repository/workspaceSync";

/**
 * Editable benchmark records (PRD §24, §55): planning bands are data the user
 * can tune, never hardcoded strings. Persisted through the repository
 * (roadmap step 9); children render after hydration.
 */
interface BenchmarkContextValue {
  tradeSpendBands: readonly TradeSpendBand[];
  setTradeSpendBands: (bands: TradeSpendBand[]) => void;
  resetTradeSpendBands: () => void;
}

const BenchmarkContext = createContext<BenchmarkContextValue | null>(null);

export function BenchmarkProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [tradeSpendBands, setBands] = useState<readonly TradeSpendBand[]>(
    DEFAULT_TRADE_SPEND_BANDS,
  );

  useEffect(() => {
    let cancelled = false;
    repository
      .loadWorkspace()
      .then((state) => {
        if (cancelled) return;
        if (state && state.tradeSpendBands.length > 0) {
          setBands(state.tradeSpendBands);
        }
        setHydrated(true);
      })
      .catch((error: unknown) => {
        console.error("Failed to load persisted benchmarks", error);
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () =>
      subscribeToWorkspace((snapshot) => {
        if (snapshot.tradeSpendBands.length > 0) setBands(snapshot.tradeSpendBands);
      }),
    [],
  );

  const value = useMemo<BenchmarkContextValue>(
    () => ({
      tradeSpendBands,
      setTradeSpendBands: (bands) => {
        setBands(bands);
        void repository.replaceTradeSpendBands(bands).catch(console.error);
      },
      resetTradeSpendBands: () => {
        setBands(DEFAULT_TRADE_SPEND_BANDS);
        void repository.replaceTradeSpendBands(DEFAULT_TRADE_SPEND_BANDS).catch(console.error);
      },
    }),
    [tradeSpendBands],
  );

  if (!hydrated) return null;
  return <BenchmarkContext.Provider value={value}>{children}</BenchmarkContext.Provider>;
}

export function useBenchmarks(): BenchmarkContextValue {
  const context = useContext(BenchmarkContext);
  if (!context) {
    throw new Error("useBenchmarks must be used within a BenchmarkProvider");
  }
  return context;
}
