import type Decimal from "decimal.js";
import { ONE, dec, type DecimalInput } from "@/lib/pricing-engine";

/**
 * Trade Spend Coach (PRD §78): make percentages financially tangible by
 * translating a trade-spend rate into dollars at a reference gross sales
 * figure ("At $1,000,000 gross invoice sales → trade spend $200,000, net
 * after trade $800,000").
 */

export const DEFAULT_COACH_GROSS_SALES = "1000000";

export interface TangibleTradeSpend {
  grossSales: Decimal;
  tradeSpendDollars: Decimal;
  netAfterTradeDollars: Decimal;
}

export function tangibleTradeSpend(
  tradeSpendRate: DecimalInput,
  grossSales: DecimalInput = DEFAULT_COACH_GROSS_SALES,
): TangibleTradeSpend {
  const rate = dec(tradeSpendRate, "tradeSpendRate");
  const gross = dec(grossSales, "grossSales");
  const tradeSpendDollars = gross.times(rate);
  return {
    grossSales: gross,
    tradeSpendDollars,
    netAfterTradeDollars: gross.times(ONE.minus(rate)),
  };
}
