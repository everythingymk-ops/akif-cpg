"use client";

import { useState } from "react";
import { CheckCircle2, RotateCcw, Sparkles, TriangleAlert } from "lucide-react";
import type { AdvisorInsight, ValidationWarning } from "@/lib/pricing-engine";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Separator } from "@/components/ui/separator";
import { advisorTone, statusBadge, statusBox } from "@/components/ui/status";
import { cn } from "@/lib/utils";

const PRIORITY_LABELS: Record<AdvisorInsight["priority"], string> = {
  critical: "Critical",
  warning: "Warning",
  opportunity: "Opportunity",
};

/** Left accent per tone — the card frame itself stays neutral. */
const ACCENT_CLASSES: Record<AdvisorInsight["priority"], string> = {
  critical: "border-l-negative",
  warning: "border-l-warning",
  opportunity: "border-l-positive",
};

/**
 * Right panel (PRD §38–40): ranked numeric insights. The Advisor only ever
 * observes — it changes nothing. "Ignore" hides an insight locally; every
 * figure it quotes comes from the live model.
 */
export function AdvisorPanel({
  insights,
  warnings,
}: {
  insights: AdvisorInsight[];
  warnings: ValidationWarning[];
}) {
  const [ignored, setIgnored] = useState<ReadonlySet<string>>(new Set());
  const [explained, setExplained] = useState<ReadonlySet<string>>(new Set());
  const visible = insights.filter((insight) => !ignored.has(insight.code));
  const ignoredCount = insights.length - visible.length;

  const toggleExplain = (code: string) =>
    setExplained((previous) => {
      const next = new Set(previous);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  return (
    <Card id="advisor-panel" className="gap-3 scroll-mt-4 py-4">
      <CardHeader className="flex-row items-center justify-between px-4">
        <CardTitle className="text-sm">Commercial Advisor</CardTitle>
        {ignoredCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => setIgnored(new Set())}
          >
            <RotateCcw aria-hidden /> Restore {ignoredCount}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3 px-4">
        {visible.length === 0 ? (
          <EmptyState
            icon={insights.length === 0 ? Sparkles : CheckCircle2}
            title={
              insights.length === 0
                ? "No insights for the current model."
                : "All insights ignored for this session."
            }
            hint={
              insights.length === 0
                ? "Insights appear as the model surfaces risks and levers worth a look."
                : undefined
            }
            className="py-6"
          />
        ) : (
          <ul className="space-y-3">
            {visible.map((insight) => {
              const tone = advisorTone[insight.priority];
              const isExplained = explained.has(insight.code);
              return (
                <li
                  key={insight.code}
                  className={cn(
                    "rounded-lg border border-l-2 px-3 py-2.5",
                    ACCENT_CLASSES[insight.priority],
                  )}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <Badge variant="outline" className={cn("text-[11px]", statusBadge[tone])}>
                      {PRIORITY_LABELS[insight.priority]}
                    </Badge>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => toggleExplain(insight.code)}
                      >
                        {isExplained ? "Hide" : "Explain"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-muted-foreground"
                        onClick={() =>
                          setIgnored((previous) => new Set(previous).add(insight.code))
                        }
                      >
                        Ignore
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm leading-snug">{insight.message}</p>
                  {isExplained && (
                    <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 rounded bg-muted/50 px-2.5 py-2 text-xs">
                      {Object.entries(insight.metrics).map(([name, value]) => (
                        <div key={name} className="contents">
                          <dt className="text-muted-foreground">{name}</dt>
                          <dd className="text-right font-mono tabular-nums">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <Separator />

        <section aria-label="Model validation">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Validation
          </h3>
          {warnings.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 text-positive" aria-hidden />
              No validation warnings.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {warnings.map((warning) => (
                <li
                  key={`${warning.code}-${warning.message}`}
                  className={cn(
                    "flex items-start gap-1.5 rounded border px-2.5 py-1.5 text-xs text-foreground/90",
                    statusBox.warning,
                  )}
                >
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
                  {warning.message}
                </li>
              ))}
            </ul>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
