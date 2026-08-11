import { describe, expect, it } from "vitest";
import { DEMO_ASSUMPTIONS } from "../assumptions";
import {
  applyScenarioSave,
  buildAuditEntry,
  createScenario,
  diffAssumptions,
} from "../scenarios";

const T0 = "2026-08-11T10:00:00.000Z";
const T1 = "2026-08-11T11:00:00.000Z";

describe("diffAssumptions — PRD §68", () => {
  it("returns an empty list for identical assumption sets", () => {
    expect(diffAssumptions(DEMO_ASSUMPTIONS, { ...DEMO_ASSUMPTIONS })).toEqual([]);
  });

  it("formats rate and money changes in §68 display form", () => {
    const changes = diffAssumptions(DEMO_ASSUMPTIONS, {
      ...DEMO_ASSUMPTIONS,
      tradeSpendRate: "0.15",
      retailerMarginRate: "0.50",
      currentSrpPerUnit: "21.49",
    });
    expect(changes).toEqual([
      { field: "retailerMarginRate", label: "Retailer margin", from: "48%", to: "50%" },
      { field: "tradeSpendRate", label: "Trade spend", from: "9.48%", to: "15%" },
      { field: "currentSrpPerUnit", label: "Current SRP", from: "$19.99", to: "$21.49" },
    ]);
  });

  it("summarizes promotional calendar changes as one line", () => {
    // The §99 demo ships with 2 promotions; drop one.
    const changes = diffAssumptions(DEMO_ASSUMPTIONS, {
      ...DEMO_ASSUMPTIONS,
      promotions: DEMO_ASSUMPTIONS.promotions.slice(0, 1),
    });
    expect(changes).toEqual([
      { field: "promotions", label: "Promotional calendar", from: "2 promotions", to: "1 promotion" },
    ]);
  });

  it("renders empty optional fields as an em dash", () => {
    const changes = diffAssumptions(DEMO_ASSUMPTIONS, {
      ...DEMO_ASSUMPTIONS,
      targetSrpPerUnit: "21.49",
    });
    expect(changes).toEqual([
      { field: "targetSrpPerUnit", label: "Target SRP", from: "—", to: "$21.49" },
    ]);
  });
});

describe("buildAuditEntry / applyScenarioSave", () => {
  it("returns null when nothing changed (no empty history entries)", () => {
    expect(buildAuditEntry(DEMO_ASSUMPTIONS, { ...DEMO_ASSUMPTIONS }, T1)).toBeNull();
  });

  it("appends output changes after assumption changes (§68 example shape)", () => {
    const entry = buildAuditEntry(
      DEMO_ASSUMPTIONS,
      { ...DEMO_ASSUMPTIONS, tradeSpendRate: "0.15" },
      T1,
      [{ field: "contributionMargin", label: "Contribution", from: "10.2%", to: "5.7%" }],
    );
    expect(entry?.at).toBe(T1);
    expect(entry?.changes.map((change) => change.label)).toEqual(["Trade spend", "Contribution"]);
  });

  it("save updates assumptions, stamps updatedAt and prepends history", () => {
    const scenario = createScenario("s1", "p1", "Base", DEMO_ASSUMPTIONS, T0);
    expect(scenario.history).toEqual([]);

    const next = { ...DEMO_ASSUMPTIONS, retailerMarginRate: "0.50" };
    const entry = buildAuditEntry(scenario.assumptions, next, T1);
    const saved = applyScenarioSave(scenario, next, entry, T1);

    expect(saved.assumptions.retailerMarginRate).toBe("0.50");
    expect(saved.updatedAt).toBe(T1);
    expect(saved.createdAt).toBe(T0);
    expect(saved.history).toHaveLength(1);
    expect(saved.history[0].changes[0]).toEqual({
      field: "retailerMarginRate",
      label: "Retailer margin",
      from: "48%",
      to: "50%",
    });

    // A save with no changes leaves history untouched.
    const unchanged = applyScenarioSave(saved, next, buildAuditEntry(saved.assumptions, next, T1), T1);
    expect(unchanged.history).toHaveLength(1);
  });
});
