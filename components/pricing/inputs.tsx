"use client";

import { useId } from "react";
import type { MarginBasis } from "@/lib/pricing-engine";
import { pointsToRateString, rateToPointsString } from "@/lib/scenario/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
 * Editable fields are unmistakably blue (PRD §59) — users never guess what
 * they can change. Rates are stored as decimal fractions (PRD §61) but typed
 * as percentage points.
 */
export const EDITABLE_CLASSES = cn(
  "border-editable-border bg-editable-bg text-editable-ink",
  "focus-visible:border-editable focus-visible:ring-editable/30",
);

interface FieldShellProps {
  label: string;
  hint?: string;
  htmlFor: string;
  children: React.ReactNode;
}

function FieldShell({ label, hint, htmlFor, children }: FieldShellProps) {
  const labelElement = (
    <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
      {label}
    </Label>
  );
  return (
    <div className="space-y-1">
      {hint ? (
        <Tooltip>
          <TooltipTrigger render={labelElement} />
          <TooltipContent side="top" className="max-w-xs text-xs">
            {hint}
          </TooltipContent>
        </Tooltip>
      ) : (
        labelElement
      )}
      {children}
    </div>
  );
}

interface MoneyFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}

export function MoneyField({ label, value, onChange, hint }: MoneyFieldProps) {
  const id = useId();
  return (
    <FieldShell label={label} hint={hint} htmlFor={id}>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-editable/70">
          $
        </span>
        <Input
          id={id}
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cn(EDITABLE_CLASSES, "pl-6 font-mono text-sm tabular-nums")}
        />
      </div>
    </FieldShell>
  );
}

interface PercentFieldProps {
  label: string;
  /** Decimal-fraction rate string, e.g. "0.15" for 15%. */
  rate: string;
  onChange: (rate: string) => void;
  hint?: string;
}

export function PercentField({ label, rate, onChange, hint }: PercentFieldProps) {
  const id = useId();
  return (
    <FieldShell label={label} hint={hint} htmlFor={id}>
      <div className="relative">
        <Input
          id={id}
          inputMode="decimal"
          value={rateToPointsString(rate)}
          onChange={(event) => onChange(pointsToRateString(event.target.value))}
          className={cn(EDITABLE_CLASSES, "pr-7 font-mono text-sm tabular-nums")}
        />
        <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-editable/70">
          %
        </span>
      </div>
    </FieldShell>
  );
}

interface BasisSelectProps {
  label: string;
  value: MarginBasis;
  onChange: (value: MarginBasis) => void;
}

/** Margin vs markup is always an explicit choice (PRD §8). */
export function BasisSelect({ label, value, onChange }: BasisSelectProps) {
  const id = useId();
  return (
    <FieldShell
      label={label}
      hint="A 20% markup and a 20% margin produce different selling prices. Margin = profit ÷ selling price; markup = profit ÷ cost."
      htmlFor={id}
    >
      <Select value={value} onValueChange={(next) => onChange(next as MarginBasis)}>
        <SelectTrigger id={id} size="sm" className={cn(EDITABLE_CLASSES, "w-full text-sm")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="margin">Margin (profit ÷ selling price)</SelectItem>
          <SelectItem value="markup">Markup (profit ÷ cost)</SelectItem>
        </SelectContent>
      </Select>
    </FieldShell>
  );
}

/** Small toggle pill for mutually exclusive input modes (selected = editable-blue). */
export function ModeButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "rounded-md border px-2 py-1.5 text-xs transition-colors",
        selected
          ? "border-editable-border bg-editable-bg font-semibold text-editable-ink"
          : "border-border text-muted-foreground hover:bg-accent/50",
      )}
    >
      {children}
    </button>
  );
}

/** Gray, read-only calculated value (PRD §59). */
export function CalculatedValue({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums text-muted-foreground">{children}</span>
    </div>
  );
}
