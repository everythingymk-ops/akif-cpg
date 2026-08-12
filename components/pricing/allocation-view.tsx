"use client";

import type { AllocationSlice } from "@/lib/scenario/computeScenario";
import type Decimal from "decimal.js";
import { formatMoney, formatPercent } from "@/lib/scenario/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Dollar allocation view (PRD §43): for the current shelf price, where does
 * the consumer's money go? All numbers come from the active scenario.
 *
 * Color encodes the semantic group, not the slice (validated in step 12):
 * chart-1 green = brand contribution ("the answer"), chart-2 blue = retailer,
 * chart-4 plum = distributor, chart-3 amber = trade-spend family, chart-5
 * terracotta = brand variable costs, chart-6 neutral = goods-cost family —
 * per-slice identity is carried by the ordered, labeled legend below.
 */
const SLICE_COLORS: Record<string, string> = {
  retailer: "bg-chart-2",
  distributor: "bg-chart-4",
  "trade-spend": "bg-chart-3",
  deductions: "bg-chart-3/70",
  "variable-costs": "bg-chart-5",
  logistics: "bg-chart-6/75",
  manufacturing: "bg-chart-6",
  "manufacturer-profit": "bg-chart-6/55",
  contribution: "bg-chart-1",
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
          className="flex h-6 w-full gap-px overflow-hidden rounded-md"
          role="img"
          aria-label="Allocation of the consumer dollar"
        >
          {allocation
            .filter((slice) => slice.amount.greaterThan(0))
            .map((slice) => (
              <Tooltip key={slice.id}>
                <TooltipTrigger
                  render={
                    <div
                      className={cn("h-full", SLICE_COLORS[slice.id] ?? "bg-muted-foreground")}
                      style={{ width: `${Math.max(0.5, Number(slice.share.times(100).toFixed(2)))}%` }}
                    />
                  }
                />
                <TooltipContent className="text-xs">
                  {slice.label}: {formatMoney(slice.amount)} · {formatPercent(slice.share)}
                </TooltipContent>
              </Tooltip>
            ))}
        </div>

        <ul className="space-y-1.5">
          {allocation.map((slice) => (
            <li
              key={slice.id}
              className={cn(
                "flex items-center gap-2.5 text-sm",
                slice.id === "contribution" && "font-medium",
              )}
            >
              <span
                className={cn(
                  "size-2.5 shrink-0 rounded-[3px]",
                  SLICE_COLORS[slice.id] ?? "bg-muted-foreground",
                )}
                aria-hidden
              />
              <span className="flex-1">{slice.label}</span>
              <span
                className={cn("font-mono tabular-nums", slice.amount.lessThan(0) && "text-negative")}
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
