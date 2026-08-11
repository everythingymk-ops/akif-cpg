"use client";

import Link from "next/link";
import { Columns3, History, Plus, RotateCcw, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface ScenarioControls {
  scenarios: { id: string; name: string }[];
  activeScenarioId: string | null;
  /** Working assumptions differ from the saved scenario. */
  dirty: boolean;
  onSelectScenario: (id: string) => void;
  onSave: () => void;
  onDuplicate: () => void;
  onCompare: () => void;
  onHistory: () => void;
}

/**
 * Top bar (PRD §58): product switcher, scenario switcher and the §70 actions.
 * Export still waits for its roadmap step and says so.
 */
export function TopBar({
  products,
  activeProductId,
  onSelectProduct,
  routeLabel,
  onReset,
  scenario,
}: {
  products: { id: string; name: string }[];
  activeProductId: string;
  onSelectProduct: (id: string) => void;
  routeLabel: string;
  onReset: () => void;
  scenario: ScenarioControls;
}) {
  const activeScenarioName =
    scenario.scenarios.find((s) => s.id === scenario.activeScenarioId)?.name ?? "No scenario";

  return (
    <header className="flex flex-wrap items-center gap-2 border-b bg-card px-4 py-2.5">
      <div className="mr-2 flex items-baseline gap-2">
        <span className="text-sm font-semibold">Akif CPG</span>
        <span className="text-xs text-muted-foreground">Pricing Architect</span>
      </div>

      <Select
        value={activeProductId}
        onValueChange={(value) => {
          if (value) onSelectProduct(value);
        }}
      >
        <SelectTrigger size="sm" className="w-[210px] text-xs" aria-label="Product">
          <SelectValue>
            {products.find((product) => product.id === activeProductId)?.name ?? "Select product"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {products.map((product) => (
            <SelectItem key={product.id} value={product.id}>
              {product.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Link
        href="/setup"
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 gap-1 text-xs")}
      >
        <Plus className="size-3" aria-hidden /> New product
      </Link>

      <Select
        value={scenario.activeScenarioId ?? ""}
        onValueChange={(value) => {
          if (value) scenario.onSelectScenario(value);
        }}
      >
        <SelectTrigger size="sm" className="w-[170px] text-xs" aria-label="Scenario">
          <SelectValue>
            <span className="flex items-center gap-1.5">
              Scenario: {activeScenarioName}
              {scenario.dirty && (
                <span
                  className="size-1.5 rounded-full bg-amber-500"
                  aria-label="Unsaved changes"
                  title="Unsaved changes"
                />
              )}
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {scenario.scenarios.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Badge variant="outline" className="text-[11px] text-muted-foreground">
        {routeLabel}
      </Badge>

      <div className="ml-auto flex items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={onReset}>
                <RotateCcw className="size-3" aria-hidden /> Reset
              </Button>
            }
          />
          <TooltipContent className="text-xs">
            Discard unsaved edits — back to the saved scenario
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={scenario.dirty ? "default" : "outline"}
                size="sm"
                className="h-8 gap-1 text-xs"
                onClick={scenario.onSave}
              >
                <Save className="size-3" aria-hidden /> Save
                {scenario.dirty && <span className="size-1.5 rounded-full bg-amber-400" aria-hidden />}
              </Button>
            }
          />
          <TooltipContent className="text-xs">
            Save working assumptions into this scenario (records the change history)
          </TooltipContent>
        </Tooltip>

        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={scenario.onDuplicate}>
          Duplicate
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1 text-xs"
          onClick={scenario.onCompare}
          disabled={scenario.scenarios.length < 2}
        >
          <Columns3 className="size-3" aria-hidden /> Compare
        </Button>

        <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={scenario.onHistory}>
          <History className="size-3" aria-hidden /> History
        </Button>

        <Tooltip>
          <TooltipTrigger
            render={
              <span tabIndex={0} className="inline-flex">
                <Button variant="outline" size="sm" className="h-8 text-xs" disabled>
                  Export
                </Button>
              </span>
            }
          />
          <TooltipContent className="text-xs">CSV/Excel export arrives in a later step</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
