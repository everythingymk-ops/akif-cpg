"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import type { CalculationTrace } from "@/lib/pricing-engine";
import { formatNumber } from "@/lib/scenario/format";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * "Explain every number" (PRD §41, §67): hover shows the formula, clicking
 * opens the full audit — formula, inputs, intermediate values, output.
 */
export function TraceButton({ trace }: { trace: CalculationTrace }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label={`Show calculation: ${trace.title}`}
              onClick={() => setOpen(true)}
              className="inline-flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Info className="size-3.5" aria-hidden />
            </button>
          }
        />
        <TooltipContent side="top" className="max-w-xs">
          <p className="font-mono text-xs">{trace.formula}</p>
          <p className="mt-1 text-xs opacity-80">Click for the full calculation</p>
        </TooltipContent>
      </Tooltip>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{trace.title}</DialogTitle>
          <DialogDescription className="sr-only">
            Calculation audit for {trace.title}
          </DialogDescription>
        </DialogHeader>

        <code className="block rounded bg-muted px-2 py-1.5 font-mono text-xs">
          {trace.formula}
        </code>

        <section aria-label="Inputs">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Inputs
          </h3>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
            {Object.entries(trace.inputs).map(([name, value]) => (
              <div key={name} className="contents">
                <dt className="text-muted-foreground">{name}</dt>
                <dd className="text-right font-mono tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-label="Intermediate values">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Steps
          </h3>
          <ol className="space-y-2 text-sm">
            {trace.steps.map((step, index) => (
              <li key={index} className="rounded border border-border/60 px-2.5 py-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span>{step.label}</span>
                  <span className="font-mono tabular-nums">{formatNumber(step.value)}</span>
                </div>
                <div className="mt-0.5 font-mono text-xs text-muted-foreground">{step.formula}</div>
              </li>
            ))}
          </ol>
        </section>

        <div className="flex items-baseline justify-between border-t pt-3 text-sm font-semibold">
          <span>Output</span>
          <span className="font-mono tabular-nums">{formatNumber(trace.output)}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
