"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";
import type { TradeSpendBand } from "@/lib/pricing-engine";
import type { ScenarioAssumptions } from "@/lib/scenario/assumptions";
import {
  computeScenario,
  type ComputedScenario,
  type ScenarioOptions,
} from "@/lib/scenario/computeScenario";
import { formatMoney, formatPercent } from "@/lib/scenario/format";
import {
  CHANNEL_ROUTES,
  assumptionsForProduct,
  getSectionVisibility,
  type ProductSetup,
} from "@/lib/scenario/product";
import { buildScenarioExportCsv, scenarioExportFilename } from "@/lib/scenario/exportCsv";
import { resolveAssumptions, type AssumptionLayer } from "@/lib/scenario/priority";
import { distributorProfileValues, retailerProfileValues } from "@/lib/scenario/profiles";
import { buildAuditEntry, type AuditChange } from "@/lib/scenario/scenarios";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useBenchmarks } from "@/components/benchmarks/benchmark-provider";
import { ProfileManagerDialog } from "@/components/profiles/profile-manager";
import { useProfiles } from "@/components/profiles/profiles-provider";
import { useProducts } from "@/components/setup/product-provider";
import { AdvisorPanel } from "./advisor-panel";
import { AllocationView } from "./allocation-view";
import { AssumptionsPanel } from "./assumptions-panel";
import { PromotionPlannerDialog } from "./promotion-planner";
import { ReverseView } from "./reverse-view";
import {
  CompareScenariosDialog,
  ScenarioHistoryDialog,
  ScenarioNameDialog,
} from "./scenario-dialogs";
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

/**
 * Route-level shell: remounts the screen state when the product or the
 * active scenario changes, so working assumptions always start from the
 * saved snapshot.
 */
export function PricingScreen() {
  const { activeProduct, activeScenario } = useProducts();
  return (
    <ProductPricingScreen
      key={`${activeProduct.id}:${activeScenario?.id ?? "none"}`}
      product={activeProduct}
    />
  );
}

/**
 * Main pricing screen (PRD §58) with the scenario lifecycle (PRD §37, §68,
 * §70): live debounced recalc, explicit Save with an audit entry, Duplicate,
 * Compare and History.
 */
function ProductPricingScreen({ product }: { product: ProductSetup }) {
  const {
    products,
    setActiveProductId,
    scenariosForActiveProduct,
    activeScenario,
    setActiveScenarioId,
    saveActiveScenario,
    createScenarioForActiveProduct,
  } = useProducts();
  const { tradeSpendBands } = useBenchmarks();
  const { retailerProfiles, distributorProfiles } = useProfiles();

  const savedAssumptions = activeScenario?.assumptions ?? assumptionsForProduct(product);
  const [assumptions, setAssumptions] = useState<ScenarioAssumptions>(savedAssumptions);
  const [model, setModel] = useState<ScreenModel>(() =>
    evaluate(savedAssumptions, null, { tradeSpendBands }),
  );
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [nameDialog, setNameDialog] = useState<"save" | "duplicate" | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [profileManagerOpen, setProfileManagerOpen] = useState(false);
  const [appliedRetailerId, setAppliedRetailerId] = useState<string | null>(null);
  const [appliedDistributorId, setAppliedDistributorId] = useState<string | null>(null);

  // Route-driven sections (PRD §12), widened when a customer profile turns
  // the distributor leg on for a normally-direct route (PRD §47).
  const routeVisibility = getSectionVisibility(product.route);
  const visibility = {
    ...routeVisibility,
    distributor: routeVisibility.distributor || assumptions.useDistributor,
  };

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
  const assumptionsRef = useRef<ScenarioAssumptions>(savedAssumptions);

  // Debounced recalculation (PRD §60), scheduled from the change handler.
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

  const dirty = useMemo(
    () => JSON.stringify(assumptions) !== JSON.stringify(savedAssumptions),
    [assumptions, savedAssumptions],
  );

  // §68: pair the assumption diff with the headline output shifts.
  const buildOutputChanges = (): AuditChange[] => {
    if (!activeScenario) return [];
    const before = computeScenario(activeScenario.assumptions, { tradeSpendBands });
    const after = computeScenario(assumptions, { tradeSpendBands });
    if (!before.ok || !after.ok) return [];
    const changes: AuditChange[] = [];
    if (!before.scenario.requiredSrpPerUnit.equals(after.scenario.requiredSrpPerUnit)) {
      changes.push({
        field: "requiredSrp",
        label: "Required SRP",
        from: formatMoney(before.scenario.requiredSrpPerUnit),
        to: formatMoney(after.scenario.requiredSrpPerUnit),
      });
    }
    const beforeCm = before.scenario.atCurrentSrp?.contribution.contributionMarginRate;
    const afterCm = after.scenario.atCurrentSrp?.contribution.contributionMarginRate;
    if (beforeCm && afterCm && !beforeCm.equals(afterCm)) {
      changes.push({
        field: "contributionMargin",
        label: "Contribution",
        from: formatPercent(beforeCm),
        to: formatPercent(afterCm),
      });
    }
    return changes;
  };

  const handleSave = () => {
    if (!activeScenario) {
      setNameDialog("save");
      return;
    }
    const entry = buildAuditEntry(
      activeScenario.assumptions,
      assumptions,
      new Date().toISOString(),
      buildOutputChanges(),
    );
    saveActiveScenario(assumptions, entry);
  };

  // §69: download the working scenario as a CSV Excel opens directly.
  const handleExport = () => {
    if (!scenario) return;
    const csv = buildScenarioExportCsv({
      product,
      scenarioName: activeScenario?.name ?? "Working",
      assumptions,
      computed: scenario,
      generatedAt: new Date().toISOString(),
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = scenarioExportFilename(product, activeScenario?.name ?? "working");
    anchor.click();
    URL.revokeObjectURL(url);
  };

  // §45: profile economics enter as the "customer" layer over the working set.
  const applyRetailerProfile = (id: string) => {
    const profile = retailerProfiles.find((r) => r.id === id);
    if (!profile) return;
    const layers: AssumptionLayer[] = [
      { scope: "customer", values: retailerProfileValues(profile) },
    ];
    // §47 default relationship: the retailer brings its usual distributor.
    const defaultDistributor = profile.defaultDistributorProfileId
      ? distributorProfiles.find((d) => d.id === profile.defaultDistributorProfileId) ?? null
      : null;
    layers.push({ scope: "customer", values: distributorProfileValues(defaultDistributor) });
    const resolved = resolveAssumptions(assumptions, layers);
    setAppliedRetailerId(id);
    setAppliedDistributorId(defaultDistributor ? defaultDistributor.id : "direct");
    applyAssumptions(resolved.assumptions);
  };

  const applyDistributorProfile = (id: string | null) => {
    const profile = id ? distributorProfiles.find((d) => d.id === id) ?? null : null;
    const resolved = resolveAssumptions(assumptions, [
      { scope: "customer", values: distributorProfileValues(profile) },
    ]);
    setAppliedDistributorId(profile ? profile.id : "direct");
    applyAssumptions(resolved.assumptions);
  };

  return (
    <TooltipProvider delay={200}>
      <div className="flex min-h-dvh flex-col bg-background">
        <TopBar
          products={products.map(({ id, basics }) => ({ id, name: basics.name }))}
          activeProductId={product.id}
          onSelectProduct={setActiveProductId}
          routeLabel={`Route ${product.route}: ${CHANNEL_ROUTES[product.route].label}`}
          onReset={() => applyAssumptions(savedAssumptions)}
          scenario={{
            scenarios: scenariosForActiveProduct.map(({ id, name }) => ({ id, name })),
            activeScenarioId: activeScenario?.id ?? null,
            dirty,
            onSelectScenario: setActiveScenarioId,
            onSave: handleSave,
            onDuplicate: () => setNameDialog("duplicate"),
            onCompare: () => setCompareOpen(true),
            onHistory: () => setHistoryOpen(true),
            onExport: scenario ? handleExport : null,
          }}
          profiles={{
            retailers: retailerProfiles.map(({ id, name }) => ({ id, name })),
            distributors: distributorProfiles.map(({ id, name }) => ({ id, name })),
            appliedRetailerId,
            appliedDistributorId,
            onApplyRetailer: applyRetailerProfile,
            onApplyDistributor: applyDistributorProfile,
            onManage: () => setProfileManagerOpen(true),
          }}
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

        {nameDialog !== null && (
          <ScenarioNameDialog
            title={nameDialog === "save" ? "Save scenario" : "Duplicate scenario"}
            defaultName={
              nameDialog === "duplicate" && activeScenario
                ? `${activeScenario.name} (copy)`
                : "Base"
            }
            takenNames={scenariosForActiveProduct.map((s) => s.name)}
            onSubmit={(name) => createScenarioForActiveProduct(name, assumptions)}
            onClose={() => setNameDialog(null)}
          />
        )}

        {compareOpen && (
          <CompareScenariosDialog
            scenarios={scenariosForActiveProduct}
            tradeSpendBands={tradeSpendBands}
            onClose={() => setCompareOpen(false)}
          />
        )}

        {historyOpen && activeScenario && (
          <ScenarioHistoryDialog scenario={activeScenario} onClose={() => setHistoryOpen(false)} />
        )}

        {profileManagerOpen && (
          <ProfileManagerDialog onClose={() => setProfileManagerOpen(false)} />
        )}
      </div>
    </TooltipProvider>
  );
}
