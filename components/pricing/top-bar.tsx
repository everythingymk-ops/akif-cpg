"use client";

import Link from "next/link";
import { Columns3, Contact, Download, History, LayoutGrid, Plus, RotateCcw, Save } from "lucide-react";
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
  /** Null while the model cannot be exported (calculation error). */
  onExport: (() => void) | null;
}

export interface ProfileControls {
  retailers: { id: string; name: string }[];
  distributors: { id: string; name: string }[];
  appliedRetailerId: string | null;
  appliedDistributorId: string | null;
  onApplyRetailer: (id: string) => void;
  /** null applies the direct (no distributor) relationship. */
  onApplyDistributor: (id: string | null) => void;
  onManage: () => void;
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
  profiles,
}: {
  products: { id: string; name: string }[];
  activeProductId: string;
  onSelectProduct: (id: string) => void;
  routeLabel: string;
  onReset: () => void;
  scenario: ScenarioControls;
  profiles: ProfileControls;
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

      <Link
        href="/portfolio"
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 gap-1 text-xs")}
      >
        <LayoutGrid className="size-3" aria-hidden /> Portfolio
      </Link>

      <Tooltip>
        <TooltipTrigger
          render={
            <span className="inline-flex">
              <Select
                value={profiles.appliedRetailerId ?? ""}
                onValueChange={(value) => {
                  if (value) profiles.onApplyRetailer(value);
                }}
              >
                <SelectTrigger size="sm" className="w-[150px] text-xs" aria-label="Retailer profile">
                  <SelectValue>
                    {profiles.appliedRetailerId
                      ? profiles.retailers.find((r) => r.id === profiles.appliedRetailerId)?.name
                      : "Retailer…"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {profiles.retailers.length === 0 && (
                    <SelectItem value="none" disabled>
                      No profiles yet
                    </SelectItem>
                  )}
                  {profiles.retailers.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </span>
          }
        />
        <TooltipContent className="text-xs">
          Apply a retailer profile&apos;s economics to this scenario (customer priority, §45)
        </TooltipContent>
      </Tooltip>

      <Select
        value={profiles.appliedDistributorId ?? ""}
        onValueChange={(value) => {
          if (value) profiles.onApplyDistributor(value === "direct" ? null : value);
        }}
      >
        <SelectTrigger size="sm" className="w-[150px] text-xs" aria-label="Distributor profile">
          <SelectValue>
            {profiles.appliedDistributorId === null
              ? "Distributor…"
              : profiles.appliedDistributorId === "direct"
                ? "Direct (no distributor)"
                : profiles.distributors.find((d) => d.id === profiles.appliedDistributorId)?.name}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="direct">Direct (no distributor)</SelectItem>
          {profiles.distributors.map((d) => (
            <SelectItem key={d.id} value={d.id}>
              {d.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={profiles.onManage}
            >
              <Contact className="size-3" aria-hidden /> Profiles
            </Button>
          }
        />
        <TooltipContent className="text-xs">Manage retailer & distributor profiles</TooltipContent>
      </Tooltip>

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
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 text-xs"
                  disabled={scenario.onExport === null}
                  onClick={scenario.onExport ?? undefined}
                >
                  <Download className="size-3" aria-hidden /> Export
                </Button>
              </span>
            }
          />
          <TooltipContent className="text-xs">
            Download this scenario as CSV (opens in Excel): assumptions, waterfall, promotions,
            trade spend, outputs, sensitivity
          </TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
