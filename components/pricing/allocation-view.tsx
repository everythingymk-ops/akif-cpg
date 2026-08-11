"use client";

import type { AllocationSlice } from "@/lib/scenario/computeScenario";
import type Decimal from "decimal.js";
import { formatMoney, formatPercent } from "@/lib/scenario/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Dollar allocation view (PRD §43): for the current shelf price, where does
 * the consumer's money go? All numbers come from the active scenario.
 */

const SLICE_COLORS: Record<string, string> = {
  retailer: "bg-sky-500",
  distributor: "bg-cyan-500",
  "trade-spend": "bg-violet-500",
  deductions: "bg-fuchsia-500",
  "variable-costs": "bg-rose-400",
  logistics: "bg-amber-500",
  manufacturing: "bg-stone-500",
  "manufacturer-profit": "bg-stone-400",
  contribution: "bg-emerald-500",
};

export function AllocationView({
  srpPerUnit,
  allocation,
}: {
  srpPerUnit: Decimal;
  allocation: AllocationSlice[];
}) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm">
          Where does the {formatMoney(srpPerUnit)} go?
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-4">
        <div
          className="flex h-6 w-full overflow-hidden rounded-md"
          role="img"
          aria-label="Allocation of the consumer dollar"
        >
          {allocation
            .filter((slice) => slice.amount.greaterThan(0))
            .map((slice) => (
              <div
                key={slice.id}
                className={cn("h-full", SLICE_COLORS[slice.id] ?? "bg-muted-foreground")}
                style={{ width: `${Math.max(0.5, Number(slice.share.times(100).toFixed(2)))}%` }}
                title={`${slice.label}: ${formatMoney(slice.amount)}`}
              />
            ))}
        </div>

        <ul className="space-y-1.5">
          {allocation.map((slice) => (
            <li key={slice.id} className="flex items-center gap-2.5 text-sm">
              <span
                className={cn(
                  "size-2.5 shrink-0 rounded-sm",
                  SLICE_COLORS[slice.id] ?? "bg-muted-foreground",
                )}
                aria-hidden
              />
              <span className="flex-1">{slice.label}</span>
              <span
                className={cn(
                  "font-mono tabular-nums",
                  slice.amount.lessThan(0) && "text-red-600 dark:text-red-400",
                )}
              >
                {formatMoney(slice.amount)}
              </span>
              <span className="w-14 text-right font-mono text-xs tabular-nums text-muted-foreground">
                {formatPercent(slice.share)}
              </span>
            </li>
          ))}
        </ul>

        <p className="text-xs text-muted-foreground">
          Every slice comes from the live model: channel takes are stage differences, cost slices
          are the gross-to-net and landed-cost lines, and the remainder is brand contribution.
        </p>
      </CardContent>
    </Card>
  );
}
