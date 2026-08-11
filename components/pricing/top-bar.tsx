"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Top bar (PRD §58). One in-memory demo product for now; product/retailer/
 * distributor/scenario management and export land in later roadmap steps —
 * the controls are visible but say so instead of pretending to work.
 */
export function TopBar({
  productName,
  onReset,
}: {
  productName: string;
  onReset: () => void;
}) {
  return (
    <header className="flex flex-wrap items-center gap-2 border-b bg-card px-4 py-2.5">
      <div className="mr-2 flex items-baseline gap-2">
        <span className="text-sm font-semibold">Akif CPG</span>
        <span className="text-xs text-muted-foreground">Pricing Architect</span>
      </div>

      <Select value="demo" disabled>
        <SelectTrigger size="sm" className="w-[220px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="demo">{productName}</SelectItem>
        </SelectContent>
      </Select>

      <PlaceholderSelect label="Retailer" note="Retailer profiles arrive in a later step" />
      <PlaceholderSelect label="Distributor" note="Distributor profiles arrive in a later step" />
      <PlaceholderSelect label="Scenario: Base" note="Saved scenarios arrive in a later step" />

      <div className="ml-auto flex items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={onReset}>
                <RotateCcw className="size-3" aria-hidden /> Reset demo
              </Button>
            }
          />
          <TooltipContent className="text-xs">Restore the demo product assumptions</TooltipContent>
        </Tooltip>
        <DisabledAction label="Save" note="Scenario persistence arrives in a later step" />
        <DisabledAction label="Duplicate" note="Scenario persistence arrives in a later step" />
        <DisabledAction label="Export" note="CSV/Excel export arrives in a later step" />
      </div>
    </header>
  );
}

function PlaceholderSelect({ label, note }: { label: string; note: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span tabIndex={0} className="inline-flex">
            <Select disabled>
              <SelectTrigger size="sm" className="w-[150px] text-xs">
                <SelectValue placeholder={label} />
              </SelectTrigger>
            </Select>
          </span>
        }
      />
      <TooltipContent className="text-xs">{note}</TooltipContent>
    </Tooltip>
  );
}

function DisabledAction({ label, note }: { label: string; note: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span tabIndex={0} className="inline-flex">
            <Button variant="outline" size="sm" className="h-8 text-xs" disabled>
              {label}
            </Button>
          </span>
        }
      />
      <TooltipContent className="text-xs">{note}</TooltipContent>
    </Tooltip>
  );
}
