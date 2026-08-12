"use client";

import { useMemo, useState } from "react";
import type { TradeSpendBand } from "@/lib/pricing-engine";
import { computeScenario, type ComputedScenario } from "@/lib/scenario/computeScenario";
import { formatMoney, formatPercent, tryDec } from "@/lib/scenario/format";
import type { Scenario } from "@/lib/scenario/scenarios";
import { SCENARIO_NAME_PRESETS } from "@/lib/scenario/scenarios";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { EDITABLE_CLASSES } from "./inputs";

/** Scenario dialogs (PRD §37, §68, §70). All mount only while open. */

export function ScenarioNameDialog({
  title,
  defaultName,
  takenNames,
  onSubmit,
  onClose,
}: {
  title: string;
  defaultName: string;
  takenNames: string[];
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const trimmed = name.trim();
  const taken = takenNames.includes(trimmed);

  const submit = () => {
    if (trimmed === "" || taken) return;
    onSubmit(trimmed);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Name the scenario — presets per the PRD, or your own.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-1.5">
          {SCENARIO_NAME_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setName(preset)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                name === preset
                  ? "border-editable-border bg-editable-bg font-semibold text-editable-ink"
                  : "border-border text-muted-foreground hover:bg-accent/50",
                takenNames.includes(preset) && "opacity-40",
              )}
            >
              {preset}
            </button>
          ))}
        </div>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && submit()}
          className={cn(EDITABLE_CLASSES, "text-sm")}
          aria-label="Scenario name"
        />
        {taken && (
          <p className="text-xs text-warning">
            A scenario with this name already exists for this product.
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={trimmed === "" || taken} onClick={submit}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface CompareColumn {
  scenario: Scenario;
  computed: ComputedScenario | null;
  error: string | null;
}

/** Side-by-side scenario comparison (PRD §37). */
export function CompareScenariosDialog({
  scenarios,
  tradeSpendBands,
  onClose,
}: {
  scenarios: Scenario[];
  tradeSpendBands: readonly TradeSpendBand[];
  onClose: () => void;
}) {
  const columns = useMemo<CompareColumn[]>(
    () =>
      scenarios.map((scenario) => {
        const computation = computeScenario(scenario.assumptions, { tradeSpendBands });
        return computation.ok
          ? { scenario, computed: computation.scenario, error: null }
          : { scenario, computed: null, error: computation.error };
      }),
    [scenarios, tradeSpendBands],
  );

  const rows: { label: string; value: (column: CompareColumn) => string }[] = [
    {
      label: "Manufacturing COGS",
      value: (c) => {
        const parsed = tryDec(c.scenario.assumptions.cogsPerUnit);
        return parsed ? formatMoney(parsed) : "—";
      },
    },
    { label: "Landed cost", value: (c) => (c.computed ? formatMoney(c.computed.landed.landedCostPerUnit) : "—") },
    { label: "Trade spend", value: (c) => (c.computed ? formatPercent(c.computed.tradeSpend.totalRate, 2) : "—") },
    {
      label: "Distributor margin",
      value: (c) => {
        if (!c.scenario.assumptions.useDistributor) return "—";
        const parsed = tryDec(c.scenario.assumptions.distributorMarginRate);
        return parsed ? formatPercent(parsed, 1) : "—";
      },
    },
    {
      label: "Retailer margin",
      value: (c) => {
        const parsed = tryDec(c.scenario.assumptions.retailerMarginRate);
        return parsed ? formatPercent(parsed, 1) : "—";
      },
    },
    { label: "Brand invoice", value: (c) => (c.computed ? formatMoney(c.computed.requiredInvoicePerUnit) : "—") },
    { label: "Required SRP", value: (c) => (c.computed ? formatMoney(c.computed.requiredSrpPerUnit) : "—") },
    {
      label: "Brand gross margin",
      value: (c) => (c.computed ? formatPercent(c.computed.brandGrossMarginRate, 1) : "—"),
    },
    {
      label: "Contribution @ current SRP",
      value: (c) =>
        c.computed?.atCurrentSrp
          ? formatPercent(c.computed.atCurrentSrp.contribution.contributionMarginRate)
          : "—",
    },
    {
      label: "Manufacturer margin",
      value: (c) => (c.computed ? formatPercent(c.computed.manufacturer.marginRate, 1) : "—"),
    },
  ];

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Compare scenarios</DialogTitle>
          <DialogDescription>
            Every figure recomputed live from each scenario&apos;s assumptions.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-1.5 pr-3 font-medium">Field</th>
                {columns.map((column) => (
                  <th key={column.scenario.id} className="py-1.5 pl-3 text-right font-medium">
                    {column.scenario.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-border/50">
                  <td className="py-1.5 pr-3 text-muted-foreground">{row.label}</td>
                  {columns.map((column) => (
                    <td key={column.scenario.id} className="py-1.5 pl-3 text-right font-mono tabular-nums">
                      {row.value(column)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {columns.some((column) => column.error) && (
          <p className="text-xs text-warning">
            {columns
              .filter((column) => column.error)
              .map((column) => `${column.scenario.name}: ${column.error}`)
              .join(" · ")}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Assumption audit trail of a scenario (PRD §68). */
export function ScenarioHistoryDialog({
  scenario,
  onClose,
}: {
  scenario: Scenario;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>History — {scenario.name}</DialogTitle>
          <DialogDescription>
            What changed on each save, oldest at the bottom.
          </DialogDescription>
        </DialogHeader>
        {scenario.history.length === 0 ? (
          <EmptyState
            icon={History}
            title="No saved changes yet"
            hint="Save the scenario after editing assumptions to start the trail."
          />
        ) : (
          <ol className="space-y-3">
            {scenario.history.map((entry) => (
              <li key={entry.at} className="rounded-lg border px-3 py-2.5">
                <div className="mb-1.5 font-mono text-[11px] text-muted-foreground">
                  {new Date(entry.at).toLocaleString("en-US")}
                </div>
                <ul className="space-y-0.5 text-sm">
                  {entry.changes.map((change, index) => (
                    <li key={index} className="flex items-baseline justify-between gap-3">
                      <span className="text-muted-foreground">{change.label}</span>
                      <span className="font-mono text-xs tabular-nums">
                        {change.from} → {change.to}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
