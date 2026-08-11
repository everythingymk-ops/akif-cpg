"use client";

import { useState } from "react";
import { CalendarRange } from "lucide-react";
import type { ScenarioAssumptions } from "@/lib/scenario/assumptions";
import { tangibleTradeSpend } from "@/lib/scenario/coach";
import type { ComputedScenario } from "@/lib/scenario/computeScenario";
import type { SectionVisibility } from "@/lib/scenario/product";
import {
  formatMoney,
  formatMoneyWhole,
  formatPercent,
  tryDec,
} from "@/lib/scenario/format";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { BasisSelect, CalculatedValue, MoneyField, PercentField } from "./inputs";

interface AssumptionsPanelProps {
  assumptions: ScenarioAssumptions;
  scenario: ComputedScenario | null;
  /** Route-driven section visibility (PRD §12): hidden sections disappear. */
  visibility: SectionVisibility;
  onChange: (patch: Partial<ScenarioAssumptions>) => void;
  onOpenPlanner: () => void;
}

function ModeButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "rounded-md border px-2 py-1.5 text-xs transition-colors",
        selected
          ? "border-blue-400 bg-blue-50/60 font-semibold text-blue-900 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-200"
          : "border-border text-muted-foreground hover:bg-accent/50",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Left panel (PRD §58): editable assumptions in accordion sections with
 * progressive disclosure (PRD §94) — the default-open sections expose the
 * ~10 assumptions that matter most; the rest expand on demand. Sections the
 * selected route does not use are not rendered at all (PRD §12, §3E).
 */
export function AssumptionsPanel({
  assumptions,
  scenario,
  visibility,
  onChange,
  onOpenPlanner,
}: AssumptionsPanelProps) {
  // §77 nudge: dismissable per session ("Keep X%").
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const manualRate = tryDec(assumptions.tradeSpendRate);
  const manualCoach = manualRate ? tangibleTradeSpend(manualRate) : null;
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm">Assumptions</CardTitle>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-blue-500" aria-hidden /> editable
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-muted-foreground/50" aria-hidden /> calculated
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-emerald-500" aria-hidden /> healthy
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-amber-500" aria-hidden /> review
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-red-500" aria-hidden /> problem
          </span>
        </div>
      </CardHeader>
      <CardContent className="px-4">
        <Accordion defaultValue={["manufacturing", "retailer", "target"]} className="w-full">
          <AccordionItem value="product">
            <AccordionTrigger className="py-3 text-sm">Product</AccordionTrigger>
            <AccordionContent className="space-y-3 pb-3">
              <CalculatedValue label="Product">{assumptions.productName}</CalculatedValue>
              <CalculatedValue label="SKU">{assumptions.sku}</CalculatedValue>
              <p className="text-xs text-muted-foreground">
                Edit product identity and COGS mode by creating a product via New product.
              </p>
            </AccordionContent>
          </AccordionItem>

          {visibility.manufacturing && (
            <AccordionItem value="manufacturing">
              <AccordionTrigger className="py-3 text-sm">Manufacturing</AccordionTrigger>
              <AccordionContent className="space-y-3 pb-3">
                <MoneyField
                  label="Manufacturing COGS / unit"
                  value={assumptions.cogsPerUnit}
                  onChange={(cogsPerUnit) => onChange({ cogsPerUnit })}
                />
                <BasisSelect
                  label="Manufacturer margin basis"
                  value={assumptions.manufacturerMarginBasis}
                  onChange={(manufacturerMarginBasis) => onChange({ manufacturerMarginBasis })}
                />
                <PercentField
                  label={`Manufacturer ${assumptions.manufacturerMarginBasis}`}
                  rate={assumptions.manufacturerMarginRate}
                  onChange={(manufacturerMarginRate) => onChange({ manufacturerMarginRate })}
                />
                {scenario && (
                  <CalculatedValue label="Manufacturer sell price">
                    {formatMoney(scenario.manufacturer.sellPricePerUnit)}
                  </CalculatedValue>
                )}
              </AccordionContent>
            </AccordionItem>
          )}

          {visibility.landedCost && (
            <AccordionItem value="landed">
              <AccordionTrigger className="py-3 text-sm">Landed cost</AccordionTrigger>
              <AccordionContent className="space-y-3 pb-3">
                <MoneyField
                  label="International freight / unit"
                  value={assumptions.internationalFreightPerUnit}
                  onChange={(internationalFreightPerUnit) => onChange({ internationalFreightPerUnit })}
                />
                <PercentField
                  label="Tariff (% of customs value)"
                  rate={assumptions.tariffRate}
                  onChange={(tariffRate) => onChange({ tariffRate })}
                  hint="Customs value equals the manufacturer purchase price on this screen. The tariff basis stays user-selectable in product setup."
                />
                <MoneyField
                  label="Domestic freight / unit"
                  value={assumptions.domesticFreightPerUnit}
                  onChange={(domesticFreightPerUnit) => onChange({ domesticFreightPerUnit })}
                />
                {scenario && (
                  <CalculatedValue label="Brand landed cost">
                    {formatMoney(scenario.landed.landedCostPerUnit)}
                  </CalculatedValue>
                )}
              </AccordionContent>
            </AccordionItem>
          )}

          {visibility.commercial && (
            <AccordionItem value="commercial">
              <AccordionTrigger className="py-3 text-sm">Commercial</AccordionTrigger>
              <AccordionContent className="space-y-3 pb-3">
                <PercentField
                  label="Broker commission (% of invoice)"
                  rate={assumptions.brokerRate}
                  onChange={(brokerRate) => onChange({ brokerRate })}
                />
                <PercentField
                  label="Deductions (% of invoice)"
                  rate={assumptions.deductionsRate}
                  onChange={(deductionsRate) => onChange({ deductionsRate })}
                />
              </AccordionContent>
            </AccordionItem>
          )}

          {visibility.distributor && (
            <AccordionItem value="distributor">
              <AccordionTrigger className="py-3 text-sm">Distributor</AccordionTrigger>
              <AccordionContent className="space-y-3 pb-3">
                <BasisSelect
                  label="Distributor margin basis"
                  value={assumptions.distributorMarginBasis}
                  onChange={(distributorMarginBasis) => onChange({ distributorMarginBasis })}
                />
                <PercentField
                  label={`Distributor ${assumptions.distributorMarginBasis}`}
                  rate={assumptions.distributorMarginRate}
                  onChange={(distributorMarginRate) => onChange({ distributorMarginRate })}
                  hint="Distributor margin and distributor markup are not the same. Confirm which calculation your distributor uses."
                />
                <MoneyField
                  label="Distributor handling fee / unit"
                  value={assumptions.distributorHandlingFeePerUnit}
                  onChange={(distributorHandlingFeePerUnit) =>
                    onChange({ distributorHandlingFeePerUnit })
                  }
                />
              </AccordionContent>
            </AccordionItem>
          )}

          {visibility.retailer && (
            <AccordionItem value="retailer">
              <AccordionTrigger className="py-3 text-sm">Retailer</AccordionTrigger>
              <AccordionContent className="space-y-3 pb-3">
                <BasisSelect
                  label="Retailer margin basis"
                  value={assumptions.retailerMarginBasis}
                  onChange={(retailerMarginBasis) => onChange({ retailerMarginBasis })}
                />
                <PercentField
                  label={`Retailer ${assumptions.retailerMarginBasis}`}
                  rate={assumptions.retailerMarginRate}
                  onChange={(retailerMarginRate) => onChange({ retailerMarginRate })}
                  hint="Retailer margin is the percentage of the retail selling price retained as gross profit before the retailer's operating expenses."
                />
              </AccordionContent>
            </AccordionItem>
          )}

          {visibility.promotions && (
            <AccordionItem value="promotions">
              <AccordionTrigger className="py-3 text-sm">Promotions & trade spend</AccordionTrigger>
              <AccordionContent className="space-y-3 pb-3">
                <div className="grid grid-cols-2 gap-2">
                  <ModeButton
                    selected={assumptions.tradeSpendMode === "manual"}
                    onClick={() => onChange({ tradeSpendMode: "manual" })}
                  >
                    Manual %
                  </ModeButton>
                  <ModeButton
                    selected={assumptions.tradeSpendMode === "calendar"}
                    onClick={() =>
                      assumptions.promotions.length > 0
                        ? onChange({ tradeSpendMode: "calendar" })
                        : onOpenPlanner()
                    }
                  >
                    Promotional calendar
                  </ModeButton>
                </div>

                {assumptions.tradeSpendMode === "manual" ? (
                  <>
                    <PercentField
                      label="Promotional trade spend (% of gross)"
                      rate={assumptions.tradeSpendRate}
                      onChange={(tradeSpendRate) => onChange({ tradeSpendRate })}
                    />
                    {manualCoach && manualRate && (
                      <p className="text-xs text-muted-foreground">
                        You have allocated {formatPercent(manualRate, 2)} of gross invoice sales to
                        trade spend. At {formatMoneyWhole(manualCoach.grossSales)} gross →{" "}
                        {formatMoneyWhole(manualCoach.tradeSpendDollars)} trade spend,{" "}
                        {formatMoneyWhole(manualCoach.netAfterTradeDollars)} net after trade.
                      </p>
                    )}
                    {!nudgeDismissed && manualRate && (
                      <div className="space-y-2 rounded-md border border-violet-300 bg-violet-50/60 px-2.5 py-2 dark:border-violet-900 dark:bg-violet-950/30">
                        <p className="text-xs">
                          Would you like to build this {formatPercent(manualRate, 2)} from actual
                          planned promotions?
                        </p>
                        <div className="flex gap-1.5">
                          <Button size="sm" className="h-6 px-2 text-xs" onClick={onOpenPlanner}>
                            Build promotions
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => setNudgeDismissed(true)}
                          >
                            Keep {formatPercent(manualRate, 2)}
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <CalculatedValue label="Promotions in calendar">
                      {String(assumptions.promotions.length)}
                    </CalculatedValue>
                    {scenario?.tradeSpend.plan && (
                      <CalculatedValue label="Effective promotional rate">
                        {formatPercent(scenario.tradeSpend.promotionalRate, 2)}
                      </CalculatedValue>
                    )}
                    <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs" onClick={onOpenPlanner}>
                      <CalendarRange className="size-3.5" aria-hidden /> Open Promotion Planner
                    </Button>
                  </>
                )}

                <PercentField
                  label="Additional trade reserve"
                  rate={assumptions.additionalReserveRate}
                  onChange={(additionalReserveRate) => onChange({ additionalReserveRate })}
                  hint="Reserve for unplanned TPRs, markdowns, deductions and promotional leakage on top of the planned rate."
                />
                {scenario && (
                  <>
                    <CalculatedValue label="Total planned trade spend">
                      {formatPercent(scenario.tradeSpend.totalRate, 2)}
                    </CalculatedValue>
                    {scenario.tradeSpend.band && (
                      <p className="text-xs text-muted-foreground">
                        {scenario.tradeSpend.band.label}: {scenario.tradeSpend.band.guidance}
                      </p>
                    )}
                  </>
                )}
              </AccordionContent>
            </AccordionItem>
          )}

          <AccordionItem value="target">
            <AccordionTrigger className="py-3 text-sm">Shelf price & target</AccordionTrigger>
            <AccordionContent className="space-y-3 pb-3">
              <PercentField
                label="Target contribution margin"
                rate={assumptions.targetContributionRate}
                onChange={(targetContributionRate) => onChange({ targetContributionRate })}
              />
              <MoneyField
                label="Current SRP"
                value={assumptions.currentSrpPerUnit}
                onChange={(currentSrpPerUnit) => onChange({ currentSrpPerUnit })}
                hint="The shelf price the product sells at today. Leave empty if not yet at retail."
              />
              <MoneyField
                label="Target SRP (optional)"
                value={assumptions.targetSrpPerUnit}
                onChange={(targetSrpPerUnit) => onChange({ targetSrpPerUnit })}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}
