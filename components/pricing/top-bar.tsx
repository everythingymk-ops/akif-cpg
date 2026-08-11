"use client";

import Link from "next/link";
import { Plus, RotateCcw } from "lucide-react";
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

/**
 * Top bar (PRD §58): product switcher (in-memory store), the active route,
 * and the actions that arrive in later roadmap steps — visible but honest
 * about when they land.
 */
export function TopBar({
  products,
  activeProductId,
  onSelectProduct,
  routeLabel,
  onReset,
}: {
  products: { id: string; name: string }[];
  activeProductId: string;
  onSelectProduct: (id: string) => void;
  routeLabel: string;
  onReset: () => void;
}) {
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
        <SelectTrigger size="sm" className="w-[230px] text-xs" aria-label="Product">
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

      <Link href="/setup" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 gap-1 text-xs")}>
        <Plus className="size-3" aria-hidden /> New product
      </Link>

      <Badge variant="outline" className="text-[11px] text-muted-foreground">
        {routeLabel}
      </Badge>

      <div className="ml-auto flex items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={onReset}>
                <RotateCcw className="size-3" aria-hidden /> Reset assumptions
              </Button>
            }
          />
          <TooltipContent className="text-xs">
            Restore this product&apos;s initial assumptions
          </TooltipContent>
        </Tooltip>
        <DisabledAction label="Save" note="Scenario persistence arrives in a later step" />
        <DisabledAction label="Duplicate" note="Scenario persistence arrives in a later step" />
        <DisabledAction label="Export" note="CSV/Excel export arrives in a later step" />
      </div>
    </header>
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
