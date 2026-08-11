"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { DEFAULT_TRADE_SPEND_BANDS, type TradeSpendBand } from "@/lib/pricing-engine";

/**
 * Editable benchmark records (PRD §24, §55): planning bands are data the user
 * can tune, never hardcoded strings. Session-scoped for now — persistence
 * arrives with the repository layer (roadmap step 9).
 */
interface BenchmarkContextValue {
  tradeSpendBands: readonly TradeSpendBand[];
  setTradeSpendBands: (bands: TradeSpendBand[]) => void;
  resetTradeSpendBands: () => void;
}

const BenchmarkContext = createContext<BenchmarkContextValue | null>(null);

export function BenchmarkProvider({ children }: { children: React.ReactNode }) {
  const [tradeSpendBands, setTradeSpendBands] = useState<readonly TradeSpendBand[]>(
    DEFAULT_TRADE_SPEND_BANDS,
  );

  const value = useMemo<BenchmarkContextValue>(
    () => ({
      tradeSpendBands,
      setTradeSpendBands: (bands) => setTradeSpendBands(bands),
      resetTradeSpendBands: () => setTradeSpendBands(DEFAULT_TRADE_SPEND_BANDS),
    }),
    [tradeSpendBands],
  );

  return <BenchmarkContext.Provider value={value}>{children}</BenchmarkContext.Provider>;
}

export function useBenchmarks(): BenchmarkContextValue {
  const context = useContext(BenchmarkContext);
  if (!context) {
    throw new Error("useBenchmarks must be used within a BenchmarkProvider");
  }
  return context;
}
