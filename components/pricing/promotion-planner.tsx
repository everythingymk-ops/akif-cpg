"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  PricingEngineError,
  findTradeSpendBand,
  type Promotion,
  type PromotionType,
  type TradeSpendResult,
} from "@/lib/pricing-engine";
import type { ScenarioAssumptions } from "@/lib/scenario/assumptions";
import { DEFAULT_COACH_GROSS_SALES, tangibleTradeSpend } from "@/lib/scenario/coach";
import { computePlannedTradeSpend } from "@/lib/scenario/computeScenario";
import {
  formatMoneyWhole,
  formatPercent,
  pointsToRateString,
  rateToPointsString,
} from "@/lib/scenario/format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { BandEditorDialog } from "@/components/benchmarks/band-editor";
import { useBenchmarks } from "@/components/benchmarks/benchmark-provider";
import { EDITABLE_CLASSES } from "./inputs";

/**
 * Promotion Planner (PRD §16 Mode B, §17–21): unlimited promotion rows priced
 * live by the trade spend engine, with the §24 planning-band read, the §78
 * coach and the §79 BOGO caveat. Nothing touches the model until the user
 * explicitly applies the plan (PRD §40). Mount only while open.
 */

const PROMOTION_TYPES: { value: PromotionType; label: string }[] = [
  { value: "bogo", label: "BOGO" },
  { value: "bogo50", label: "BOGO 50%" },
  { value: "buy2get1", label: "Buy 2 Get 1" },
  { value: "tpr", label: "Temporary Price Reduction" },
  { value: "offInvoice", label: "Off Invoice" },
  { value: "scanback", label: "Scanback" },
  { value: "featureAd", label: "Feature Ad" },
  { value: "display", label: "Display" },
  { value: "featureAndDisplay", label: "Feature + Display" },
  { value: "introductoryAllowance", label: "Introductory Allowance" },
  { value: "caseAllowance", label: "Case Allowance" },
  { value: "freeFill", label: "Free Fill" },
  { value: "newStoreOpening", label: "New Store Opening" },
  { value: "loyalty", label: "Loyalty Promotion" },
  { value: "digitalCoupon", label: "Digital Coupon" },
  { value: "retailerCoupon", label: "Retailer Coupon" },
  { value: "markdownSupport", label: "Markdown Support" },
  { value: "other", label: "Other" },
];

const LIFT_PRESETS = ["1.0", "1.25", "1.5", "1.75", "2.0", "2.5", "3.0"];
const BOGO_FAMILY: PromotionType[] = ["bogo", "bogo50", "buy2get1"];

type PromotionDraft = Promotion & { id: string };

const emptyPromotion = (): PromotionDraft => ({
  id: crypto.randomUUID(),
  name: "",
  type: "tpr",
  events: "",
  weeks: "",
  discountRate: "",
  brandFundingRate: "1",
  retailerFundingRate: "",
  distributorFundingRate: "",
  salesLift: "",
  fixedEventFee: "",
  additionalCost: "",
  estimatedUnits: "",
  startDate: "",
  endDate: "",
});

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const labelNode = <span className="text-[11px] text-muted-foreground">{label}</span>;
  return (
    <label className="flex min-w-0 flex-col gap-1">
      {hint ? (
        <Tooltip>
          <TooltipTrigger render={labelNode} />
          <TooltipContent className="max-w-xs text-xs">{hint}</TooltipContent>
        </Tooltip>
      ) : (
        labelNode
      )}
      {children}
    </label>
  );
}

export function PromotionPlannerDialog({
  assumptions,
  onApply,
  onClose,
}: {
  assumptions: ScenarioAssumptions;
  onApply: (patch: Partial<ScenarioAssumptions>) => void;
  onClose: () => void;
}) {
  const { tradeSpendBands } = useBenchmarks();
  const [promotions, setPromotions] = useState<PromotionDraft[]>(() =>
    assumptions.promotions.length > 0
      ? assumptions.promotions.map((promotion) => ({
          ...emptyPromotion(),
          ...promotion,
          id: promotion.id ?? crypto.randomUUID(),
        }))
      : [emptyPromotion()],
  );
  const [annualWeeks, setAnnualWeeks] = useState(assumptions.annualWeeks || "52");
  const [normalWeeklyUnits, setNormalWeeklyUnits] = useState(assumptions.normalWeeklyUnits);
  const [invoiceReference, setInvoiceReference] = useState(
    assumptions.plannerInvoiceReferencePerUnit,
  );
  const [coachGrossSales, setCoachGrossSales] = useState(DEFAULT_COACH_GROSS_SALES);
  const [bandsOpen, setBandsOpen] = useState(false);

  const patchPromotion = (id: string, patch: Partial<PromotionDraft>) =>
    setPromotions((previous) => previous.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const preview = useMemo<{ plan: TradeSpendResult | null; error: string | null }>(() => {
    try {
      const plan = computePlannedTradeSpend({
        promotions,
        annualWeeks,
        additionalReserveRate: assumptions.additionalReserveRate,
        normalWeeklyUnits,
        plannerInvoiceReferencePerUnit: invoiceReference,
      });
      return { plan, error: null };
    } catch (error) {
      if (error instanceof PricingEngineError) return { plan: null, error: error.message };
      throw error;
    }
  }, [promotions, annualWeeks, normalWeeklyUnits, invoiceReference, assumptions.additionalReserveRate]);

  const band = preview.plan
    ? findTradeSpendBand(preview.plan.totalTradeRate, tradeSpendBands)
    : undefined;
  const coach = preview.plan
    ? (() => {
        try {
          return tangibleTradeSpend(preview.plan.totalTradeRate, coachGrossSales);
        } catch {
          return null;
        }
      })()
    : null;
  const hasBogo = promotions.some((promotion) => BOGO_FAMILY.includes(promotion.type));

  const apply = () => {
    onApply({
      tradeSpendMode: "calendar",
      promotions,
      annualWeeks,
      normalWeeklyUnits,
      plannerInvoiceReferencePerUnit: invoiceReference,
    });
    onClose();
  };

  const inputClasses = cn(EDITABLE_CLASSES, "h-8 text-sm");
  const numberClasses = cn(inputClasses, "text-right font-mono tabular-nums");

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Promotion Planner</DialogTitle>
          <DialogDescription>
            Build the trade-spend rate from the actual promotional calendar (PRD Mode B). The plan
            changes nothing until you apply it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-3">
          <Field label="Planning horizon (weeks)">
            <Input
              inputMode="decimal"
              value={annualWeeks}
              onChange={(event) => setAnnualWeeks(event.target.value)}
              className={cn(numberClasses, "w-24")}
            />
          </Field>
          <Field
            label="Normal week volume (units)"
            hint="Needed only when promotions carry fixed event fees, flat costs or unit forecasts — those must be rated against a real unit forecast."
          >
            <Input
              inputMode="decimal"
              placeholder="optional"
              value={normalWeeklyUnits}
              onChange={(event) => setNormalWeeklyUnits(event.target.value)}
              className={cn(numberClasses, "w-32")}
            />
          </Field>
          <Field
            label="Brand invoice reference ($/unit)"
            hint="Values fixed fees against gross revenue in actual-units mode. A working figure such as the current required invoice is fine."
          >
            <Input
              inputMode="decimal"
              placeholder="optional"
              value={invoiceReference}
              onChange={(event) => setInvoiceReference(event.target.value)}
              className={cn(numberClasses, "w-32")}
            />
          </Field>
        </div>

        <div className="space-y-3">
          {promotions.map((promotion, index) => (
            <div key={promotion.id} className="space-y-2.5 rounded-lg border px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Input
                  aria-label="Promotion name"
                  placeholder={`Promotion ${index + 1}`}
                  value={promotion.name}
                  onChange={(event) => patchPromotion(promotion.id, { name: event.target.value })}
                  className={cn(inputClasses, "flex-1")}
                />
                <Select
                  value={promotion.type}
                  onValueChange={(value) =>
                    value && patchPromotion(promotion.id, { type: value as PromotionType })
                  }
                >
                  <SelectTrigger size="sm" className={cn(EDITABLE_CLASSES, "w-44 text-xs")}>
                    <SelectValue>
                      {PROMOTION_TYPES.find((t) => t.value === promotion.type)?.label}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {PROMOTION_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${promotion.name || "promotion"}`}
                  onClick={() =>
                    setPromotions((previous) => previous.filter((p) => p.id !== promotion.id))
                  }
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Field label="Total promo weeks">
                  <Input
                    inputMode="decimal"
                    value={String(promotion.weeks ?? "")}
                    onChange={(event) => patchPromotion(promotion.id, { weeks: event.target.value })}
                    className={numberClasses}
                  />
                </Field>
                <Field label="Events">
                  <Input
                    inputMode="numeric"
                    placeholder="optional"
                    value={String(promotion.events ?? "")}
                    onChange={(event) => patchPromotion(promotion.id, { events: event.target.value })}
                    className={numberClasses}
                  />
                </Field>
                <Field label="Discount %">
                  <Input
                    inputMode="decimal"
                    placeholder="e.g. 25"
                    value={ratePoints(promotion.discountRate)}
                    onChange={(event) =>
                      patchPromotion(promotion.id, { discountRate: pointsRate(event.target.value) })
                    }
                    className={numberClasses}
                  />
                </Field>
                <Field
                  label="Sales lift ×"
                  hint="Sales lift represents promotional unit sales relative to a normal week. A 2.0x lift means the promotional week sells approximately twice normal weekly volume."
                >
                  <Input
                    inputMode="decimal"
                    list="lift-presets"
                    placeholder="e.g. 1.5"
                    value={String(promotion.salesLift ?? "")}
                    onChange={(event) =>
                      patchPromotion(promotion.id, { salesLift: event.target.value })
                    }
                    className={numberClasses}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <Field label="Brand funded %" hint="Who funds the promotion dramatically changes the brand's trade-spend burden. Only the brand-funded share counts here.">
                  <Input
                    inputMode="decimal"
                    value={ratePoints(promotion.brandFundingRate)}
                    onChange={(event) =>
                      patchPromotion(promotion.id, { brandFundingRate: pointsRate(event.target.value) })
                    }
                    className={numberClasses}
                  />
                </Field>
                <Field label="Retailer funded %">
                  <Input
                    inputMode="decimal"
                    placeholder="optional"
                    value={ratePoints(promotion.retailerFundingRate)}
                    onChange={(event) =>
                      patchPromotion(promotion.id, {
                        retailerFundingRate: pointsRate(event.target.value),
                      })
                    }
                    className={numberClasses}
                  />
                </Field>
                <Field label="Distributor funded %">
                  <Input
                    inputMode="decimal"
                    placeholder="optional"
                    value={ratePoints(promotion.distributorFundingRate)}
                    onChange={(event) =>
                      patchPromotion(promotion.id, {
                        distributorFundingRate: pointsRate(event.target.value),
                      })
                    }
                    className={numberClasses}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <Field label="Fixed event fee ($)" hint="Charged once per event. Requires an events count and the actual-units context above.">
                  <Input
                    inputMode="decimal"
                    placeholder="optional"
                    value={String(promotion.fixedEventFee ?? "")}
                    onChange={(event) =>
                      patchPromotion(promotion.id, { fixedEventFee: event.target.value })
                    }
                    className={numberClasses}
                  />
                </Field>
                <Field label="Additional cost ($)">
                  <Input
                    inputMode="decimal"
                    placeholder="optional"
                    value={String(promotion.additionalCost ?? "")}
                    onChange={(event) =>
                      patchPromotion(promotion.id, { additionalCost: event.target.value })
                    }
                    className={numberClasses}
                  />
                </Field>
                <Field label="Estimated promoted units" hint="Overrides weeks × lift × weekly units when you have a firmer forecast.">
                  <Input
                    inputMode="decimal"
                    placeholder="optional"
                    value={String(promotion.estimatedUnits ?? "")}
                    onChange={(event) =>
                      patchPromotion(promotion.id, { estimatedUnits: event.target.value })
                    }
                    className={numberClasses}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:max-w-sm">
                <Field label="Start date (optional)">
                  <Input
                    type="date"
                    value={promotion.startDate ?? ""}
                    onChange={(event) => patchPromotion(promotion.id, { startDate: event.target.value })}
                    className={inputClasses}
                  />
                </Field>
                <Field label="End date (optional)">
                  <Input
                    type="date"
                    value={promotion.endDate ?? ""}
                    onChange={(event) => patchPromotion(promotion.id, { endDate: event.target.value })}
                    className={inputClasses}
                  />
                </Field>
              </div>
            </div>
          ))}
          <datalist id="lift-presets">
            {LIFT_PRESETS.map((preset) => (
              <option key={preset} value={preset} />
            ))}
          </datalist>
          <Button variant="outline" size="sm" onClick={() => setPromotions((p) => [...p, emptyPromotion()])}>
            <Plus className="size-3.5" aria-hidden /> Add promotion
          </Button>
        </div>

        {preview.error ? (
          <Alert>
            <AlertTitle>The plan cannot be priced yet</AlertTitle>
            <AlertDescription>{preview.error}</AlertDescription>
          </Alert>
        ) : preview.plan ? (
          <div className="space-y-3 rounded-lg border bg-muted/30 px-4 py-3">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
              <PlanStat label="Mode" value={preview.plan.mode === "normalizedWeeks" ? "Normalized weeks" : "Actual units"} />
              <PlanStat label="Normal weeks" value={preview.plan.normalWeeks.toString()} />
              <PlanStat
                label={preview.plan.mode === "normalizedWeeks" ? "Equivalent units" : "Annual units"}
                value={preview.plan.annualUnits.toString()}
              />
              <PlanStat label="Promotional rate" value={formatPercent(preview.plan.promotionalTradeRate, 2)} />
              <PlanStat label="Additional reserve" value={formatPercent(preview.plan.additionalReserveRate, 2)} />
              <PlanStat label="Total planned trade spend" value={formatPercent(preview.plan.totalTradeRate, 2)} emphasize />
            </div>

            {preview.plan.breakdown.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-1 pr-2 font-medium">Promotion</th>
                      <th className="py-1 pr-2 text-right font-medium">Promo units</th>
                      <th className="py-1 pr-2 text-right font-medium">Variable</th>
                      <th className="py-1 pr-2 text-right font-medium">Fixed</th>
                      <th className="py-1 text-right font-medium">Share of rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.plan.breakdown.map((row, index) => (
                      <tr key={index} className="border-b border-border/50 font-mono tabular-nums">
                        <td className="py-1 pr-2 font-sans">{row.promotion.name || `Promotion ${index + 1}`}</td>
                        <td className="py-1 pr-2 text-right">{row.promoUnits.toString()}</td>
                        <td className="py-1 pr-2 text-right">{row.variableSpend.toFixed(2)}</td>
                        <td className="py-1 pr-2 text-right">{row.fixedSpend.toFixed(2)}</td>
                        <td className="py-1 text-right">{formatPercent(row.effectiveRate, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="space-y-2 border-t pt-2.5">
              {band && (
                <p className="text-xs leading-relaxed">
                  <Badge
                    className={cn(
                      "mr-1.5 align-middle text-[10px]",
                      band.advisorPriority === "warning" ? "bg-amber-500 text-white" : "bg-muted text-foreground",
                    )}
                  >
                    {band.label}
                  </Badge>
                  {band.guidance}
                </p>
              )}
              {coach && preview.plan && (
                <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                  You have allocated {formatPercent(preview.plan.totalTradeRate, 2)} of gross invoice
                  sales to trade spend. At
                  <Input
                    aria-label="Coach reference gross sales"
                    inputMode="numeric"
                    value={coachGrossSales}
                    onChange={(event) => setCoachGrossSales(event.target.value)}
                    className={cn(numberClasses, "inline-block h-6 w-28 px-1.5 text-xs")}
                  />
                  gross invoice sales → trade spend {formatMoneyWhole(coach.tradeSpendDollars)}, net
                  after trade {formatMoneyWhole(coach.netAfterTradeDollars)}.
                </p>
              )}
              {hasBogo && (
                <p className="text-xs text-muted-foreground">
                  A fully brand-funded BOGO can represent approximately a 50% discount across
                  promoted units, but actual brand cost depends on retailer reimbursement mechanics.
                  Confirm whether funding is based on scan data, wholesale cost, retail discount,
                  free units, or another agreement.
                </p>
              )}
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3 border-t pt-3">
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-xs text-muted-foreground"
              onClick={() => setBandsOpen(true)}
            >
              <Pencil className="size-3" aria-hidden /> Edit planning bands
            </Button>
          </div>
          <Button size="sm" disabled={preview.plan === null} onClick={apply}>
            Apply to model
          </Button>
        </div>

        {bandsOpen && <BandEditorDialog onClose={() => setBandsOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function PlanStat({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-mono tabular-nums", emphasize && "font-semibold")}>{value}</span>
    </div>
  );
}

// Percentage-point display helpers for promotion rate fields.
const ratePoints = (rate: Promotion["discountRate"] | undefined): string =>
  rate === undefined || String(rate).trim() === "" ? "" : rateToPointsString(String(rate));
const pointsRate = (points: string): string =>
  points.trim() === "" ? "" : pointsToRateString(points);
