import { describe, expect, it } from "vitest";
import { dec } from "../money";
import {
  computeTradeSpendActualUnits,
  computeTradeSpendNormalized,
  type Promotion,
} from "../tradeSpend";
import { PricingEngineError } from "../types";

const bogo: Promotion = {
  name: "BOGO",
  type: "bogo",
  events: 2,
  weeks: 4,
  discountRate: "0.50",
  brandFundingRate: 1,
  salesLift: "2.0",
};

const oi: Promotion = {
  name: "Off Invoice",
  type: "offInvoice",
  weeks: 8,
  discountRate: "0.15",
  brandFundingRate: 1,
  salesLift: "1.25",
};

describe("computeTradeSpendNormalized — PRD §21–22", () => {
  it("reproduces the required §22 arithmetic exactly", () => {
    const r = computeTradeSpendNormalized({ promotions: [bogo, oi] });
    expect(r.normalWeeks.equals("40")).toBe(true);
    expect(r.totalPromoWeeks.equals("12")).toBe(true);
    // 40 + (4 × 2.0) + (8 × 1.25) = 58 equivalent weeks
    expect(r.annualUnits.equals("58")).toBe(true);
    // 4 × 2.0 × 0.50 + 8 × 1.25 × 0.15 = 5.5
    expect(r.totalPromotionSpend.equals("5.5")).toBe(true);
    // 5.5 ÷ 58 ≈ 0.094828
    expect(r.promotionalTradeRate.toDecimalPlaces(6).equals("0.094828")).toBe(true);
  });

  it("breaks the plan down per promotion", () => {
    const r = computeTradeSpendNormalized({ promotions: [bogo, oi] });
    const [b, o] = r.breakdown;
    expect(b.promoUnits.equals("8")).toBe(true);
    expect(b.totalSpend.equals("4")).toBe(true);
    expect(o.promoUnits.equals("10")).toBe(true);
    expect(o.totalSpend.equals("1.5")).toBe(true);
    expect(b.effectiveRate.plus(o.effectiveRate).equals(r.promotionalTradeRate)).toBe(true);
  });

  it("adds the additional trade reserve on top (PRD §23: ≈9.48% + 2% ≈ 11.48%)", () => {
    const r = computeTradeSpendNormalized({
      promotions: [bogo, oi],
      additionalReserveRate: "0.02",
    });
    expect(r.additionalReserveRate.equals("0.02")).toBe(true);
    expect(r.totalTradeRate.toDecimalPlaces(4).equals("0.1148")).toBe(true);
  });

  it("scales brand spend by the brand funding share (PRD §19)", () => {
    const half = computeTradeSpendNormalized({
      promotions: [{ ...bogo, brandFundingRate: "0.5", retailerFundingRate: "0.5" }],
    });
    expect(half.breakdown[0].totalSpend.equals("2")).toBe(true);
  });

  it("returns a zero rate with no promotions (reserve still applies)", () => {
    const r = computeTradeSpendNormalized({ promotions: [], additionalReserveRate: "0.03" });
    expect(r.promotionalTradeRate.isZero()).toBe(true);
    expect(r.totalTradeRate.equals("0.03")).toBe(true);
    expect(r.annualUnits.equals("52")).toBe(true);
  });

  it("rejects fixed dollar fees — those need actual-units mode (PRD §21)", () => {
    expect(() =>
      computeTradeSpendNormalized({
        promotions: [{ ...oi, fixedEventFee: 2000, events: 1 }],
      }),
    ).toThrow(/actual-units/);
  });
});

describe("computeTradeSpendActualUnits — PRD §21", () => {
  const context = { normalWeeklyUnits: 1000, brandInvoicePricePerUnit: "8.90" };

  it("matches the normalized rate when there are no fixed fees (price cancels out)", () => {
    const normalized = computeTradeSpendNormalized({ promotions: [bogo, oi] });
    const actual = computeTradeSpendActualUnits({ promotions: [bogo, oi] }, context);
    expect(actual.annualUnits.equals("58000")).toBe(true);
    expect(actual.totalPromotionSpend.equals("48950")).toBe(true); // 35600 + 13350
    expect(
      actual.promotionalTradeRate
        .toDecimalPlaces(20)
        .equals(normalized.promotionalTradeRate.toDecimalPlaces(20)),
    ).toBe(true);
  });

  it("the rate is independent of the invoice price when spend is all percentage-based", () => {
    const cheap = computeTradeSpendActualUnits(
      { promotions: [bogo, oi] },
      { normalWeeklyUnits: 1000, brandInvoicePricePerUnit: 1 },
    );
    const pricey = computeTradeSpendActualUnits(
      { promotions: [bogo, oi] },
      { normalWeeklyUnits: 1000, brandInvoicePricePerUnit: 100 },
    );
    expect(
      cheap.promotionalTradeRate.toDecimalPlaces(20).equals(pricey.promotionalTradeRate.toDecimalPlaces(20)),
    ).toBe(true);
  });

  it("blends fixed event fees and flat costs into the rate", () => {
    const r = computeTradeSpendActualUnits(
      {
        promotions: [bogo, { ...oi, fixedEventFee: 1500, events: 1, additionalCost: 500 }],
      },
      context,
    );
    // Variable 48,950 + fixed 2,000 = 50,950 over gross 58,000 × 8.90 = 516,200.
    const expected = dec("50950").dividedBy("516200");
    expect(r.totalPromotionSpend.equals("50950")).toBe(true);
    expect(r.grossValue.equals("516200")).toBe(true);
    expect(r.promotionalTradeRate.toDecimalPlaces(20).equals(expected.toDecimalPlaces(20))).toBe(true);
    expect(r.breakdown[1].fixedSpend.equals("2000")).toBe(true);
  });

  it("charges the fixed fee once per event", () => {
    const r = computeTradeSpendActualUnits(
      { promotions: [{ ...bogo, fixedEventFee: 1000 }] }, // bogo has events: 2
      context,
    );
    expect(r.breakdown[0].fixedSpend.equals("2000")).toBe(true);
  });

  it("an explicit estimatedUnits forecast overrides weeks × lift × weekly units", () => {
    const r = computeTradeSpendActualUnits(
      { promotions: [{ ...oi, estimatedUnits: 9000 }] },
      context,
    );
    expect(r.breakdown[0].promoUnits.equals("9000")).toBe(true);
    // 9,000 × 8.90 × 0.15 × 1.0 = 12,015
    expect(r.breakdown[0].variableSpend.equals("12015")).toBe(true);
  });
});

describe("validation", () => {
  it("rejects promo weeks exceeding the planning horizon", () => {
    expect(() =>
      computeTradeSpendNormalized({ annualWeeks: 10, promotions: [bogo, oi] }),
    ).toThrow(PricingEngineError);
  });

  it("rejects out-of-range rates and negative inputs", () => {
    expect(() =>
      computeTradeSpendNormalized({ promotions: [{ ...bogo, discountRate: "1.2" }] }),
    ).toThrow(/between 0 and 1/);
    expect(() =>
      computeTradeSpendNormalized({ promotions: [{ ...bogo, brandFundingRate: "1.5" }] }),
    ).toThrow(/between 0 and 1/);
    expect(() =>
      computeTradeSpendNormalized({ promotions: [{ ...bogo, salesLift: -1 }] }),
    ).toThrow(PricingEngineError);
    expect(() => computeTradeSpendNormalized({ annualWeeks: 0, promotions: [] })).toThrow(
      PricingEngineError,
    );
  });

  it("rejects a fixed event fee without an events count", () => {
    expect(() =>
      computeTradeSpendActualUnits(
        { promotions: [{ ...oi, fixedEventFee: 1500 }] },
        { normalWeeklyUnits: 1000, brandInvoicePricePerUnit: "8.90" },
      ),
    ).toThrow(/events/);
  });

  it("rejects fractional event counts", () => {
    expect(() =>
      computeTradeSpendNormalized({ promotions: [{ ...bogo, events: 1.5 }] }),
    ).toThrow(/whole number/);
  });

  it("returns an explainable trace (PRD §41, §67)", () => {
    const r = computeTradeSpendNormalized({ promotions: [bogo, oi] });
    expect(r.trace.title).toBe("Effective Annual Trade Spend");
    const labels = r.trace.steps.map((s) => s.label);
    expect(labels.some((l) => l.includes("BOGO"))).toBe(true);
    expect(r.trace.output.equals(r.totalTradeRate)).toBe(true);
  });
});
