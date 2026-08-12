"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { AdvisorPriority, TradeSpendBand } from "@/lib/pricing-engine";
import { pointsToRateString, rateToPointsString } from "@/lib/scenario/format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { EDITABLE_CLASSES } from "@/components/pricing/inputs";
import { useBenchmarks } from "./benchmark-provider";

/**
 * Benchmark Settings (PRD §24, §55): the trade-spend planning bands as an
 * editable table. Guidance stays guidance — these records feed the coach and
 * the Advisor, they never change a financial input.
 */
/** Mount this dialog only while it is open — the draft seeds at mount. */
export function BandEditorDialog({ onClose }: { onClose: () => void }) {
  const { tradeSpendBands, setTradeSpendBands, resetTradeSpendBands } = useBenchmarks();
  const [draft, setDraft] = useState<TradeSpendBand[]>(() =>
    tradeSpendBands.map((band) => ({ ...band })),
  );

  const patchBand = (id: string, patch: Partial<TradeSpendBand>) =>
    setDraft((previous) => previous.map((band) => (band.id === id ? { ...band, ...patch } : band)));

  const save = () => {
    setTradeSpendBands(draft.filter((band) => band.label.trim() !== ""));
    onClose();
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Trade-spend planning bands</DialogTitle>
          <DialogDescription>
            Planning heuristics, not facts or guarantees — edit the ranges and guidance your team
            plans with. Rates are percentage points of gross sales.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {draft.map((band) => (
            <div key={band.id} className="space-y-2 rounded-lg border px-3 py-2.5">
              <div className="grid grid-cols-[1fr_84px_84px_130px_32px] items-end gap-2">
                <label className="text-xs text-muted-foreground">
                  Label
                  <Input
                    value={band.label}
                    onChange={(event) => patchBand(band.id, { label: event.target.value })}
                    className={cn(EDITABLE_CLASSES, "mt-1 text-sm")}
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  From %
                  <Input
                    inputMode="decimal"
                    value={rateToPointsString(String(band.minRate))}
                    onChange={(event) =>
                      patchBand(band.id, { minRate: pointsToRateString(event.target.value) })
                    }
                    className={cn(EDITABLE_CLASSES, "mt-1 text-right font-mono text-sm tabular-nums")}
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  To %
                  <Input
                    inputMode="decimal"
                    placeholder="∞"
                    value={band.maxRate === undefined ? "" : rateToPointsString(String(band.maxRate))}
                    onChange={(event) =>
                      patchBand(band.id, {
                        maxRate:
                          event.target.value.trim() === ""
                            ? undefined
                            : pointsToRateString(event.target.value),
                      })
                    }
                    className={cn(EDITABLE_CLASSES, "mt-1 text-right font-mono text-sm tabular-nums")}
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  Advisor flag
                  <Select
                    value={band.advisorPriority ?? "none"}
                    onValueChange={(value) =>
                      patchBand(band.id, {
                        advisorPriority: value === "none" ? null : (value as AdvisorPriority),
                      })
                    }
                  >
                    <SelectTrigger size="sm" className={cn(EDITABLE_CLASSES, "mt-1 w-full text-xs")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Informational</SelectItem>
                      <SelectItem value="warning">Warning</SelectItem>
                      <SelectItem value="opportunity">Opportunity</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove band ${band.label}`}
                  onClick={() => setDraft((previous) => previous.filter((b) => b.id !== band.id))}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </Button>
              </div>
              <label className="block text-xs text-muted-foreground">
                Guidance (shown as-is to the user)
                <Textarea
                  value={band.guidance}
                  onChange={(event) => patchBand(band.id, { guidance: event.target.value })}
                  className={cn(EDITABLE_CLASSES, "mt-1 min-h-16 text-sm")}
                />
              </label>
            </div>
          ))}
        </div>

        <DialogFooter className="sm:justify-between">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setDraft((previous) => [
                  ...previous,
                  {
                    id: `band-${previous.length + 1}-${previous.reduce((m, b) => m + b.id.length, 0)}`,
                    label: "",
                    minRate: "0",
                    guidance: "",
                    advisorPriority: null,
                  },
                ])
              }
            >
              <Plus className="size-3.5" aria-hidden /> Add band
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                resetTradeSpendBands();
                onClose();
              }}
            >
              Reset to defaults
            </Button>
          </div>
          <Button size="sm" onClick={save}>
            Save bands
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
