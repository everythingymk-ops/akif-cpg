import { describe, expect, it } from "vitest";
import { computeScenario } from "../computeScenario";
import {
  DEMO_PRODUCT,
  assumptionsForProduct,
  effectiveCogsPerUnit,
  getSectionVisibility,
  suggestSetup,
  type OnboardingAnswers,
  type ProductSetup,
} from "../product";

const answers = (partial: Partial<OnboardingAnswers>): OnboardingAnswers => ({
  companyType: "brand",
  manufacturingSource: "contractManufacturer",
  importer: "brand",
  salesMethods: ["directToRetailer"],
  retailChannels: ["grocery"],
  ...partial,
});

describe("getSectionVisibility — PRD §12, §3E", () => {
  it("shows the distributor section only on distributor routes", () => {
    expect(getSectionVisibility("A").distributor).toBe(false);
    expect(getSectionVisibility("B").distributor).toBe(true);
    expect(getSectionVisibility("C").distributor).toBe(true);
    expect(getSectionVisibility("D").distributor).toBe(false);
    expect(getSectionVisibility("E").distributor).toBe(true);
  });

  it("always keeps manufacturing, landed cost and retailer visible", () => {
    for (const route of ["A", "B", "C", "D", "E"] as const) {
      const v = getSectionVisibility(route);
      expect(v.manufacturing).toBe(true);
      expect(v.landedCost).toBe(true);
      expect(v.retailer).toBe(true);
    }
  });
});

describe("suggestSetup — PRD §3–4 heuristics", () => {
  it("private label manufacturers get structure D and route D", () => {
    expect(suggestSetup(answers({ companyType: "privateLabelManufacturer" }))).toEqual({
      structure: "privateLabelManufacturer",
      route: "D",
    });
    expect(
      suggestSetup(
        answers({ companyType: "manufacturer", salesMethods: ["privateLabel", "wholesale"] }),
      ),
    ).toEqual({ structure: "privateLabelManufacturer", route: "D" });
  });

  it("self-manufacturing points to vertical integration", () => {
    expect(
      suggestSetup(answers({ companyType: "manufacturerAndBrand", salesMethods: ["throughDistributor"] })),
    ).toEqual({ structure: "verticallyIntegrated", route: "C" });
    expect(suggestSetup(answers({ manufacturingSource: "ourselves" }))).toEqual({
      structure: "verticallyIntegrated",
      route: "A",
    });
  });

  it("manufacturers selling to brands map to structure B", () => {
    expect(
      suggestSetup(answers({ companyType: "manufacturer", salesMethods: ["throughDistributor"] })),
    ).toEqual({ structure: "manufacturerSupplier", route: "E" });
  });

  it("brands map by distributor usage", () => {
    expect(suggestSetup(answers({ salesMethods: ["throughDistributor", "amazon"] }))).toEqual({
      structure: "contractManufacturerBrand",
      route: "B",
    });
    expect(suggestSetup(answers({}))).toEqual({ structure: "directBrand", route: "A" });
  });
});

describe("effectiveCogsPerUnit — PRD §6–7", () => {
  it("simple mode passes the entered COGS through", () => {
    expect(effectiveCogsPerUnit(DEMO_PRODUCT)).toBe("3.65");
  });

  it("detailed mode sums components via the engine", () => {
    const detailed: ProductSetup = {
      ...DEMO_PRODUCT,
      cogsMode: "detailed",
      cogsComponents: [
        { name: "Actives", category: "formula", amountPerUnit: "1.35" },
        { name: "Bottle + label", category: "packaging", amountPerUnit: "0.50" },
        { name: "Conversion", category: "manufacturing", amountPerUnit: "1.80" },
      ],
    };
    expect(effectiveCogsPerUnit(detailed)).toBe("3.65");
  });
});

describe("assumptionsForProduct — PRD §12, §52", () => {
  it("route drives the distributor leg", () => {
    expect(assumptionsForProduct({ ...DEMO_PRODUCT, route: "A" }).useDistributor).toBe(false);
    expect(assumptionsForProduct({ ...DEMO_PRODUCT, route: "B" }).useDistributor).toBe(true);
  });

  it("private label (route D) defaults trade spend and broker to zero, still editable data", () => {
    const a = assumptionsForProduct({ ...DEMO_PRODUCT, route: "D" });
    expect(a.tradeSpendRate).toBe("0");
    expect(a.additionalReserveRate).toBe("0");
    expect(a.brokerRate).toBe("0");
    expect(a.useDistributor).toBe(false);
  });

  it("assumption overrides win over defaults", () => {
    const a = assumptionsForProduct({
      ...DEMO_PRODUCT,
      assumptionOverrides: { retailerMarginRate: "0.42", currentSrpPerUnit: "24.99" },
    });
    expect(a.retailerMarginRate).toBe("0.42");
    expect(a.currentSrpPerUnit).toBe("24.99");
  });

  it("produces a computable scenario for every route", () => {
    for (const route of ["A", "B", "C", "D", "E"] as const) {
      const result = computeScenario(assumptionsForProduct({ ...DEMO_PRODUCT, route }));
      expect(result.ok).toBe(true);
    }
  });

  it("the demo product reproduces the step-5 screen numbers", () => {
    const result = computeScenario(assumptionsForProduct(DEMO_PRODUCT));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scenario.requiredSrpPerUnit.toFixed(2)).toBe("18.69");
  });
});
