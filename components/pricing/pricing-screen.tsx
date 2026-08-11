"use client";

import { useEffect, useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { DEMO_ASSUMPTIONS, type ScenarioAssumptions } from "@/lib/scenario/assumptions";
import { computeScenario, type ComputedScenario } from "@/lib/scenario/computeScenario";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AdvisorPanel } from "./advisor-panel";
import { AssumptionsPanel } from "./assumptions-panel";
import { SummaryCards } from "./summary-cards";
import { TopBar } from "./top-bar";
import { Waterfall } from "./waterfall";

const RECALC_DEBOUNCE_MS = 250;

/**
 * Main pricing screen (PRD §58): top bar, summary cards, assumptions on the
 * left, price waterfall in the center, Commercial Advisor on the right.
 * Inputs recalculate live with a short debounce (PRD §60); while an input is
 * mid-edit and invalid, the last good model stays on screen next to an
 * explicit error banner.
 */
interface ScreenModel {
  scenario: ComputedScenario | null;
  error: string | null;
}

function evaluate(assumptions: ScenarioAssumptions, previous: ComputedScenario | null): ScreenModel {
  const computation = computeScenario(assumptions);
  return computation.ok
    ? { scenario: computation.scenario, error: null }
    : { scenario: previous, error: computation.error };
}

export function PricingScreen() {
  const [assumptions, setAssumptions] = useState<ScenarioAssumptions>(DEMO_ASSUMPTIONS);

  // Live model with last-good fallback: an invalid mid-edit input surfaces an
  // error banner while the previous valid calculation stays on screen.
  const [model, setModel] = useState<ScreenModel>(() => evaluate(DEMO_ASSUMPTIONS, null));
  const recalcTimerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (recalcTimerRef.current !== null) window.clearTimeout(recalcTimerRef.current);
    };
  }, []);

  // Debounced recalculation (PRD §60), scheduled from the change handler.
  // The engine runs once in the timer callback; the state updater itself
  // stays cheap and pure.
  const applyAssumptions = (next: ScenarioAssumptions) => {
    setAssumptions(next);
    if (recalcTimerRef.current !== null) window.clearTimeout(recalcTimerRef.current);
    recalcTimerRef.current = window.setTimeout(() => {
      const computation = computeScenario(next);
      setModel((previous) =>
        computation.ok
          ? { scenario: computation.scenario, error: null }
          : { scenario: previous.scenario, error: computation.error },
      );
    }, RECALC_DEBOUNCE_MS);
  };

  const { scenario, error } = model;
  const update = (patch: Partial<ScenarioAssumptions>) =>
    applyAssumptions({ ...assumptions, ...patch });

  return (
    <TooltipProvider delay={200}>
      <div className="flex min-h-dvh flex-col bg-background">
        <TopBar
          productName={assumptions.productName}
          onReset={() => applyAssumptions(DEMO_ASSUMPTIONS)}
        />

        <main className="flex flex-1 flex-col gap-3 p-3 lg:p-4">
          {error !== null && (
            <Alert variant="destructive">
              <TriangleAlert aria-hidden />
              <AlertTitle>The model cannot be calculated with the current inputs</AlertTitle>
              <AlertDescription>
                {error} — showing the last valid calculation until the input is fixed.
              </AlertDescription>
            </Alert>
          )}

          {scenario && <SummaryCards assumptions={assumptions} scenario={scenario} />}

          <div className="grid flex-1 grid-cols-1 items-start gap-3 xl:grid-cols-[330px_minmax(0,1fr)_350px]">
            <AssumptionsPanel assumptions={assumptions} scenario={scenario} onChange={update} />
            {scenario && <Waterfall scenario={scenario} />}
            {scenario && (
              <AdvisorPanel insights={scenario.insights} warnings={scenario.warnings} />
            )}
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}
