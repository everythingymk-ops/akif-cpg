import { PROMOTION_TYPES } from "@/lib/pricing-engine";
import { CHANNEL_ROUTES } from "@/lib/scenario/product";

/**
 * The spreadsheet product template: one definition that both writes the
 * workbook and drives the parser, so a field can never exist on the sheet
 * without the importer understanding it (or the reverse).
 *
 * Conventions the sheet itself repeats to the user:
 * - Percentages are entered as points — 40 means 40%. A cell the user has
 *   formatted as a percentage is understood too (Excel stores those as
 *   fractions); the parser is told which is which.
 * - Money is per unit, in the product's own currency, digits only.
 * - Blank means "use the app default"; only the two starred fields are
 *   required.
 */

export const TEMPLATE_FILENAME = "akif-cpg-product-template.xlsx";

export const SHEETS = {
  product: "Product",
  cogs: "COGS",
  assumptions: "Assumptions",
  promotions: "Promotions",
  help: "How to fill",
} as const;

export type FieldType = "text" | "money" | "percent" | "number" | "enum";

export interface TemplateField {
  /** Stable key the parser maps to; never shown to the user. */
  key: string;
  /** Column-A label. Matching is case- and space-insensitive and ignores "*". */
  label: string;
  type: FieldType;
  required?: boolean;
  /** Accepted values for `enum` fields; also becomes the cell's dropdown. */
  allowed?: readonly string[];
  note: string;
  /** Pre-filled in the downloaded template as a worked example. */
  example: string;
}

export interface TemplateColumn {
  key: string;
  label: string;
  type: FieldType;
  allowed?: readonly string[];
  note: string;
  /** Column width in characters. */
  width: number;
}

export const MARGIN_BASES = ["margin", "markup"] as const;
export const CURRENCIES = ["USD", "EUR", "GBP", "TRY", "CAD"] as const;
export const COGS_CATEGORIES = ["formula", "packaging", "manufacturing"] as const;
export const TRADE_SPEND_MODES = ["manual", "calendar"] as const;

export const ROUTE_CODES = Object.keys(CHANNEL_ROUTES) as (keyof typeof CHANNEL_ROUTES)[];
/** Dropdown entries like "B — Brand → Distributor → Retailer". */
export const ROUTE_CHOICES = ROUTE_CODES.map(
  (code) => `${code} — ${CHANNEL_ROUTES[code].label}`,
);

export const PROMOTION_TYPE_CHOICES = PROMOTION_TYPES.map((type) => type.label);

export const PRODUCT_FIELDS: readonly TemplateField[] = [
  {
    key: "name",
    label: "Product name *",
    type: "text",
    required: true,
    note: "Required. Shown across the app.",
    example: "Godiva Sticks",
  },
  {
    key: "sku",
    label: "SKU *",
    type: "text",
    required: true,
    note: "Required. Your own item code.",
    example: "GDV-STK-08",
  },
  { key: "brand", label: "Brand", type: "text", note: "", example: "Godiva" },
  { key: "category", label: "Category", type: "text", note: "", example: "Confectionery" },
  {
    key: "subcategory",
    label: "Subcategory",
    type: "text",
    note: "",
    example: "Premium chocolate",
  },
  { key: "unitSize", label: "Unit size", type: "text", note: "e.g. 88 g", example: "88 g" },
  {
    key: "countPerUnit",
    label: "Count / weight / volume",
    type: "text",
    note: "What one consumer unit contains.",
    example: "8 sticks",
  },
  {
    key: "casePack",
    label: "Case pack",
    type: "text",
    note: "Consumer units per case.",
    example: "12",
  },
  {
    key: "countryOfManufacture",
    label: "Country of manufacture",
    type: "text",
    note: "",
    example: "Türkiye",
  },
  {
    key: "currency",
    label: "Currency",
    type: "enum",
    allowed: CURRENCIES,
    note: "All money on every sheet is in this currency.",
    example: "USD",
  },
  { key: "targetMarket", label: "Target market", type: "text", note: "", example: "United States" },
  {
    key: "targetRetailer",
    label: "Target retailer",
    type: "text",
    note: "Optional.",
    example: "Target",
  },
  {
    // Typed as text on purpose: `allowed` still supplies the dropdown, but the
    // parser reads the leading letter, so someone who types just "B" — or
    // edits the arrow characters — is understood rather than rejected.
    key: "route",
    label: "Channel route",
    type: "text",
    allowed: ROUTE_CHOICES,
    note: "Decides which cost stages apply. The letter alone (B) is enough.",
    example: ROUTE_CHOICES[1],
  },
  {
    key: "currentSrpPerUnit",
    label: "Current shelf price",
    type: "money",
    note: "What it sells for today. Leave blank if it is not on shelf yet.",
    example: "5.99",
  },
  {
    key: "targetSrpPerUnit",
    label: "Target shelf price",
    type: "money",
    note: "What you would like it to sell for.",
    example: "6.49",
  },
];

export const ASSUMPTION_FIELDS: readonly TemplateField[] = [
  {
    key: "cogsPerUnit",
    label: "Finished COGS per unit",
    type: "money",
    note: "Only used when the COGS sheet is empty. Itemised rows always win.",
    example: "",
  },
  {
    key: "manufacturerMarginBasis",
    label: "Manufacturer margin basis",
    type: "enum",
    allowed: MARGIN_BASES,
    note: "margin = profit ÷ selling price. markup = profit ÷ cost. They are different prices.",
    example: "margin",
  },
  {
    key: "manufacturerMarginRate",
    label: "Manufacturer margin %",
    type: "percent",
    note: "The maker's own profit on top of COGS.",
    example: "22",
  },
  {
    key: "internationalFreightPerUnit",
    label: "International freight per unit",
    type: "money",
    note: "Leave blank when nothing is imported.",
    example: "0.08",
  },
  {
    key: "tariffRate",
    label: "Duty / tariff %",
    type: "percent",
    note: "Charged on the customs value.",
    example: "5.6",
  },
  {
    key: "domesticFreightPerUnit",
    label: "Domestic freight per unit",
    type: "money",
    note: "Port or factory to your warehouse.",
    example: "0.11",
  },
  {
    key: "brokerRate",
    label: "Broker %",
    type: "percent",
    note: "Commission on invoice, a variable cost.",
    example: "3",
  },
  {
    key: "deductionsRate",
    label: "Deductions %",
    type: "percent",
    note: "Returns, damages, early-payment discounts.",
    example: "1.5",
  },
  {
    key: "distributorMarginBasis",
    label: "Distributor margin basis",
    type: "enum",
    allowed: MARGIN_BASES,
    note: "Ignored on routes without a distributor.",
    example: "margin",
  },
  {
    key: "distributorMarginRate",
    label: "Distributor margin %",
    type: "percent",
    note: "",
    example: "15",
  },
  {
    key: "distributorHandlingFeePerUnit",
    label: "Distributor handling fee per unit",
    type: "money",
    note: "",
    example: "0.04",
  },
  {
    key: "retailerMarginBasis",
    label: "Retailer margin basis",
    type: "enum",
    allowed: MARGIN_BASES,
    note: "",
    example: "margin",
  },
  {
    key: "retailerMarginRate",
    label: "Retailer margin %",
    type: "percent",
    note: "The shop's own profit.",
    example: "40",
  },
  {
    key: "tradeSpendMode",
    label: "Trade spend mode",
    type: "enum",
    allowed: TRADE_SPEND_MODES,
    note: "Set to calendar automatically when the Promotions sheet has rows.",
    example: "calendar",
  },
  {
    key: "tradeSpendRate",
    label: "Manual trade spend %",
    type: "percent",
    note: "Used only in manual mode.",
    example: "",
  },
  {
    key: "additionalReserveRate",
    label: "Additional reserve %",
    type: "percent",
    note: "Cushion for unplanned discounts, on top of the calendar.",
    example: "2",
  },
  {
    key: "annualWeeks",
    label: "Planning horizon (weeks)",
    type: "number",
    note: "Usually 52.",
    example: "52",
  },
  {
    key: "targetContributionRate",
    label: "Target contribution margin %",
    type: "percent",
    note: "The profit you want to keep after everyone is paid.",
    example: "22",
  },
];

export const COGS_COLUMNS: readonly TemplateColumn[] = [
  {
    key: "name",
    label: "Component",
    type: "text",
    note: "What the cost is.",
    width: 34,
  },
  {
    key: "category",
    label: "Category",
    type: "enum",
    allowed: COGS_CATEGORIES,
    note: "Groups the total into material / packaging / manufacturing.",
    width: 18,
  },
  {
    key: "amountPerUnit",
    label: "Amount per unit",
    type: "money",
    note: "Cost of this line in one consumer unit.",
    width: 18,
  },
];

export const PROMOTION_COLUMNS: readonly TemplateColumn[] = [
  { key: "name", label: "Promotion", type: "text", note: "Your name for it.", width: 32 },
  {
    key: "type",
    label: "Mechanic",
    type: "enum",
    allowed: PROMOTION_TYPE_CHOICES,
    note: "How the discount is delivered.",
    width: 26,
  },
  {
    key: "weeks",
    label: "Total weeks",
    type: "number",
    note: "Total promoted weeks in the year, across all events.",
    width: 13,
  },
  {
    key: "discountRate",
    label: "Discount %",
    type: "percent",
    note: "Consumer discount while it runs.",
    width: 12,
  },
  {
    key: "brandFundingRate",
    label: "Brand funded %",
    type: "percent",
    note: "Your share of the discount. 100 = you fund all of it.",
    width: 15,
  },
  {
    key: "salesLift",
    label: "Sales lift x",
    type: "number",
    note: "Volume vs a normal week. 2 = twice as much.",
    width: 12,
  },
  {
    key: "events",
    label: "Events",
    type: "number",
    note: "Optional. Number of separate runs.",
    width: 10,
  },
  {
    key: "fixedEventFee",
    label: "Fixed fee per event",
    type: "money",
    note: "Optional. Flat charge per run.",
    width: 18,
  },
];

/** Worked example rows shipped in the template (the guide's product). */
export const EXAMPLE_COGS_ROWS: readonly string[][] = [
  ["Chocolate & cocoa mass", "formula", "0.62"],
  ["Filling & flavours", "formula", "0.18"],
  ["Box, film, tray", "packaging", "0.34"],
  ["Conversion & labour", "manufacturing", "0.26"],
  ["QC, waste, other", "manufacturing", "0.08"],
];

export const EXAMPLE_PROMOTION_ROWS: readonly string[][] = [
  ["Valentine's feature & display", "Feature + Display", "3", "30", "100", "3.0", "", ""],
  ["Holiday off-invoice", "Off Invoice", "5", "15", "100", "1.6", "", ""],
  ["Summer TPR", "Temporary Price Reduction", "4", "20", "50", "1.4", "", ""],
];

/** Lines of the "How to fill" sheet, in order. */
export const HELP_LINES: readonly string[] = [
  "Akif CPG — product template",
  "",
  "Fill this in, save it, then use “Upload filled template” on the Add product screen.",
  "Nothing is created until you review the result there.",
  "",
  "The rules",
  "• Only two cells are required: Product name and SKU, both on the Product sheet.",
  "• Every other cell may be left blank — blank means “use the app default”.",
  "• Percentages are entered as points: type 40 for 40%. If you prefer to format the",
  "  cell as a percentage and type 40%, that is understood too.",
  "• Money is per consumer unit, in the currency named on the Product sheet. Digits",
  "  only — no currency symbols.",
  "• Do not rename the sheets or edit the labels in the first column; that is how the",
  "  importer finds each value. Adding rows to the COGS and Promotions tables is fine.",
  "",
  "COGS",
  "• List the cost lines on the COGS sheet and the app adds them up.",
  "• If you already know the finished cost, leave that sheet empty and fill in",
  "  “Finished COGS per unit” on the Assumptions sheet instead.",
  "",
  "Promotions",
  "• Any row here switches trade spend to calendar mode and the rate is calculated",
  "  from the plan rather than guessed.",
  "• Leave the sheet empty to enter a single trade-spend percentage by hand.",
  "",
  "Margin vs markup",
  "• margin = profit ÷ selling price → price = cost ÷ (1 − margin)",
  "• markup = profit ÷ cost → price = cost × (1 + markup)",
  "• On a 8.00 cost, 20% margin is 10.00 and 20% markup is 9.60. Pick deliberately.",
  "",
  "The values already in the file are a worked example — overwrite them with yours.",
];
