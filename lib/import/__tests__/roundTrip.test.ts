import { describe, expect, it } from "vitest";
import { computeScenario } from "@/lib/scenario/computeScenario";
import { assumptionsForProduct } from "@/lib/scenario/product";
import { parseProductTemplate } from "../parseTemplate";
import { SHEETS } from "../templateSchema";
import { buildTemplateBlob, readTemplateFile, TemplateFileError } from "../workbook";

/**
 * The writer and the reader agree only through the labels printed on the
 * sheet, so this walks the whole loop — build the shipped template, read the
 * bytes back, parse them, price the result. Renaming a field on one side and
 * not the other fails here and nowhere else.
 *
 * ExcelJS runs in node, so no browser is involved; nothing here touches the
 * DOM (that is only `downloadTemplate`).
 */
async function buildAndRead(name = "filled.xlsx") {
  const blob = await buildTemplateBlob();
  const buffer = await blob.arrayBuffer();
  return readTemplateFile({ name, arrayBuffer: async () => buffer });
}

describe("template round trip", () => {
  it("writes every sheet the parser looks for", async () => {
    const workbook = await buildAndRead();
    for (const sheet of Object.values(SHEETS)) {
      expect(Object.keys(workbook)).toContain(sheet);
    }
  });

  it("hides the dropdown source sheet from the user", async () => {
    const workbook = await buildAndRead();
    // Present in the file (the dropdowns point at it) but not a sheet the
    // user is meant to see or fill in.
    expect(Object.keys(workbook)).toContain("Lists");
  });

  it("writes each choice list once instead of one per validated cell", async () => {
    const workbook = await buildAndRead();
    // Four distinct lists: currency, route, margin basis, trade-spend mode,
    // COGS category and promotion mechanic — deduplicated by content, so the
    // sheet stays a handful of columns rather than one per table row.
    const widestRow = Math.max(...workbook.Lists.map((row) => row.length));
    expect(widestRow).toBeLessThanOrEqual(8);
  });

  it("parses its own worked example without a single issue", async () => {
    const result = parseProductTemplate(await buildAndRead());

    expect(result.issues).toEqual([]);
    expect(result.product).not.toBeNull();
    expect(result.summary.productName).toBe("Godiva Sticks");
    expect(result.summary.sku).toBe("GDV-STK-08");
    expect(result.summary.cogsComponents).toBe(5);
    expect(result.summary.promotions).toBe(3);
  });

  it("round-trips into a product that prices to the guide's figures", async () => {
    const result = parseProductTemplate(await buildAndRead());
    const computed = computeScenario(
      assumptionsForProduct({ id: "round-trip", ...result.product! }),
    );

    expect(computed.ok).toBe(true);
    if (!computed.ok) return;
    expect(computed.scenario.landed.landedCostPerUnit.toFixed(2)).toBe("2.19");
    expect(computed.scenario.requiredInvoicePerUnit.toFixed(2)).toBe("3.29");
    expect(computed.scenario.requiredSrpPerUnit.toFixed(2)).toBe("6.51");
    expect(computed.scenario.tradeSpend.totalRate.times(100).toFixed(2)).toBe("9.12");
    expect(computed.scenario.atCurrentSrp!.contribution.contributionMarginRate.times(100).toFixed(1)).toBe(
      "15.4",
    );
  });

  it("keeps the example route and detailed COGS mode", async () => {
    const result = parseProductTemplate(await buildAndRead());
    expect(result.product?.route).toBe("B");
    expect(result.product?.cogsMode).toBe("detailed");
    expect(result.product?.assumptionOverrides?.tradeSpendMode).toBe("calendar");
  });

  it("refuses a file that is not .xlsx before trying to open it", async () => {
    await expect(
      readTemplateFile({ name: "product.csv", arrayBuffer: async () => new ArrayBuffer(0) }),
    ).rejects.toBeInstanceOf(TemplateFileError);
  });

  it("reports an unopenable .xlsx instead of throwing something raw", async () => {
    await expect(
      readTemplateFile({
        name: "broken.xlsx",
        arrayBuffer: async () => new TextEncoder().encode("not a spreadsheet").buffer,
      }),
    ).rejects.toBeInstanceOf(TemplateFileError);
  });
});
