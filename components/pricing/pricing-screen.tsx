"use client";

import { useEffect, useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";
import type { TradeSpendBand } from "@/lib/pricing-engine";
import type { ScenarioAssumptions } from "@/lib/scenario/assumptions";
import {
  computeScenario,
  type ComputedScenario,
  type ScenarioOptions,
} from "@/lib/scenario/computeScenario";
import {
  CHANNEL_ROUTES,
  assumptionsForProduct,
  getSectionVisibility,
  type ProductSetup,
} from "@/lib/scenario/product";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useBenchmarks } from "@/components/benchmarks/benchmark-provider";
import { useProducts } from "@/components/setup/product-provider";
import { AdvisorPanel } from "./advisor-panel";
import { AllocationView } from "./allocation-view";
import { AssumptionsPanel } from "./assumptions-panel";
import { PromotionPlannerDialog } from "./promotion-planner";
import { ReverseView } from "./reverse-view";
import { SensitivityView } from "./sensitivity-view";
import { SummaryCards } from "./summary-cards";
import { TopBar } from "./top-bar";
import { Waterfall } from "./waterfall";

const RECALC_DEBOUNCE_MS = 250;

interface ScreenModel {
  scenario: ComputedScenario | null;
  error: string | null;
}

function evaluate(
  assumptions: ScenarioAssumptions,
  previous: ComputedScenario | null,
  options: ScenarioOptions,
): ScreenModel {
  const computation = computeScenario(assumptions, options);
  return computation.ok
    ? { scenario: computation.scenario, error: null }
    : { scenario: previous, error: computation.error };
}

/** Route-level shell: remounts the screen state when the product changes. */
export function PricingScreen() {
  const { products, activeProduct, setActiveProductId } = useProducts();
  return (
    <ProductPricingScreen
      key={activeProduct.id}
      product={activeProduct}
      products={products}
      onSelectProduct={setActiveProductId}
    />
  );
}

/**
 * Main pricing screen (PRD §58): top bar, summary cards, assumptions on the
 * left, price waterfall in the center, Commercial Advisor on the right.
 * Inputs recalculate live with a short debounce (PRD §60); while an input is
 * mid-edit and invalid, the last good model stays on screen next to an
 * explicit error banner. Section visibility follows the product's route
 * (PRD §12).
 */
function ProductPricingScreen({
  product,
  products,
  onSelectProduct,
}: {
  product: ProductSetup;
  products: ProductSetup[];
  onSelectProduct: (id: string) => void;
}) {
  const { tradeSpendBands } = useBenchmarks();
  const initialAssumptions = assumptionsForProduct(product);
  const [assumptions, setAssumptions] = useState<ScenarioAssumptions>(initialAssumptions);
  const [model, setModel] = useState<ScreenModel>(() =>
    evaluate(initialAssumptions, null, { tradeSpendBands }),
  );
  const [plannerOpen, setPlannerOpen] = useState(false);
  const visibility = getSectionVisibility(product.route);

  // Bands can change while the planner is open; keep the latest for the
  // debounced recalculation without re-scheduling it.
  const bandsRef = useRef<readonly TradeSpendBand[]>(tradeSpendBands);
  useEffect(() => {
    bandsRef.current = tradeSpendBands;
  }, [tradeSpendBands]);

  const recalcTimerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (recalcTimerRef.current !== null) window.clearTimeout(recalcTimerRef.current);
    };
  }, []);

  // Latest applied assumptions, for handlers whose render closure may be
  // stale (e.g. the planner's close handler right after Apply).
  const assumptionsRef = useRef<ScenarioAssumptions>(initialAssumptions);

  // Debounced recalculation (PRD §60), scheduled from the change handler.
  // The engine runs once in the timer callback; the state updater itself
  // stays cheap and pure.
  const applyAssumptions = (next: ScenarioAssumptions) => {
    assumptionsRef.current = next;
    setAssumptions(next);
    if (recalcTimerRef.current !== null) window.clearTimeout(recalcTimerRef.current);
    recalcTimerRef.current = window.setTimeout(() => {
      const computation = computeScenario(next, { tradeSpendBands: bandsRef.current });
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

  const closePlanner = () => {
    setPlannerOpen(false);
    // Bands may have been edited inside the planner — refresh the model with
    // the LATEST assumptions (the render closure would undo a just-applied
    // plan).
    applyAssumptions(assumptionsRef.current);
  };

  return (
    <TooltipProvider delay={200}>
      <div className="flex min-h-dvh flex-col bg-background">
        <TopBar
          products={products.map(({ id, basics }) => ({ id, name: basics.name }))}
          activeProductId={product.id}
          onSelectProduct={onSelectProduct}
          routeLabel={`Route ${product.route}: ${CHANNEL_ROUTES[product.route].label}`}
          onReset={() => applyAssumptions(assumptionsForProduct(product))}
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
            <AssumptionsPanel
              assumptions={assumptions}
              scenario={scenario}
              visibility={visibility}
              onChange={update}
              onOpenPlanner={() => setPlannerOpen(true)}
            />
            {scenario && (
              <Tabs defaultValue="waterfall" className="min-w-0">
                <TabsList>
                  <TabsTrigger value="waterfall">Price build</TabsTrigger>
                  <TabsTrigger value="allocation" disabled={!scenario.dollarAllocation}>
                    $ allocation
                  </TabsTrigger>
                  <TabsTrigger value="sensitivity">Sensitivity</TabsTrigger>
                  <TabsTrigger value="reverse">Reverse & fix</TabsTrigger>
                </TabsList>
                <TabsContent value="waterfall">
                  <Waterfall scenario={scenario} />
                </TabsContent>
                <TabsContent value="allocation">
                  {scenario.dollarAllocation && scenario.atCurrentSrp && (
                    <AllocationView
                      srpPerUnit={scenario.atCurrentSrp.srpPerUnit}
                      allocation={scenario.dollarAllocation}
                    />
                  )}
                </TabsContent>
                <TabsContent value="sensitivity">
                  <SensitivityView base={scenario.sensitivityBase} />
                </TabsContent>
                <TabsContent value="reverse">
                  <ReverseView
                    base={scenario.sensitivityBase}
                    actualLandedCost={scenario.landed.landedCostPerUnit}
                    improvement={scenario.improvement}
                    defaultTargetSrp={
                      assumptions.targetSrpPerUnit || assumptions.currentSrpPerUnit || "19.99"
                    }
                    onApply={update}
                  />
                </TabsContent>
              </Tabs>
            )}
            {scenario && (
              <AdvisorPanel insights={scenario.insights} warnings={scenario.warnings} />
            )}
          </div>
        </main>

        {plannerOpen && (
          <PromotionPlannerDialog
            assumptions={assumptions}
            onApply={update}
            onClose={closePlanner}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
