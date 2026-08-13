import {
  PROMOTION_TYPES,
  type CogsComponent,
  type Promotion,
  type PromotionType,
} from "@/lib/pricing-engine";
import type { ScenarioAssumptions } from "@/lib/scenario/assumptions";
import {
  CHANNEL_ROUTES,
  type ChannelRoute,
  type ProductBasics,
  type ProductSetup,
} from "@/lib/scenario/product";
import {
  ASSUMPTION_FIELDS,
  COGS_COLUMNS,
  PRODUCT_FIELDS,
  PROMOTION_COLUMNS,
  SHEETS,
  type TemplateColumn,
  type TemplateField,
} from "./templateSchema";

/**
 * Pure reader for the product template (`templateSchema.ts`). Takes the plain
 * cell matrices a workbook reader produced and returns a ProductSetup plus a
 * list of everything it could not use — nothing is ever dropped silently, and
 * a single bad cell never costs the user the rest of the file.
 *
 * Kept free of any spreadsheet library so it is testable in plain node; the
 * exceljs glue lives in `workbook.ts`.
 */

export interface TemplateCell {
  value: string | number | boolean | null | undefined;
  /**
   * True when the source cell was formatted as a percentage. Excel stores
   * those as fractions (40% → 0.4), so the reader must not divide again.
   */
  percentFormatted?: boolean;
}

export type TemplateSheet = TemplateCell[][];
export type TemplateWorkbook = Record<string, TemplateSheet>;

export interface TemplateIssue {
  severity: "error" | "warning";
  /** Where the user should look, e.g. `Assumptions · Retailer margin %`. */
  location: string;
  message: string;
}

export interface TemplateParseResult {
  /** Null when a required field is missing — the import cannot proceed. */
  product: Omit<ProductSetup, "id"> | null;
  issues: TemplateIssue[];
  summary: {
    productName: string;
    sku: string;
    cogsComponents: number;
    promotions: number;
    /** Fields that carried a value, so the user can see what was picked up. */
    assumptionsRead: number;
  };
}

const EMPTY_BASICS: ProductBasics = {
  name: "",
  sku: "",
  brand: "",
  category: "",
  subcategory: "",
  unitSize: "",
  countPerUnit: "",
  casePack: "",
  countryOfManufacture: "",
  currency: "USD",
  targetMarket: "",
  targetRetailer: "",
};

/** Labels are matched loosely: case, spacing, "*" and trailing ":" don't matter. */
function normalizeLabel(raw: string): string {
  return raw
    .replace(/\*/g, "")
    .replace(/:/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cellText(cell: TemplateCell | undefined): string {
  if (cell === undefined || cell.value === null || cell.value === undefined) return "";
  if (typeof cell.value === "boolean") return cell.value ? "yes" : "no";
  return String(cell.value).trim();
}

function isBlank(cell: TemplateCell | undefined): boolean {
  return cellText(cell) === "";
}

/**
 * Money and plain numbers. Tolerates currency symbols, thin spaces and a
 * decimal comma (Turkish Excel writes 1,48) — but only when the comma is
 * unambiguous, so "1,480" stays one thousand four hundred and eighty.
 */
function parseNumeric(raw: string): number | null {
  const cleaned = raw.replace(/[$€£₺\s ]/g, "");
  if (cleaned === "") return null;
  const commas = (cleaned.match(/,/g) ?? []).length;
  const normalized =
    commas === 1 && !cleaned.includes(".") && /,\d{1,2}$/.test(cleaned)
      ? cleaned.replace(",", ".")
      : cleaned.replace(/,/g, "");
  if (!/^-?\d*\.?\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Percentages arrive three ways: as points (40), as a percent-formatted cell
 * (0.4 with the flag set), or as text ("40%"). All become a decimal fraction.
 *
 * `corrected` marks the one ambiguous case: a percent-formatted cell holding
 * more than 1. Taken at face value that is a rate of 2500%, which no field
 * here can mean, so it is read as points — that combination shows up whenever
 * a column was formatted as a percentage after the points were typed.
 */
function parsePercent(
  cell: TemplateCell,
): { rate: number; corrected?: boolean } | { error: string } {
  const raw = cellText(cell);
  const hasSign = raw.includes("%");
  const numeric = parseNumeric(raw.replace(/%/g, ""));
  if (numeric === null) return { error: `"${raw}" is not a number` };
  if (cell.percentFormatted && !hasSign) {
    return numeric > 1 ? { rate: numeric / 100, corrected: true } : { rate: numeric };
  }
  return { rate: numeric / 100 };
}

/** Decimal string without trailing zero noise, the shape assumptions use. */
function rateToString(rate: number): string {
  return String(Number(rate.toFixed(6)));
}

function matchEnum(raw: string, allowed: readonly string[]): string | null {
  const target = normalizeLabel(raw);
  return allowed.find((option) => normalizeLabel(option) === target) ?? null;
}

/** Reads a `Field | Value | Notes` sheet into a label-keyed map. */
function readKeyValueSheet(sheet: TemplateSheet | undefined): Map<string, TemplateCell> {
  const map = new Map<string, TemplateCell>();
  for (const row of sheet ?? []) {
    const label = cellText(row[0]);
    if (label === "") continue;
    map.set(normalizeLabel(label), row[1] ?? { value: null });
  }
  return map;
}

/** Finds a table's header row and returns the column index for each key. */
function readTableColumns(
  sheet: TemplateSheet | undefined,
  columns: readonly TemplateColumn[],
): { headerIndex: number; indexByKey: Map<string, number> } | null {
  const wanted = normalizeLabel(columns[0].label);
  const headerIndex = (sheet ?? []).findIndex((row) =>
    row.some((cell) => normalizeLabel(cellText(cell)) === wanted),
  );
  if (headerIndex === -1) return null;
  const header = sheet![headerIndex];
  const indexByKey = new Map<string, number>();
  for (const column of columns) {
    const index = header.findIndex(
      (cell) => normalizeLabel(cellText(cell)) === normalizeLabel(column.label),
    );
    if (index !== -1) indexByKey.set(column.key, index);
  }
  return { headerIndex, indexByKey };
}

interface FieldReader {
  sheetName: string;
  values: Map<string, TemplateCell>;
  issues: TemplateIssue[];
}

/** Reads one schema field, recording an issue instead of throwing on bad input. */
function readField(reader: FieldReader, field: TemplateField): string | null {
  const cell = reader.values.get(normalizeLabel(field.label));
  if (cell === undefined || isBlank(cell)) return null;
  const location = `${reader.sheetName} · ${field.label.replace(" *", "")}`;
  const raw = cellText(cell);

  switch (field.type) {
    case "text":
      return raw;
    case "enum": {
      const matched = matchEnum(raw, field.allowed ?? []);
      if (matched === null) {
        reader.issues.push({
          severity: "warning",
          location,
          message: `"${raw}" is not one of: ${(field.allowed ?? []).join(", ")}. Left at the default.`,
        });
        return null;
      }
      return matched;
    }
    case "percent": {
      const parsed = parsePercent(cell);
      if ("error" in parsed) {
        reader.issues.push({ severity: "warning", location, message: `${parsed.error}. Left at the default.` });
        return null;
      }
      if (parsed.corrected === true) {
        reader.issues.push({
          severity: "warning",
          location,
          message: `The cell is formatted as a percentage but holds ${raw}, so it was read as ${raw}% rather than ${Math.round(Number(raw) * 100)}%.`,
        });
      } else if (parsed.rate > 1) {
        reader.issues.push({
          severity: "warning",
          location,
          message: `${raw} reads as ${Math.round(parsed.rate * 100)}% — check whether that is what you meant.`,
        });
      }
      return rateToString(parsed.rate);
    }
    case "money":
    case "number": {
      const parsed = parseNumeric(raw);
      if (parsed === null) {
        reader.issues.push({
          severity: "warning",
          location,
          message: `"${raw}" is not a number. Left at the default.`,
        });
        return null;
      }
      return String(parsed);
    }
  }
}

function parseRoute(raw: string | null, issues: TemplateIssue[]): ChannelRoute {
  if (raw === null) return "B";
  const code = raw.trim().charAt(0).toUpperCase();
  if (code in CHANNEL_ROUTES) return code as ChannelRoute;
  issues.push({
    severity: "warning",
    location: `${SHEETS.product} · Channel route`,
    message: `"${raw}" is not a known route. Using B (Brand → Distributor → Retailer).`,
  });
  return "B";
}

function parseCogsRows(
  sheet: TemplateSheet | undefined,
  issues: TemplateIssue[],
): CogsComponent[] {
  const table = readTableColumns(sheet, COGS_COLUMNS);
  if (table === null) return [];
  const components: CogsComponent[] = [];

  for (let rowIndex = table.headerIndex + 1; rowIndex < (sheet ?? []).length; rowIndex++) {
    const row = sheet![rowIndex];
    const cellFor = (key: string) => row[table.indexByKey.get(key) ?? -1];
    const name = cellText(cellFor("name"));
    const amountCell = cellFor("amountPerUnit");
    if (name === "" && isBlank(amountCell)) continue; // spacer row

    const location = `${SHEETS.cogs} · row ${rowIndex + 1}`;
    const amount = parseNumeric(cellText(amountCell));
    if (name === "") {
      issues.push({ severity: "warning", location, message: "No component name — row skipped." });
      continue;
    }
    if (amount === null) {
      issues.push({
        severity: "warning",
        location,
        message: `"${name}" has no usable amount ("${cellText(amountCell)}") — row skipped.`,
      });
      continue;
    }

    const rawCategory = cellText(cellFor("category"));
    const category = rawCategory === "" ? "formula" : matchEnum(rawCategory, COGS_COLUMNS[1].allowed ?? []);
    if (rawCategory !== "" && category === null) {
      issues.push({
        severity: "warning",
        location,
        message: `Category "${rawCategory}" is not known — counted as formula.`,
      });
    }
    components.push({
      name,
      category: (category ?? "formula") as CogsComponent["category"],
      amountPerUnit: String(amount),
    });
  }
  return components;
}

function parsePromotionRows(
  sheet: TemplateSheet | undefined,
  issues: TemplateIssue[],
): Promotion[] {
  const table = readTableColumns(sheet, PROMOTION_COLUMNS);
  if (table === null) return [];
  const promotions: Promotion[] = [];

  for (let rowIndex = table.headerIndex + 1; rowIndex < (sheet ?? []).length; rowIndex++) {
    const row = sheet![rowIndex];
    const cellFor = (key: string) => row[table.indexByKey.get(key) ?? -1];
    const name = cellText(cellFor("name"));
    const weeksCell = cellFor("weeks");
    if (name === "" && isBlank(weeksCell)) continue;

    const location = `${SHEETS.promotions} · row ${rowIndex + 1}`;
    const weeks = parseNumeric(cellText(weeksCell));
    if (weeks === null) {
      issues.push({
        severity: "warning",
        location,
        message: `"${name || "unnamed row"}" has no usable week count — row skipped.`,
      });
      continue;
    }

    const rawType = cellText(cellFor("type"));
    const matchedLabel = rawType === "" ? null : matchEnum(rawType, PROMOTION_TYPES.map((t) => t.label));
    const byKey = PROMOTION_TYPES.find((t) => normalizeLabel(t.value) === normalizeLabel(rawType));
    const type: PromotionType =
      PROMOTION_TYPES.find((t) => t.label === matchedLabel)?.value ?? byKey?.value ?? "other";
    if (rawType !== "" && matchedLabel === null && byKey === undefined) {
      issues.push({
        severity: "warning",
        location,
        message: `Mechanic "${rawType}" is not known — recorded as Other.`,
      });
    }

    const percentOr = (key: string, fallback: string): string => {
      const cell = cellFor(key);
      if (cell === undefined || isBlank(cell)) return fallback;
      const parsed = parsePercent(cell);
      if ("error" in parsed) {
        issues.push({ severity: "warning", location, message: `${parsed.error} — used ${fallback}.` });
        return fallback;
      }
      return rateToString(parsed.rate);
    };
    const numberOr = (key: string, fallback: string): string => {
      const raw = cellText(cellFor(key));
      if (raw === "") return fallback;
      const parsed = parseNumeric(raw);
      if (parsed === null) {
        issues.push({ severity: "warning", location, message: `"${raw}" is not a number — used ${fallback}.` });
        return fallback;
      }
      return String(parsed);
    };

    const promotion: Promotion = {
      id: `import-${rowIndex}`,
      name: name || `Promotion ${promotions.length + 1}`,
      type,
      weeks: String(weeks),
      discountRate: percentOr("discountRate", "0"),
      brandFundingRate: percentOr("brandFundingRate", "1"),
      salesLift: numberOr("salesLift", "1"),
    };
    const events = cellText(cellFor("events"));
    if (events !== "") promotion.events = numberOr("events", "1");
    const fee = cellText(cellFor("fixedEventFee"));
    if (fee !== "") promotion.fixedEventFee = numberOr("fixedEventFee", "0");

    promotions.push(promotion);
  }
  return promotions;
}

export function parseProductTemplate(workbook: TemplateWorkbook): TemplateParseResult {
  const issues: TemplateIssue[] = [];

  const productReader: FieldReader = {
    sheetName: SHEETS.product,
    values: readKeyValueSheet(workbook[SHEETS.product]),
    issues,
  };
  const assumptionReader: FieldReader = {
    sheetName: SHEETS.assumptions,
    values: readKeyValueSheet(workbook[SHEETS.assumptions]),
    issues,
  };

  if (productReader.values.size === 0) {
    issues.push({
      severity: "error",
      location: SHEETS.product,
      message: `No "${SHEETS.product}" sheet found. Use the downloaded template as your starting point.`,
    });
    return {
      product: null,
      issues,
      summary: { productName: "", sku: "", cogsComponents: 0, promotions: 0, assumptionsRead: 0 },
    };
  }

  const productValues = new Map<string, string>();
  for (const field of PRODUCT_FIELDS) {
    const value = readField(productReader, field);
    if (value !== null) productValues.set(field.key, value);
    if (field.required && (value === null || value === "")) {
      issues.push({
        severity: "error",
        location: `${SHEETS.product} · ${field.label.replace(" *", "")}`,
        message: "This one is required — the product cannot be created without it.",
      });
    }
  }

  const assumptionValues = new Map<string, string>();
  for (const field of ASSUMPTION_FIELDS) {
    const value = readField(assumptionReader, field);
    if (value !== null) assumptionValues.set(field.key, value);
  }

  const cogsComponents = parseCogsRows(workbook[SHEETS.cogs], issues);
  const promotions = parsePromotionRows(workbook[SHEETS.promotions], issues);

  const summary = {
    productName: productValues.get("name") ?? "",
    sku: productValues.get("sku") ?? "",
    cogsComponents: cogsComponents.length,
    promotions: promotions.length,
    assumptionsRead: assumptionValues.size,
  };

  if (issues.some((issue) => issue.severity === "error")) {
    return { product: null, issues, summary };
  }

  const route = parseRoute(productValues.get("route") ?? null, issues);
  const basics: ProductBasics = {
    ...EMPTY_BASICS,
    ...Object.fromEntries(
      [...productValues].filter(
        ([key]) => key in EMPTY_BASICS && key !== "route",
      ),
    ),
  } as ProductBasics;

  const overrides: Partial<ScenarioAssumptions> = {};
  const assign = <K extends keyof ScenarioAssumptions>(key: K, value: ScenarioAssumptions[K]) => {
    overrides[key] = value;
  };
  for (const [key, value] of assumptionValues) {
    if (key === "cogsPerUnit") continue; // handled with the COGS mode below
    assign(key as keyof ScenarioAssumptions, value as never);
  }
  for (const key of ["currentSrpPerUnit", "targetSrpPerUnit"] as const) {
    const value = productValues.get(key);
    if (value !== undefined) assign(key, value);
  }

  // A filled Promotions sheet is itself the instruction to use calendar mode:
  // the plan is stronger evidence than a mode cell the user may not have read.
  if (promotions.length > 0) {
    assign("promotions", promotions);
    assign("tradeSpendMode", "calendar");
    if (assumptionValues.get("tradeSpendMode") === "manual") {
      issues.push({
        severity: "warning",
        location: `${SHEETS.assumptions} · Trade spend mode`,
        message: `Set to manual, but the ${SHEETS.promotions} sheet has ${promotions.length} row(s) — using the calendar.`,
      });
    }
  }

  const simpleCogs = assumptionValues.get("cogsPerUnit") ?? "";
  const useDetailed = cogsComponents.length > 0;
  if (!useDetailed && simpleCogs === "") {
    issues.push({
      severity: "warning",
      location: SHEETS.cogs,
      message: "No cost lines and no finished COGS — the product will start at zero cost.",
    });
  }
  if (useDetailed && simpleCogs !== "") {
    issues.push({
      severity: "warning",
      location: `${SHEETS.assumptions} · Finished COGS per unit`,
      message: `Ignored because the ${SHEETS.cogs} sheet has ${cogsComponents.length} line(s).`,
    });
  }

  return {
    product: {
      basics,
      structure: route === "E" ? "privateLabelManufacturer" : "contractManufacturerBrand",
      route,
      cogsMode: useDetailed ? "detailed" : "simple",
      simpleCogsPerUnit: simpleCogs,
      cogsComponents,
      assumptionOverrides: overrides,
    },
    issues,
    summary,
  };
}
