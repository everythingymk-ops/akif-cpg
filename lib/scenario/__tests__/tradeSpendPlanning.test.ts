import { describe, expect, it } from "vitest";
import { computeTradeSpendNormalized, type Promotion } from "@/lib/pricing-engine";
import { DEMO_ASSUMPTIONS, type ScenarioAssumptions } from "../assumptions";
import { DEFAULT_COACH_GROSS_SALES, tangibleTradeSpend } from "../coach";
import { computeScenario } from "../computeScenario";

const bogo: Promotion = {
  name: "BOGO",
  type: "bogo",
  events: "2",
  weeks: "4",
  discountRate: "0.50",
  brandFundingRate: "1",
  salesLift: "2.0",
};
const oi: Promotion = {
  name: "Off Invoice",
  type: "offInvoice",
  weeks: "8",
  discountRate: "0.15",
  brandFundingRate: "1",
  salesLift: "1.25",
};

const calendarAssumptions: ScenarioAssumptions = {
  ...DEMO_ASSUMPTIONS,
  tradeSpendMode: "calendar",
  promotions: [bogo, oi],
};

describe("computeScenario — calendar trade spend (PRD §16 Mode B)", () => {
  it("prices the §99 calendar through the trade spend engine", () => {
    const result = computeScenario(calendarAssumptions);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const trade = result.scenario.tradeSpend;

    const direct = computeTradeSpendNormalized({
      annualWeeks: "52",
      promotions: [bogo, oi],
      additionalReserveRate: "0.02",
    });
    expect(trade.mode).toBe("calendar");
    expect(trade.plan?.mode).toBe("normalizedWeeks");
    expect(trade.promotionalRate.toDecimalPlaces(20).equals(direct.promotionalTradeRate.toDecimalPlaces(20))).toBe(true);
    expect(trade.totalRate.toDecimalPlaces(20).equals(direct.totalTradeRate.toDecimalPlaces(20))).toBe(true);
    // ≈9.48% + 2% reserve lands in the §24 moderate band (10–15%).
    expect(trade.band?.id).toBe("moderate");
  });

  it("empty-string optional fields are sanitized before the engine sees them", () => {
    const result = computeScenario({
      ...calendarAssumptions,
      promotions: [
        {
          ...bogo,
          events: "",
          retailerFundingRate: "",
          distributorFundingRate: "",
          fixedEventFee: "",
          additionalCost: "",
          estimatedUnits: "",
          startDate: "",
          endDate: "",
        },
        oi,
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scenario.tradeSpend.plan?.mode).toBe("normalizedWeeks");
  });

  it("fixed event fees force actual-units mode and need the unit context", () => {
    const withFee = {
      ...calendarAssumptions,
      promotions: [bogo, { ...oi, fixedEventFee: "1500", events: "1" }],
    };
    const missingContext = computeScenario(withFee);
    expect(missingContext.ok).toBe(false);
    if (missingContext.ok) return;
    expect(missingContext.error).toMatch(/normalWeeklyUnits/);

    const withContext = computeScenario({
      ...withFee,
      normalWeeklyUnits: "1000",
      plannerInvoiceReferencePerUnit: "8.90",
    });
    expect(withContext.ok).toBe(true);
    if (!withContext.ok) return;
    expect(withContext.scenario.tradeSpend.plan?.mode).toBe("actualUnits");
    // Weekly forecast also satisfies the fixed-costs-without-volume rule (§71).
    expect(withContext.scenario.warnings.map((w) => w.code)).not.toContain("fixed-costs-without-volume");
  });

  it("manual mode still stacks rate + reserve and reports its band", () => {
    const result = computeScenario(DEMO_ASSUMPTIONS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scenario.tradeSpend.mode).toBe("manual");
    expect(result.scenario.tradeSpend.plan).toBeUndefined();
    expect(result.scenario.tradeSpend.totalRate.equals("0.1148")).toBe(true);
    expect(result.scenario.tradeSpend.band?.id).toBe("moderate");
  });

  it("custom bands from options drive the band lookup (PRD §24, §55)", () => {
    const result = computeScenario(DEMO_ASSUMPTIONS, {
      tradeSpendBands: [
        {
          id: "custom",
          label: "House Band",
          minRate: "0.10",
          maxRate: "0.20",
          guidance: "Custom guidance.",
          advisorPriority: null,
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scenario.tradeSpend.band?.id).toBe("custom");
  });
});

describe("tangibleTradeSpend — PRD §78", () => {
  it("translates 20% into dollars at the $1,000,000 reference", () => {
    const t = tangibleTradeSpend("0.20");
    expect(t.grossSales.equals(DEFAULT_COACH_GROSS_SALES)).toBe(true);
    expect(t.tradeSpendDollars.equals("200000")).toBe(true);
    expect(t.netAfterTradeDollars.equals("800000")).toBe(true);
  });

  it("accepts a custom reference figure", () => {
    const t = tangibleTradeSpend("0.1148", "2500000");
    expect(t.tradeSpendDollars.equals("287000")).toBe(true);
  });
});
