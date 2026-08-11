import {
  DEFAULT_TRADE_SPEND_SENSITIVITY_RATES,
  computeSensitivityTable,
} from "@/lib/pricing-engine";
import type { ScenarioAssumptions } from "./assumptions";
import type { ComputedScenario } from "./computeScenario";
import { formatMoney, formatPercent } from "./format";
import { CHANNEL_ROUTES, type ProductSetup } from "./product";
import { describeAssumptions } from "./scenarios";

/**
 * CSV export (PRD §69): inputs, assumptions, waterfall, promotions, trade
 * spend, calculated outputs and the trade-spend sensitivity table — one file
 * Excel opens directly (UTF-8 BOM, CRLF). Pure string builder; the browser
 * download happens at the call site.
 */

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function row(...cells: string[]): string {
  return cells.map(csvCell).join(",");
}

export interface ScenarioExportInput {
  product: ProductSetup;
  scenarioName: string;
  assumptions: ScenarioAssumptions;
  computed: ComputedScenario;
  /** ISO timestamp stamped by the caller. */
  generatedAt: string;
}

export function buildScenarioExportCsv(input: ScenarioExportInput): string {
  const { product, scenarioName, assumptions, computed, generatedAt } = input;
  const lines: string[] = [];

  lines.push(row("Akif CPG — Pricing Export"));
  lines.push(row("Product", product.basics.name));
  lines.push(row("SKU", product.basics.sku));
  lines.push(row("Scenario", scenarioName));
  lines.push(row("Route", `${product.route} — ${CHANNEL_ROUTES[product.route].label}`));
  lines.push(row("Generated", generatedAt));
  lines.push("");

  lines.push(row("ASSUMPTIONS"));
  lines.push(row("Field", "Value"));
  for (const { label, value } of describeAssumptions(assumptions)) {
    lines.push(row(label, value));
  }
  lines.push("");

  lines.push(row("PRICE WATERFALL"));
  lines.push(row("Stage", "Per unit", "Step vs previous"));
  for (const stage of computed.waterfall) {
    lines.push(
      row(stage.label, formatMoney(stage.value), stage.delta ? formatMoney(stage.delta) : ""),
    );
  }
  lines.push("");

  if (assumptions.promotions.length > 0) {
    lines.push(row("PROMOTIONS"));
    lines.push(
      row(
        "Name",
        "Type",
        "Weeks",
        "Events",
        "Discount",
        "Sales lift",
        "Brand funded",
        "Fixed event fee",
        "Additional cost",
        "Estimated units",
      ),
    );
    for (const promotion of assumptions.promotions) {
      lines.push(
        row(
          promotion.name,
          promotion.type,
          String(promotion.weeks ?? ""),
          String(promotion.events ?? ""),
          String(promotion.discountRate ?? ""),
          String(promotion.salesLift ?? ""),
          String(promotion.brandFundingRate ?? ""),
          String(promotion.fixedEventFee ?? ""),
          String(promotion.additionalCost ?? ""),
          String(promotion.estimatedUnits ?? ""),
        ),
      );
    }
    lines.push("");
  }

  lines.push(row("TRADE SPEND"));
  lines.push(row("Mode", computed.tradeSpend.mode));
  lines.push(row("Promotional rate", formatPercent(computed.tradeSpend.promotionalRate, 2)));
  lines.push(row("Additional reserve", formatPercent(computed.tradeSpend.reserveRate, 2)));
  lines.push(row("Total planned trade spend", formatPercent(computed.tradeSpend.totalRate, 2)));
  if (computed.tradeSpend.band) {
    lines.push(row("Planning band", computed.tradeSpend.band.label));
  }
  lines.push("");

  lines.push(row("OUTPUTS"));
  lines.push(row("Manufacturer sell price", formatMoney(computed.manufacturer.sellPricePerUnit)));
  lines.push(row("Brand landed cost", formatMoney(computed.landed.landedCostPerUnit)));
  lines.push(row("Required brand invoice", formatMoney(computed.requiredInvoicePerUnit)));
  lines.push(row("Retailer cost @ required", formatMoney(computed.retailerAcquisitionAtRequired)));
  lines.push(row("Required SRP", formatMoney(computed.requiredSrpPerUnit)));
  lines.push(row("Brand gross margin", formatPercent(computed.brandGrossMarginRate, 1)));
  if (computed.atCurrentSrp) {
    lines.push(row("Current SRP", formatMoney(computed.atCurrentSrp.srpPerUnit)));
    lines.push(
      row("Implied brand invoice @ current", formatMoney(computed.atCurrentSrp.impliedInvoicePerUnit)),
    );
    lines.push(
      row(
        "Net revenue @ current",
        formatMoney(computed.atCurrentSrp.contribution.netRevenuePerUnit),
      ),
    );
    lines.push(
      row(
        "Contribution @ current",
        `${formatMoney(computed.atCurrentSrp.contribution.contributionPerUnit)} (${formatPercent(
          computed.atCurrentSrp.contribution.contributionMarginRate,
        )})`,
      ),
    );
  }
  if (computed.priceGap) {
    lines.push(row("Pricing gap", formatMoney(computed.priceGap.gapPerUnit)));
  }
  if (computed.breakEvenSrpPerUnit) {
    lines.push(row("Break-even SRP", formatMoney(computed.breakEvenSrpPerUnit)));
  }
  lines.push("");

  lines.push(row("SENSITIVITY — TRADE SPEND"));
  lines.push(row("Trade spend", "Required invoice", "Required SRP", "CM @ current SRP"));
  const sensitivity = computeSensitivityTable(
    computed.sensitivityBase,
    "tradeSpendRate",
    DEFAULT_TRADE_SPEND_SENSITIVITY_RATES,
  );
  for (const sensRow of sensitivity.rows) {
    lines.push(
      sensRow.infeasible
        ? row(formatPercent(sensRow.value, 1), sensRow.infeasible)
        : row(
            formatPercent(sensRow.value, 1),
            formatMoney(sensRow.requiredBrandInvoicePerUnit!),
            formatMoney(sensRow.requiredSrpPerUnit!),
            sensRow.contributionMarginAtCurrentSrp
              ? formatPercent(sensRow.contributionMarginAtCurrentSrp)
              : "—",
          ),
    );
  }

  // UTF-8 BOM so Excel decodes the file correctly; CRLF row endings.
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

/** Suggested filename for the export. */
export function scenarioExportFilename(product: ProductSetup, scenarioName: string): string {
  const slug = (text: string) =>
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "export";
  return `akif-cpg-${slug(product.basics.sku || product.basics.name)}-${slug(scenarioName)}.csv`;
}
