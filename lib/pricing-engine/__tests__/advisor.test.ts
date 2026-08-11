import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRADE_SPEND_BANDS,
  findTradeSpendBand,
  runAdvisor,
  type AdvisorScenario,
} from "../advisor";
import { computeTradeSpendActualUnits } from "../tradeSpend";
import type { CostLine } from "../types";

const deductions: CostLine[] = [
  { name: "Deductions", amount: "0.02", basis: "percentOfInvoice", owner: "brand" },
];
const variables: CostLine[] = [
  { name: "Broker", amount: "0.05", basis: "percentOfInvoice", owner: "brand" },
  { name: "Royalty", amount: "0.01", basis: "percentOfNetSales", owner: "brand" },
];

const base: AdvisorScenario = {
  landedCostPerUnit: "5.846875",
  targetContributionRate: "0.08",
  tradeSpendRate: "0.0948",
  revenueDeductions: deductions,
  variableCosts: variables,
  distributor: {
    marginSpec: { basis: "margin", rate: "0.15" },
    fees: [{ name: "Handling", amount: "0.50", basis: "perUnit", owner: "distributor" }],
  },
  retailerMarginSpec: { basis: "margin", rate: "0.48" },
  currentSrpPerUnit: "19.99",
};

const codesOf = (insights: { code: string }[]) => insights.map((i) => i.code);

describe("findTradeSpendBand — PRD §24 editable bands", () => {
  it("maps rates to the documented planning bands", () => {
    expect(findTradeSpendBand("0.08")?.id).toBe("low");
    expect(findTradeSpendBand("0.12")?.id).toBe("moderate");
    expect(findTradeSpendBand("0.17")?.id).toBe("active");
    expect(findTradeSpendBand("0.35")?.id).toBe("high");
    expect(findTradeSpendBand("0.03")).toBeUndefined();
  });

  it("bands are data records the caller can replace (PRD §55)", () => {
    const custom = [{ ...DEFAULT_TRADE_SPEND_BANDS[3], minRate: "0.50" }];
    expect(findTradeSpendBand("0.35", custom)).toBeUndefined();
    expect(findTradeSpendBand("0.55", custom)?.id).toBe("high");
  });
});

describe("runAdvisor — critical insights (PRD §39)", () => {
  it("a healthy scenario produces no critical insights", () => {
    const insights = runAdvisor(base);
    expect(insights.filter((i) => i.priority === "critical")).toEqual([]);
  });

  it("flags negative contribution and cost-exceeds-revenue at a low shelf price", () => {
    const insights = runAdvisor({ ...base, currentSrpPerUnit: 12 });
    const codes = codesOf(insights);
    expect(codes).toContain("negative-contribution");
    expect(codes).toContain("cost-exceeds-net-revenue");
    expect(codes).toContain("srp-below-break-even");
    expect(insights[0].priority).toBe("critical");
  });

  it("flags impossible target economics instead of throwing", () => {
    const insights = runAdvisor({
      ...base,
      variableCosts: [{ name: "Mega broker", amount: "0.95", basis: "percentOfInvoice", owner: "brand" }],
    });
    const impossible = insights.find((i) => i.code === "impossible-target-economics");
    expect(impossible?.priority).toBe("critical");
    expect(impossible?.message).toContain("8%");
  });
});

describe("runAdvisor — warnings", () => {
  it("surfaces the §24 highly-promotional band with its guidance text", () => {
    const insights = runAdvisor({ ...base, tradeSpendRate: "0.22" });
    const band = insights.find((i) => i.code === "trade-spend-band-high");
    expect(band?.priority).toBe("warning");
    expect(band?.message).toContain("22%");
    expect(band?.message).toContain("significant portion of gross sales");
  });

  it("flags thin contribution above zero but under the planning floor", () => {
    const insights = runAdvisor({ ...base, currentSrpPerUnit: "17.50" });
    const low = insights.find((i) => i.code === "low-contribution");
    expect(low?.priority).toBe("warning");
    expect(low?.message).toContain("5%");
  });

  it("quantifies the SRP increase and landed-cost remedy when the target is out of reach (§38)", () => {
    const insights = runAdvisor({ ...base, currentSrpPerUnit: "17.50" });
    const unreachable = insights.find((i) => i.code === "target-unreachable-at-current-srp");
    expect(unreachable?.priority).toBe("warning");
    expect(unreachable?.metrics["SRP increase needed"]).toBeDefined();
    expect(unreachable?.metrics["Landed cost reduction needed"]).toBeDefined();
  });

  it("flags a target SRP far from the calculated requirement", () => {
    const insights = runAdvisor({ ...base, targetSrpPerUnit: 25 });
    const gap = insights.find((i) => i.code === "target-srp-gap");
    expect(gap?.priority).toBe("warning");
    expect(gap?.metrics["Required SRP"]).toBeDefined();
  });

  it("flags fixed event fees dominating the promotional budget", () => {
    const plan = computeTradeSpendActualUnits(
      {
        promotions: [
          {
            name: "Feature",
            type: "featureAd",
            weeks: 4,
            discountRate: "0.10",
            brandFundingRate: 1,
            salesLift: 1,
            fixedEventFee: 5000,
            events: 1,
          },
        ],
      },
      { normalWeeklyUnits: 100, brandInvoicePricePerUnit: 10 },
    );
    const insights = runAdvisor({ ...base, tradeSpendPlan: plan });
    const fixed = insights.find((i) => i.code === "high-fixed-promo-fees");
    expect(fixed?.priority).toBe("warning");
  });
});

describe("runAdvisor — opportunities", () => {
  it("quantifies the direct-distribution margin gain (§39)", () => {
    const insights = runAdvisor(base);
    const direct = insights.find((i) => i.code === "direct-distribution-improves-margin");
    expect(direct?.priority).toBe("opportunity");
    expect(direct?.metrics["With distributor"]).toBeDefined();
    expect(direct?.metrics["Direct"]).toBeDefined();
  });

  it("quantifies retailer-margin leverage in §38 style", () => {
    const insights = runAdvisor(base);
    const leverage = insights.find((i) => i.code === "retailer-margin-leverage");
    expect(leverage?.priority).toBe("opportunity");
    expect(leverage?.message).toContain("48%");
    expect(leverage?.message).toContain("44%");
    expect(leverage?.metrics["SRP impact"]).toBeDefined();
  });

  it("surfaces COGS leverage when cost reduction moves the required SRP strongly", () => {
    const insights = runAdvisor(base);
    const cogs = insights.find((i) => i.code === "cogs-leverage");
    expect(cogs?.priority).toBe("opportunity");
    expect(cogs?.metrics.Leverage).toBeDefined();
  });
});

describe("runAdvisor — ranking and language (PRD §39–40, §56)", () => {
  it("orders insights critical → warning → opportunity", () => {
    const insights = runAdvisor({ ...base, currentSrpPerUnit: 12, tradeSpendRate: "0.22" });
    const order = insights.map((i) => i.priority);
    const firstWarning = order.indexOf("warning");
    const firstOpportunity = order.indexOf("opportunity");
    expect(order[0]).toBe("critical");
    if (firstWarning !== -1 && firstOpportunity !== -1) {
      expect(firstWarning).toBeLessThan(firstOpportunity);
    }
    const lastCritical = order.lastIndexOf("critical");
    if (firstWarning !== -1) {
      expect(lastCritical).toBeLessThan(firstWarning);
    }
  });

  it("never uses prescriptive language (§56)", () => {
    const insights = runAdvisor({ ...base, currentSrpPerUnit: 12, tradeSpendRate: "0.22", targetSrpPerUnit: 25 });
    for (const insight of insights) {
      expect(insight.message).not.toMatch(/\bmust\b/i);
    }
  });

  it("every insight carries preformatted metrics for display", () => {
    const insights = runAdvisor({ ...base, currentSrpPerUnit: 12 });
    for (const insight of insights) {
      expect(Object.keys(insight.metrics).length).toBeGreaterThan(0);
    }
  });
});
