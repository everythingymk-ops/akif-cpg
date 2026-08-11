import { describe, expect, it } from "vitest";
import { DEMO_ASSUMPTIONS } from "../assumptions";
import { computeScenario } from "../computeScenario";
import { buildScenarioExportCsv, scenarioExportFilename } from "../exportCsv";
import { DEMO_PRODUCT } from "../product";

const T = "2026-08-12T09:00:00.000Z";

function demoCsv(): string {
  const computation = computeScenario(DEMO_ASSUMPTIONS);
  if (!computation.ok) throw new Error("demo must compute");
  return buildScenarioExportCsv({
    product: DEMO_PRODUCT,
    scenarioName: "Base",
    assumptions: DEMO_ASSUMPTIONS,
    computed: computation.scenario,
    generatedAt: T,
  });
}

describe("buildScenarioExportCsv — PRD §69", () => {
  it("contains every §69 section", () => {
    const csv = demoCsv();
    for (const section of [
      "ASSUMPTIONS",
      "PRICE WATERFALL",
      "PROMOTIONS",
      "TRADE SPEND",
      "OUTPUTS",
      "SENSITIVITY — TRADE SPEND",
    ]) {
      expect(csv).toContain(section);
    }
  });

  it("carries the §99 demo figures", () => {
    const csv = demoCsv();
    expect(csv).toContain("DEMO-SUP-60");
    expect(csv).toContain("Example Supplement 60 Count");
    expect(csv).toContain("Scenario,Base");
    expect(csv).toContain("Manufacturing COGS,$3.65");
    expect(csv).toContain("Required SRP,$18.69");
    expect(csv).toContain("Total planned trade spend,11.48%");
    expect(csv).toContain("BOGO,bogo,4,2,0.50,2.0,1");
    expect(csv).toContain("Generated," + T);
    // Sensitivity rows for the §33 default points.
    expect(csv).toMatch(/5%,\$[\d.]+,\$[\d.]+/);
    expect(csv).toMatch(/30%,\$[\d.]+,\$[\d.]+/);
  });

  it("escapes commas and quotes in user text", () => {
    const computation = computeScenario(DEMO_ASSUMPTIONS);
    if (!computation.ok) throw new Error("demo must compute");
    const csv = buildScenarioExportCsv({
      product: {
        ...DEMO_PRODUCT,
        basics: { ...DEMO_PRODUCT.basics, name: 'Oil, "Premium" 60ct' },
      },
      scenarioName: "Retailer, Request",
      assumptions: DEMO_ASSUMPTIONS,
      computed: computation.scenario,
      generatedAt: T,
    });
    expect(csv).toContain('Product,"Oil, ""Premium"" 60ct"');
    expect(csv).toContain('Scenario,"Retailer, Request"');
  });

  it("starts with a UTF-8 BOM and uses CRLF endings", () => {
    const csv = demoCsv();
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("\r\n");
  });

  it("builds a safe filename", () => {
    expect(scenarioExportFilename(DEMO_PRODUCT, "Base")).toBe("akif-cpg-demo-sup-60-base.csv");
    expect(
      scenarioExportFilename(
        { ...DEMO_PRODUCT, basics: { ...DEMO_PRODUCT.basics, sku: "" } },
        "Aggressive Launch!",
      ),
    ).toBe("akif-cpg-example-supplement-60-count-aggressive-launch.csv");
  });
});
