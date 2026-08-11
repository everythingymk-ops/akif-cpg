"use client";

import { useMemo, useState } from "react";
import { ArrowDown, Wrench } from "lucide-react";
import {
  PricingEngineError,
  computePriceGap,
  reversePriceFromShelf,
  type ImprovementLever,
  type ImprovementResult,
  type ReversePricingResult,
  type SensitivityBaseScenario,
} from "@/lib/pricing-engine";
import type Decimal from "decimal.js";
import type { ScenarioAssumptions } from "@/lib/scenario/assumptions";
import {
  formatMoney,
  formatPercent,
  formatPercentPoints,
  tryDec,
} from "@/lib/scenario/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { MoneyField } from "./inputs";

/**
 * Reverse pricing (PRD §30–31) + "Improve Economics" (PRD §73). Works
 * backward from a target shelf price to the maximum invoice / landed cost the
 * commercial assumptions support, quantifies the pricing gap, and lists the
 * single-change levers that reach the target — each applied only on explicit
 * user action (PRD §40).
 */

export function ReverseView({
  base,
  actualLandedCost,
  improvement,
  defaultTargetSrp,
  onApply,
}: {
  base: SensitivityBaseScenario;
  actualLandedCost: Decimal;
  improvement?: ImprovementResult;
  defaultTargetSrp: string;
  onApply: (patch: Partial<ScenarioAssumptions>) => void;
}) {
  const [targetSrp, setTargetSrp] = useState(defaultTargetSrp);

  const reverse = useMemo<{ result: ReversePricingResult | null; error: string | null }>(() => {
    if (tryDec(targetSrp) === null) {
      return { result: null, error: "Enter a target shelf price to work backward from." };
    }
    try {
      return {
        result: reversePriceFromShelf({
          targetSrpPerUnit: targetSrp,
          retailerMarginSpec: base.retailerMarginSpec,
          distributor: base.distributor,
          targetContributionRate: base.targetContributionRate,
          tradeSpendRate: base.tradeSpendRate,
          revenueDeductions: base.revenueDeductions,
          variableCosts: base.variableCosts,
        }),
        error: null,
      };
    } catch (error) {
      if (error instanceof PricingEngineError) return { result: null, error: error.message };
      throw error;
    }
  }, [targetSrp, base]);

  const gap = reverse.result
    ? computePriceGap(actualLandedCost, reverse.result.maxLandedCostPerUnit)
    : null;

  return (
    <div className="space-y-3">
      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm">Work backward from the shelf</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 px-4">
          <div className="max-w-48">
            <MoneyField label="Target shelf price" value={targetSrp} onChange={setTargetSrp} />
          </div>

          {reverse.error && <p className="text-xs text-muted-foreground">{reverse.error}</p>}

          {reverse.result && (
            <>
              <ol className="space-y-1.5 text-sm">
                <ReverseRow label="Target SRP" value={reverse.result.targetSrpPerUnit} bold />
                <ReverseRow
                  label="Retailer acquisition cost"
                  value={reverse.result.retailerAcquisitionCostPerUnit}
                />
                {reverse.result.distributorSellPricePerUnit && (
                  <ReverseRow
                    label="Distributor sell price"
                    value={reverse.result.distributorSellPricePerUnit}
                  />
                )}
                <ReverseRow label="Maximum brand invoice" value={reverse.result.maxBrandInvoicePerUnit} />
                <ReverseRow label="Net revenue at maximum" value={reverse.result.netRevenuePerUnit} />
                <ReverseRow label="Maximum landed cost" value={reverse.result.maxLandedCostPerUnit} bold />
              </ol>

              <p className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                To sell at {formatMoney(reverse.result.targetSrpPerUnit)} while maintaining the
                selected commercial assumptions, your maximum landed cost is approximately{" "}
                <strong>{formatMoney(reverse.result.maxLandedCostPerUnit)}</strong>.
              </p>

              {gap && (
                <div
                  className={cn(
                    "rounded-md border px-3 py-2 text-sm",
                    gap.exceedsSupportedCost
                      ? "border-red-300 dark:border-red-900"
                      : "border-emerald-300 dark:border-emerald-900",
                  )}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="font-medium">Pricing gap</span>
                    <span
                      className={cn(
                        "font-mono tabular-nums",
                        gap.exceedsSupportedCost
                          ? "text-red-600 dark:text-red-400"
                          : "text-emerald-600 dark:text-emerald-400",
                      )}
                    >
                      {gap.gapPerUnit.isNegative() ? "" : "+"}
                      {formatMoney(gap.gapPerUnit)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Actual landed cost {formatMoney(gap.actualLandedCostPerUnit)} · maximum supported{" "}
                    {formatMoney(gap.maxSupportedLandedCostPerUnit)}.{" "}
                    {gap.exceedsSupportedCost
                      ? `Your current cost structure is ${formatMoney(gap.gapPerUnit)}/unit above the level supported by this shelf price.`
                      : "The current cost structure fits under this shelf price."}
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {improvement && (
        <Card className="gap-3 py-4" id="improve-economics">
          <CardHeader className="px-4">
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <Wrench className="size-3.5" aria-hidden /> Improve economics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4">
            {improvement.alreadyOnTarget ? (
              <p className="text-sm text-muted-foreground">
                Contribution at the current shelf price is{" "}
                {formatPercent(improvement.currentContributionMarginRate)} — already at or above the{" "}
                {formatPercent(improvement.targetContributionRate)} target. No changes needed.
              </p>
            ) : (
              <>
                <p className="text-sm">
                  Current contribution {formatPercent(improvement.currentContributionMarginRate)},
                  target {formatPercent(improvement.targetContributionRate)} — a shortfall of{" "}
                  {formatPercentPoints(improvement.gapToTarget).replace("+", "")}. One of these
                  changes closes it:
                </p>
                <ul className="space-y-2">
                  {improvement.levers.map((lever) => (
                    <LeverRow key={lever.id} lever={lever} onApply={onApply} />
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  Levers are exact single changes; combinations reach the target sooner. Applying a
                  lever only changes the assumption shown — nothing else moves.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ReverseRow({ label, value, bold }: { label: string; value: Decimal; bold?: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className={cn("flex items-center gap-1.5", !bold && "text-muted-foreground")}>
        {!bold && <ArrowDown className="size-3 text-muted-foreground/60" aria-hidden />}
        {label}
      </span>
      <span className={cn("font-mono tabular-nums", bold && "font-semibold")}>
        {formatMoney(value)}
      </span>
    </li>
  );
}

function LeverRow({
  lever,
  onApply,
}: {
  lever: ImprovementLever;
  onApply: (patch: Partial<ScenarioAssumptions>) => void;
}) {
  const describe = (): { text: string; apply?: { label: string; patch: Partial<ScenarioAssumptions> } } => {
    switch (lever.id) {
      case "increase-srp":
        return {
          text: `Increase the SRP by ${formatMoney(lever.delta)} to ${formatMoney(lever.requiredValue)}.`,
          apply: {
            label: `Set current SRP to ${formatMoney(lever.requiredValue)}`,
            patch: { currentSrpPerUnit: lever.requiredValue.toFixed(2) },
          },
        };
      case "reduce-landed-cost":
        return {
          text: `Reduce the landed cost by ${formatMoney(lever.delta)} to ${formatMoney(lever.requiredValue)} (COGS, freight or duty).`,
        };
      case "reduce-trade-spend":
        return {
          text: `Reduce trade spend from ${formatPercent(lever.currentValue)} to ${formatPercent(lever.requiredValue)}.`,
          apply: lever.feasible
            ? {
                label: `Set manual trade spend to ${formatPercent(lever.requiredValue)} (replaces promo rate + reserve)`,
                patch: {
                  tradeSpendMode: "manual",
                  tradeSpendRate: lever.requiredValue.toDecimalPlaces(6).toString(),
                  additionalReserveRate: "0",
                },
              }
            : undefined,
        };
      case "reduce-retailer-margin":
        return {
          text: `Negotiate the retailer margin from ${formatPercent(lever.currentValue)} to ${formatPercent(lever.requiredValue)}.`,
          apply: lever.feasible
            ? {
                label: `Set retailer margin to ${formatPercent(lever.requiredValue)}`,
                patch: {
                  retailerMarginBasis: "margin",
                  retailerMarginRate: lever.requiredValue.toDecimalPlaces(6).toString(),
                },
              }
            : undefined,
        };
      case "sell-direct":
        return {
          text: `Sell direct: contribution moves from ${formatPercent(lever.currentValue)} to ${formatPercent(lever.requiredValue)} at the same shelf price (route change — set up via product settings).`,
        };
    }
  };

  const { text, apply } = describe();
  return (
    <li
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        !lever.feasible && "border-dashed text-muted-foreground",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex-1">{text}</span>
        {!lever.feasible && (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            not sufficient alone
          </Badge>
        )}
        {apply && lever.feasible && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onApply(apply.patch)}
          >
            {apply.label}
          </Button>
        )}
      </div>
    </li>
  );
}
