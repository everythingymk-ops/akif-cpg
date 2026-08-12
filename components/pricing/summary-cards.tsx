"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import type { CalculationTrace } from "@/lib/pricing-engine";
import type { ScenarioAssumptions } from "@/lib/scenario/assumptions";
import type { ComputedScenario } from "@/lib/scenario/computeScenario";
import {
  formatMoney,
  formatPercent,
  formatPercentPoints,
  tryDec,
} from "@/lib/scenario/format";
import { Card, CardContent } from "@/components/ui/card";
import { statusText, type StatusTone } from "@/components/ui/status";
import { cn } from "@/lib/utils";
import { TraceButton } from "./trace-dialog";

/**
 * Summary strip (PRD §58, §95): the seven headline figures plus the one-line
 * verdict against the contribution target. Live-typed assumption strings are
 * parsed with tryDec — a half-typed number must never crash the strip.
 */
export function SummaryCards({
  assumptions,
  scenario,
}: {
  assumptions: ScenarioAssumptions;
  scenario: ComputedScenario;
}) {
  const atCurrent = scenario.atCurrentSrp;
  const target = tryDec(assumptions.targetContributionRate);
  const targetSrp = tryDec(assumptions.targetSrpPerUnit);
  const retailerRate = tryDec(assumptions.retailerMarginRate);

  const marginDelta =
    atCurrent && target ? atCurrent.contribution.contributionMarginRate.minus(target) : undefined;

  const contributionTone: StatusTone = atCurrent
    ? atCurrent.contribution.contributionMarginRate.lessThan(0)
      ? "negative"
      : target && atCurrent.contribution.contributionMarginRate.lessThan(target)
        ? "warning"
        : "positive"
    : "neutral";

  const sentence =
    atCurrent && target && marginDelta
      ? marginDelta.lessThan(0)
        ? `At the current ${formatMoney(atCurrent.srpPerUnit)} SRP, this product falls ${formatPercentPoints(
            marginDelta.abs(),
          ).replace("+", "")} below your ${formatPercent(target)} target contribution margin.`
        : `At the current ${formatMoney(atCurrent.srpPerUnit)} SRP, this product sits ${formatPercentPoints(
            marginDelta,
          )} above your ${formatPercent(target)} target contribution margin.`
      : "Set a current shelf price to see how today's economics compare with your target.";

  const gap = scenario.priceGap;

  return (
    <section aria-label="Scenario summary" className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        <SummaryCard label="Target SRP" value={targetSrp ? formatMoney(targetSrp) : "—"} />
        <SummaryCard
          label="Calculated SRP"
          value={formatMoney(scenario.requiredSrpPerUnit)}
          trace={scenario.requiredSrpTrace}
        />
        <SummaryCard label="Brand invoice" value={formatMoney(scenario.requiredInvoicePerUnit)} />
        <SummaryCard
          label="Landed COGS"
          value={formatMoney(scenario.landed.landedCostPerUnit)}
          trace={scenario.landed.trace}
        />
        <SummaryCard label="Trade spend" value={formatPercent(scenario.tradeSpend.totalRate, 2)} />
        <SummaryCard
          label="Retailer margin"
          value={retailerRate ? formatPercent(retailerRate, 1) : "—"}
        />
        <SummaryCard
          label="Contribution margin"
          value={atCurrent ? formatPercent(atCurrent.contribution.contributionMarginRate) : "—"}
          tone={contributionTone}
          hint={
            marginDelta && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 font-mono text-[11px] tabular-nums",
                  statusText[contributionTone],
                )}
              >
                {marginDelta.isNegative() ? (
                  <ArrowDown className="size-3" aria-hidden />
                ) : (
                  <ArrowUp className="size-3" aria-hidden />
                )}
                {formatPercentPoints(marginDelta)} vs target
              </span>
            )
          }
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-4 py-2.5 text-sm">
        <p>{sentence}</p>
        <div className="flex items-center gap-3">
          {gap && (
            <span
              className={cn(
                "font-mono text-xs tabular-nums",
                statusText[gap.exceedsSupportedCost ? "negative" : "positive"],
              )}
            >
              Pricing gap {gap.gapPerUnit.isNegative() ? "" : "+"}
              {formatMoney(gap.gapPerUnit)}
            </span>
          )}
          <a href="#advisor-panel" className="text-xs font-medium text-primary hover:underline">
            See Commercial Advisor →
          </a>
        </div>
      </div>
    </section>
  );
}

function SummaryCard({
  label,
  value,
  tone = "neutral",
  hint,
  trace,
}: {
  label: string;
  value: string;
  tone?: StatusTone;
  hint?: React.ReactNode;
  trace?: CalculationTrace;
}) {
  return (
    <Card className="gap-1 rounded-lg py-2.5">
      <CardContent className="px-3">
        <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
          {trace && <TraceButton trace={trace} />}
        </div>
        <div
          className={cn(
            "font-mono text-lg leading-tight font-semibold tabular-nums",
            statusText[tone],
          )}
        >
          {value}
        </div>
        {hint}
      </CardContent>
    </Card>
  );
}
