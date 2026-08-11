"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { computeScenario, type ComputedScenario } from "@/lib/scenario/computeScenario";
import {
  formatMoney,
  formatPercent,
  pointsToRateString,
  rateToPointsString,
  tryDec,
} from "@/lib/scenario/format";
import { portfolioStatus, type PortfolioStatus } from "@/lib/scenario/portfolio";
import { assumptionsForProduct, type ProductSetup } from "@/lib/scenario/product";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useBenchmarks } from "@/components/benchmarks/benchmark-provider";
import { EDITABLE_CLASSES } from "@/components/pricing/inputs";
import { useProfiles } from "@/components/profiles/profiles-provider";
import { useProducts } from "@/components/setup/product-provider";

/**
 * Product portfolio (PRD §44): every product priced from its active scenario,
 * with the configurable green/yellow/red commercial-health thresholds.
 */

const STATUS_STYLES: Record<PortfolioStatus | "unknown", { dot: string; label: string }> = {
  green: { dot: "bg-emerald-500", label: "Healthy" },
  yellow: { dot: "bg-amber-500", label: "Review" },
  red: { dot: "bg-red-500", label: "Below threshold" },
  unknown: { dot: "bg-muted-foreground/40", label: "No shelf price" },
};

interface PortfolioRow {
  product: ProductSetup;
  scenarioName: string;
  computed: ComputedScenario | null;
  error: string | null;
  status: PortfolioStatus | "unknown";
}

export function PortfolioScreen() {
  const router = useRouter();
  const { products, scenarios, activeScenarioIdByProduct, setActiveProductId } = useProducts();
  const { tradeSpendBands } = useBenchmarks();
  const { portfolioSettings, savePortfolioSettings } = useProfiles();

  const rows = useMemo<PortfolioRow[]>(
    () =>
      products.map((product) => {
        const productScenarios = scenarios.filter((s) => s.productId === product.id);
        const active =
          productScenarios.find((s) => s.id === activeScenarioIdByProduct[product.id]) ??
          productScenarios[0] ??
          null;
        const assumptions = active?.assumptions ?? assumptionsForProduct(product);
        const computation = computeScenario(assumptions, { tradeSpendBands });
        if (!computation.ok) {
          return {
            product,
            scenarioName: active?.name ?? "—",
            computed: null,
            error: computation.error,
            status: "unknown" as const,
          };
        }
        const cm = computation.scenario.atCurrentSrp?.contribution.contributionMarginRate;
        const target = tryDec(assumptions.targetContributionRate);
        const status: PortfolioRow["status"] =
          cm && target ? portfolioStatus(cm, target, portfolioSettings) : "unknown";
        return {
          product,
          scenarioName: active?.name ?? "—",
          computed: computation.scenario,
          error: null,
          status,
        };
      }),
    [products, scenarios, activeScenarioIdByProduct, tradeSpendBands, portfolioSettings],
  );

  const openProduct = (id: string) => {
    setActiveProductId(id);
    router.push("/");
  };

  return (
    <TooltipProvider delay={200}>
      <div className="flex min-h-dvh flex-col bg-background">
        <header className="flex flex-wrap items-center gap-2 border-b bg-card px-4 py-2.5">
          <div className="mr-2 flex items-baseline gap-2">
            <span className="text-sm font-semibold">Akif CPG</span>
            <span className="text-xs text-muted-foreground">Portfolio</span>
          </div>
          <Link
            href="/"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 gap-1 text-xs")}
          >
            <ArrowLeft className="size-3" aria-hidden /> Back to pricing
          </Link>
          <div className="ml-auto flex flex-wrap items-end gap-3 text-xs">
            <label className="flex items-center gap-1.5 text-muted-foreground">
              Red below CM %
              <Input
                inputMode="decimal"
                value={rateToPointsString(portfolioSettings.redContributionBelow)}
                onChange={(event) =>
                  savePortfolioSettings({
                    ...portfolioSettings,
                    redContributionBelow: pointsToRateString(event.target.value),
                  })
                }
                className={cn(EDITABLE_CLASSES, "h-7 w-16 text-right font-mono text-xs tabular-nums")}
              />
            </label>
            <label className="flex items-center gap-1.5 text-muted-foreground">
              Green tolerance pp
              <Input
                inputMode="decimal"
                value={rateToPointsString(portfolioSettings.greenTargetTolerance)}
                onChange={(event) =>
                  savePortfolioSettings({
                    ...portfolioSettings,
                    greenTargetTolerance: pointsToRateString(event.target.value),
                  })
                }
                className={cn(EDITABLE_CLASSES, "h-7 w-16 text-right font-mono text-xs tabular-nums")}
              />
            </label>
          </div>
        </header>

        <main className="flex-1 p-3 lg:p-4">
          <Card className="gap-3 py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-sm">
                Portfolio — {products.length} product{products.length === 1 ? "" : "s"}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-1.5 pr-2 font-medium">SKU</th>
                      <th className="py-1.5 pr-2 font-medium">Product</th>
                      <th className="py-1.5 pr-2 font-medium">Scenario</th>
                      <th className="py-1.5 pr-2 text-right font-medium">COGS</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Landed</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Invoice</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Distributor</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Retailer</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Req. SRP</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Trade %</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Brand GM</th>
                      <th className="py-1.5 pr-2 text-right font-medium">CM</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Mfr margin</th>
                      <th className="py-1.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const c = row.computed;
                      const style = STATUS_STYLES[row.status];
                      return (
                        <tr
                          key={row.product.id}
                          className="cursor-pointer border-b border-border/50 transition-colors hover:bg-accent/40"
                          onClick={() => openProduct(row.product.id)}
                        >
                          <td className="py-2 pr-2 font-mono">{row.product.basics.sku}</td>
                          <td className="py-2 pr-2">{row.product.basics.name}</td>
                          <td className="py-2 pr-2 text-muted-foreground">{row.scenarioName}</td>
                          {c ? (
                            <>
                              <td className="py-2 pr-2 text-right font-mono tabular-nums">
                                {formatMoney(c.manufacturer.cogsPerUnit)}
                              </td>
                              <td className="py-2 pr-2 text-right font-mono tabular-nums">
                                {formatMoney(c.landed.landedCostPerUnit)}
                              </td>
                              <td className="py-2 pr-2 text-right font-mono tabular-nums">
                                {formatMoney(c.requiredInvoicePerUnit)}
                              </td>
                              <td className="py-2 pr-2 text-right font-mono tabular-nums">
                                {c.sensitivityBase.distributor
                                  ? formatPercent(
                                      tryDec(
                                        String(c.sensitivityBase.distributor.marginSpec.rate),
                                      ) ?? tryDec("0")!,
                                      1,
                                    )
                                  : "Direct"}
                              </td>
                              <td className="py-2 pr-2 text-right font-mono tabular-nums">
                                {formatPercent(
                                  tryDec(String(c.sensitivityBase.retailerMarginSpec.rate)) ??
                                    tryDec("0")!,
                                  1,
                                )}
                              </td>
                              <td className="py-2 pr-2 text-right font-mono tabular-nums">
                                {formatMoney(c.requiredSrpPerUnit)}
                              </td>
                              <td className="py-2 pr-2 text-right font-mono tabular-nums">
                                {formatPercent(c.tradeSpend.totalRate, 1)}
                              </td>
                              <td className="py-2 pr-2 text-right font-mono tabular-nums">
                                {formatPercent(c.brandGrossMarginRate, 1)}
                              </td>
                              <td className="py-2 pr-2 text-right font-mono tabular-nums">
                                {c.atCurrentSrp
                                  ? formatPercent(c.atCurrentSrp.contribution.contributionMarginRate)
                                  : "—"}
                              </td>
                              <td className="py-2 pr-2 text-right font-mono tabular-nums">
                                {formatPercent(c.manufacturer.marginRate, 1)}
                              </td>
                            </>
                          ) : (
                            <td colSpan={11} className="py-2 pr-2 text-muted-foreground">
                              {row.error}
                            </td>
                          )}
                          <td className="py-2">
                            <span className="flex items-center gap-1.5 whitespace-nowrap">
                              <span className={cn("size-2.5 rounded-full", style.dot)} aria-hidden />
                              {style.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Click a row to open the product on the pricing screen. Status: green = contribution
                at or above target (within tolerance), yellow = review economics, red = below the
                red threshold. Thresholds are editable above and persist.
              </p>
            </CardContent>
          </Card>
        </main>
      </div>
    </TooltipProvider>
  );
}
