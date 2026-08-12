"use client";

import type { ComputedScenario } from "@/lib/scenario/computeScenario";
import { formatMoney, formatPercent } from "@/lib/scenario/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { TraceButton } from "./trace-dialog";

/**
 * Center panel (PRD §42, §96): clean vertical price build from manufacturing
 * COGS to the required SRP. Every calculated stage is hoverable and opens the
 * full calculation audit (PRD §41, §67).
 */
export function Waterfall({ scenario }: { scenario: ComputedScenario }) {
  const maxValue = scenario.waterfall[scenario.waterfall.length - 1].value;

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm">Price build</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-4">
        <ol className="space-y-3">
          {scenario.waterfall.map((stage, index) => {
            const isFinal = index === scenario.waterfall.length - 1;
            const widthPercent = maxValue.isZero()
              ? 0
              : Math.min(100, Number(stage.value.dividedBy(maxValue).times(100).toFixed(2)));
            return (
              <li key={stage.id}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className={cn("flex items-center gap-1.5", isFinal && "font-semibold")}>
                    {stage.label}
                    {stage.trace && <TraceButton trace={stage.trace} />}
                  </span>
                  <span className={cn("font-mono font-medium tabular-nums", isFinal && "font-semibold")}>
                    {formatMoney(stage.value)}
                  </span>
                </div>
                {stage.delta && (
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="inline-flex rounded bg-muted px-1.5 font-mono text-[11px] tabular-nums">
                      +{formatMoney(stage.delta)}
                    </span>
                    vs previous stage
                  </div>
                )}
                <div className="mt-1 h-2 rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", isFinal ? "bg-primary" : "bg-primary/75")}
                    style={{ width: `${widthPercent}%` }}
                    aria-hidden
                  />
                </div>
              </li>
            );
          })}
        </ol>

        <Separator />

        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <SideStat label="Total trade spend" value={formatPercent(scenario.tradeSpend.totalRate, 2)} />
          <SideStat
            label="Net revenue @ required invoice"
            value={formatMoney(scenario.requiredNetRevenuePerUnit)}
          />
          {scenario.atCurrentSrp ? (
            <>
              <SideStat
                label="Net revenue @ current SRP"
                value={formatMoney(scenario.atCurrentSrp.contribution.netRevenuePerUnit)}
              />
              <SideStat
                label="Contribution @ current SRP"
                value={`${formatMoney(scenario.atCurrentSrp.contribution.contributionPerUnit)} · ${formatPercent(
                  scenario.atCurrentSrp.contribution.contributionMarginRate,
                )}`}
              />
            </>
          ) : (
            <p className="col-span-2 text-xs text-muted-foreground">
              Set a current SRP to see live contribution economics at today&apos;s shelf price.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SideStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}
