import { describe, expect, it } from "vitest";
import { computeScenario } from "@/lib/scenario/computeScenario";
import { assumptionsForProduct } from "@/lib/scenario/product";
import { parseProductTemplate, type TemplateWorkbook } from "../parseTemplate";
import { SHEETS } from "../templateSchema";

/** Cell shorthand: `c("40")` plain, `pct(0.4)` percent-formatted. */
const c = (value: string | number | boolean | null) => ({ value });
const pct = (value: number) => ({ value, percentFormatted: true });

const row = (...cells: (string | number | boolean | null)[]) => cells.map(c);

/** A workbook with just the two required cells; tests add what they need. */
function minimalWorkbook(extraProductRows: ReturnType<typeof row>[] = []): TemplateWorkbook {
  return {
    [SHEETS.product]: [
      row("Field", "Value", "Notes"),
      row("Product name *", "Godiva Sticks"),
      row("SKU *", "GDV-STK-08"),
      ...extraProductRows,
    ],
  };
}

describe("parseProductTemplate — required fields", () => {
  it("reads a minimal sheet", () => {
    const result = parseProductTemplate(minimalWorkbook());
    expect(result.product).not.toBeNull();
    expect(result.product!.basics.name).toBe("Godiva Sticks");
    expect(result.product!.basics.sku).toBe("GDV-STK-08");
    expect(result.summary.productName).toBe("Godiva Sticks");
  });

  it("refuses to build a product when the name is missing, and says where to look", () => {
    const result = parseProductTemplate({
      [SHEETS.product]: [row("Field", "Value"), row("SKU *", "GDV-STK-08")],
    });
    expect(result.product).toBeNull();
    const error = result.issues.find((issue) => issue.severity === "error");
    expect(error?.location).toContain("Product name");
  });

  it("reports a file that is not the template at all", () => {
    const result = parseProductTemplate({ Sheet1: [row("hello")] });
    expect(result.product).toBeNull();
    expect(result.issues[0].message).toMatch(/no "Product" sheet/i);
  });

  it("tolerates edited labels: case, spacing and the asterisk", () => {
    const result = parseProductTemplate({
      [SHEETS.product]: [row("PRODUCT   NAME:", "Kombucha"), row("sku", "KMB-1")],
    });
    expect(result.product?.basics.name).toBe("Kombucha");
    expect(result.product?.basics.sku).toBe("KMB-1");
  });
});

describe("parseProductTemplate — percentages", () => {
  const withRetailerMargin = (cell: { value: unknown; percentFormatted?: boolean }) =>
    parseProductTemplate({
      ...minimalWorkbook(),
      [SHEETS.assumptions]: [
        row("Field", "Value"),
        [c("Retailer margin %"), cell as never],
      ],
    });

  it("reads points as points", () => {
    expect(withRetailerMargin(c(40)).product?.assumptionOverrides?.retailerMarginRate).toBe("0.4");
  });

  it("reads a percent-formatted cell as the fraction Excel stored", () => {
    // The trap: Excel keeps 40% as 0.4. Dividing again would give 0.4%.
    expect(withRetailerMargin(pct(0.4)).product?.assumptionOverrides?.retailerMarginRate).toBe("0.4");
  });

  it("reads typed text with a percent sign", () => {
    expect(withRetailerMargin(c("40%")).product?.assumptionOverrides?.retailerMarginRate).toBe("0.4");
  });

  it("reads a decimal comma, as Turkish Excel writes it", () => {
    expect(withRetailerMargin(c("37,5")).product?.assumptionOverrides?.retailerMarginRate).toBe("0.375");
  });

  it("keeps the default and warns on nonsense instead of importing garbage", () => {
    const result = withRetailerMargin(c("about a third"));
    expect(result.product?.assumptionOverrides?.retailerMarginRate).toBeUndefined();
    expect(result.issues.some((i) => i.location.includes("Retailer margin"))).toBe(true);
  });

  it("flags a rate above 100% rather than silently accepting it", () => {
    const result = withRetailerMargin(c(400));
    expect(result.issues.some((i) => /check whether that is what you meant/.test(i.message))).toBe(true);
  });

  it("rescues points typed into a cell that was later formatted as a percentage", () => {
    // Excel would mean 2500% here. No margin field can, so it reads 25% and
    // says what it did — this is what a column formatted after typing looks like.
    const result = withRetailerMargin(pct(25));
    expect(result.product?.assumptionOverrides?.retailerMarginRate).toBe("0.25");
    expect(result.issues.some((i) => /formatted as a percentage but holds 25/.test(i.message))).toBe(
      true,
    );
  });

  it("still trusts a percent-formatted 100% funding rate", () => {
    // 1 is a legitimate fraction, so it must not be rescued down to 1%.
    const result = parseProductTemplate({
      ...minimalWorkbook(),
      [SHEETS.assumptions]: [row("Field", "Value"), [c("Retailer margin %"), pct(1)]],
    });
    expect(result.product?.assumptionOverrides?.retailerMarginRate).toBe("1");
  });
});

describe("parseProductTemplate — money", () => {
  const withFreight = (raw: string | number) =>
    parseProductTemplate({
      ...minimalWorkbook(),
      [SHEETS.assumptions]: [row("Field", "Value"), row("International freight per unit", raw)],
    });

  it("strips currency symbols and spaces", () => {
    expect(withFreight("$ 0.08").product?.assumptionOverrides?.internationalFreightPerUnit).toBe("0.08");
  });

  it("reads a decimal comma", () => {
    expect(withFreight("0,08").product?.assumptionOverrides?.internationalFreightPerUnit).toBe("0.08");
  });

  it("does not turn a thousands separator into a decimal", () => {
    expect(withFreight("1,480").product?.assumptionOverrides?.internationalFreightPerUnit).toBe("1480");
  });
});

describe("parseProductTemplate — COGS sheet", () => {
  const cogsSheet = (...rows: ReturnType<typeof row>[]) => ({
    ...minimalWorkbook(),
    [SHEETS.cogs]: [row("Component", "Category", "Amount per unit"), ...rows],
  });

  it("switches to detailed mode and keeps the lines in order", () => {
    const result = parseProductTemplate(
      cogsSheet(
        row("Chocolate & cocoa mass", "formula", "0.62"),
        row("Box, film, tray", "packaging", 0.34),
      ),
    );
    expect(result.product?.cogsMode).toBe("detailed");
    expect(result.product?.cogsComponents).toEqual([
      { name: "Chocolate & cocoa mass", category: "formula", amountPerUnit: "0.62" },
      { name: "Box, film, tray", category: "packaging", amountPerUnit: "0.34" },
    ]);
    expect(result.summary.cogsComponents).toBe(2);
  });

  it("skips blank spacer rows without complaining", () => {
    const result = parseProductTemplate(
      cogsSheet(row("Cocoa", "formula", "0.62"), row("", "", ""), row(null, null, null)),
    );
    expect(result.product?.cogsComponents).toHaveLength(1);
    expect(result.issues).toHaveLength(0);
  });

  it("skips a line with no amount and names it in the warning", () => {
    const result = parseProductTemplate(cogsSheet(row("Mystery cost", "formula", "tbd")));
    expect(result.product?.cogsComponents).toHaveLength(0);
    expect(result.issues.some((i) => i.message.includes("Mystery cost"))).toBe(true);
  });

  it("defaults an unknown category to formula and says so", () => {
    const result = parseProductTemplate(cogsSheet(row("Cocoa", "ingredients", "0.62")));
    expect(result.product?.cogsComponents[0].category).toBe("formula");
    expect(result.issues.some((i) => i.message.includes("ingredients"))).toBe(true);
  });

  it("falls back to the finished COGS when the sheet is empty", () => {
    const result = parseProductTemplate({
      ...minimalWorkbook(),
      [SHEETS.assumptions]: [row("Field", "Value"), row("Finished COGS per unit", "1.48")],
    });
    expect(result.product?.cogsMode).toBe("simple");
    expect(result.product?.simpleCogsPerUnit).toBe("1.48");
  });

  it("warns when both are given, and the itemised lines win", () => {
    const result = parseProductTemplate({
      ...cogsSheet(row("Cocoa", "formula", "0.62")),
      [SHEETS.assumptions]: [row("Field", "Value"), row("Finished COGS per unit", "9.99")],
    });
    expect(result.product?.cogsMode).toBe("detailed");
    expect(result.issues.some((i) => i.message.includes("Ignored"))).toBe(true);
  });

  it("warns when there is no cost information at all", () => {
    const result = parseProductTemplate(minimalWorkbook());
    expect(result.issues.some((i) => i.message.includes("start at zero cost"))).toBe(true);
  });
});

describe("parseProductTemplate — promotions sheet", () => {
  const promoSheet = (...rows: ReturnType<typeof row>[]) => ({
    ...minimalWorkbook(),
    [SHEETS.promotions]: [
      row(
        "Promotion",
        "Mechanic",
        "Total weeks",
        "Discount %",
        "Brand funded %",
        "Sales lift x",
        "Events",
        "Fixed fee per event",
      ),
      ...rows,
    ],
  });

  it("reads a row and turns the sheet into calendar mode", () => {
    const result = parseProductTemplate(
      promoSheet(row("Valentine's", "Feature + Display", 3, 30, 100, 3)),
    );
    expect(result.product?.assumptionOverrides?.tradeSpendMode).toBe("calendar");
    expect(result.product?.assumptionOverrides?.promotions).toEqual([
      {
        id: "import-1",
        name: "Valentine's",
        type: "featureAndDisplay",
        weeks: "3",
        discountRate: "0.3",
        brandFundingRate: "1",
        salesLift: "3",
      },
    ]);
  });

  it("accepts the internal key as well as the label", () => {
    const result = parseProductTemplate(promoSheet(row("Holiday", "offInvoice", 5, 15, 100, 1.6)));
    expect(result.product?.assumptionOverrides?.promotions?.[0].type).toBe("offInvoice");
  });

  it("records an unknown mechanic as Other and warns", () => {
    const result = parseProductTemplate(promoSheet(row("Mystery", "skywriting", 2, 10, 100, 1.2)));
    expect(result.product?.assumptionOverrides?.promotions?.[0].type).toBe("other");
    expect(result.issues.some((i) => i.message.includes("skywriting"))).toBe(true);
  });

  it("defaults brand funding to 100% when the column is blank", () => {
    const result = parseProductTemplate(promoSheet(row("Simple", "Off Invoice", 4, 10, "", 1.2)));
    expect(result.product?.assumptionOverrides?.promotions?.[0].brandFundingRate).toBe("1");
  });

  it("carries the optional event columns only when filled", () => {
    const result = parseProductTemplate(
      promoSheet(row("Display", "Display", 2, 10, 100, 1.5, 2, "250")),
    );
    const promotion = result.product!.assumptionOverrides!.promotions![0];
    expect(promotion.events).toBe("2");
    expect(promotion.fixedEventFee).toBe("250");
  });

  it("overrides a manual mode cell and explains why", () => {
    const result = parseProductTemplate({
      ...promoSheet(row("Holiday", "Off Invoice", 5, 15, 100, 1.6)),
      [SHEETS.assumptions]: [row("Field", "Value"), row("Trade spend mode", "manual")],
    });
    expect(result.product?.assumptionOverrides?.tradeSpendMode).toBe("calendar");
    expect(result.issues.some((i) => i.message.includes("using the calendar"))).toBe(true);
  });
});

describe("parseProductTemplate — route and enums", () => {
  it("accepts the bare route letter", () => {
    const result = parseProductTemplate(minimalWorkbook([row("Channel route", "A")]));
    expect(result.product?.route).toBe("A");
  });

  it("accepts the full dropdown text", () => {
    const result = parseProductTemplate(
      minimalWorkbook([row("Channel route", "C — Manufacturer → Brand → Distributor → Retailer")]),
    );
    expect(result.product?.route).toBe("C");
  });

  it("falls back to B and warns on an unknown route", () => {
    const result = parseProductTemplate(minimalWorkbook([row("Channel route", "Z")]));
    expect(result.product?.route).toBe("B");
    expect(result.issues.some((i) => i.message.includes("not a known route"))).toBe(true);
  });

  it("keeps the default currency and warns when the code is unknown", () => {
    const result = parseProductTemplate(minimalWorkbook([row("Currency", "XYZ")]));
    expect(result.product?.basics.currency).toBe("USD");
    expect(result.issues.some((i) => i.location.includes("Currency"))).toBe(true);
  });

  it("matches a margin basis regardless of case", () => {
    const result = parseProductTemplate({
      ...minimalWorkbook(),
      [SHEETS.assumptions]: [row("Field", "Value"), row("Retailer margin basis", "Markup")],
    });
    expect(result.product?.assumptionOverrides?.retailerMarginBasis).toBe("markup");
  });
});

describe("parseProductTemplate — end to end", () => {
  /** The template's own worked example must price without hand-editing. */
  it("produces a product the engine can price", () => {
    const workbook: TemplateWorkbook = {
      [SHEETS.product]: [
        row("Field", "Value"),
        row("Product name *", "Godiva Sticks"),
        row("SKU *", "GDV-STK-08"),
        row("Channel route", "B — Brand → Distributor → Retailer"),
        row("Current shelf price", "5.99"),
        row("Target shelf price", "6.49"),
      ],
      [SHEETS.cogs]: [
        row("Component", "Category", "Amount per unit"),
        row("Chocolate & cocoa mass", "formula", "0.62"),
        row("Filling & flavours", "formula", "0.18"),
        row("Box, film, tray", "packaging", "0.34"),
        row("Conversion & labour", "manufacturing", "0.26"),
        row("QC, waste, other", "manufacturing", "0.08"),
      ],
      [SHEETS.assumptions]: [
        row("Field", "Value"),
        row("Manufacturer margin basis", "margin"),
        row("Manufacturer margin %", "22"),
        row("International freight per unit", "0.08"),
        row("Duty / tariff %", "5.6"),
        row("Domestic freight per unit", "0.11"),
        row("Broker %", "3"),
        row("Deductions %", "1.5"),
        row("Distributor margin basis", "margin"),
        row("Distributor margin %", "15"),
        row("Distributor handling fee per unit", "0.04"),
        row("Retailer margin basis", "margin"),
        row("Retailer margin %", "40"),
        row("Additional reserve %", "2"),
        row("Planning horizon (weeks)", "52"),
        row("Target contribution margin %", "22"),
      ],
      [SHEETS.promotions]: [
        row("Promotion", "Mechanic", "Total weeks", "Discount %", "Brand funded %", "Sales lift x"),
        row("Valentine's feature & display", "Feature + Display", 3, 30, 100, 3),
        row("Holiday off-invoice", "Off Invoice", 5, 15, 100, 1.6),
        row("Summer TPR", "Temporary Price Reduction", 4, 20, 50, 1.4),
      ],
    };

    const result = parseProductTemplate(workbook);
    expect(result.issues.filter((i) => i.severity === "error")).toHaveLength(0);

    const computed = computeScenario(
      assumptionsForProduct({ id: "from-template", ...result.product! }),
    );
    expect(computed.ok).toBe(true);
    if (!computed.ok) return;

    // Same inputs as the shipped example, so the same headline figures.
    expect(computed.scenario.landed.landedCostPerUnit.toFixed(2)).toBe("2.19");
    expect(computed.scenario.requiredSrpPerUnit.toFixed(2)).toBe("6.51");
    expect(computed.scenario.tradeSpend.totalRate.times(100).toFixed(2)).toBe("9.12");
  });
});
