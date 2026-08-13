"use client";

import { useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { MarginBasis } from "@/lib/pricing-engine";
import type { DistributorProfile, RetailerProfile } from "@/lib/scenario/profiles";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { EDITABLE_CLASSES } from "@/components/pricing/inputs";
import { useProfiles } from "./profiles-provider";

/**
 * Manage reusable retailer & distributor profiles (PRD §46–47). Economics
 * captured once here get applied to any SKU from the top bar. Mount only
 * while open; Save persists both lists through the repository.
 */
export function ProfileManagerDialog({ onClose }: { onClose: () => void }) {
  const {
    retailerProfiles,
    distributorProfiles,
    saveRetailerProfiles,
    saveDistributorProfiles,
  } = useProfiles();
  const [retailers, setRetailers] = useState<RetailerProfile[]>(() =>
    retailerProfiles.map((profile) => ({ ...profile })),
  );
  const [distributors, setDistributors] = useState<DistributorProfile[]>(() =>
    distributorProfiles.map((profile) => ({ ...profile })),
  );
  // The lists as they were when this dialog opened. Save compares against
  // these, so removing a row here deletes exactly that row — and a profile a
  // colleague added while the dialog was open is never mistaken for one the
  // user deleted.
  const snapshot = useRef({ retailers: retailerProfiles, distributors: distributorProfiles });

  const patchRetailer = (id: string, patch: Partial<RetailerProfile>) =>
    setRetailers((previous) => previous.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const patchDistributor = (id: string, patch: Partial<DistributorProfile>) =>
    setDistributors((previous) => previous.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const save = () => {
    saveRetailerProfiles(
      retailers.filter((p) => p.name.trim() !== ""),
      snapshot.current.retailers,
    );
    saveDistributorProfiles(
      distributors.filter((p) => p.name.trim() !== ""),
      snapshot.current.distributors,
    );
    onClose();
  };

  const fieldClasses = cn(EDITABLE_CLASSES, "h-8 text-sm");
  const rateClasses = cn(fieldClasses, "text-right font-mono tabular-nums");

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Customer profiles</DialogTitle>
          <DialogDescription>
            Capture retailer and distributor economics once; apply them to any SKU from the top
            bar. Rates are percentage points.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="retailers">
          <TabsList>
            <TabsTrigger value="retailers">Retailers ({retailers.length})</TabsTrigger>
            <TabsTrigger value="distributors">Distributors ({distributors.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="retailers" className="space-y-3">
            {retailers.map((profile) => (
              <div key={profile.id} className="space-y-2 rounded-lg border px-3 py-2.5">
                <div className="grid grid-cols-[1fr_150px_170px_32px] items-end gap-2">
                  <LabeledInput label="Retailer">
                    <Input
                      value={profile.name}
                      onChange={(e) => patchRetailer(profile.id, { name: e.target.value })}
                      className={fieldClasses}
                      placeholder="e.g. Albertsons"
                    />
                  </LabeledInput>
                  <LabeledInput label="Channel">
                    <Input
                      value={profile.channel}
                      onChange={(e) => patchRetailer(profile.id, { channel: e.target.value })}
                      className={fieldClasses}
                      placeholder="Grocery"
                    />
                  </LabeledInput>
                  <LabeledInput label="Default distributor (§47)">
                    <Select
                      value={profile.defaultDistributorProfileId || "direct"}
                      onValueChange={(value) =>
                        value &&
                        patchRetailer(profile.id, {
                          defaultDistributorProfileId: value === "direct" ? "" : value,
                        })
                      }
                    >
                      <SelectTrigger size="sm" className={cn(EDITABLE_CLASSES, "w-full text-xs")}>
                        <SelectValue>
                          {profile.defaultDistributorProfileId
                            ? distributors.find((d) => d.id === profile.defaultDistributorProfileId)
                                ?.name ?? "Unknown"
                            : "Direct (no distributor)"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="direct">Direct (no distributor)</SelectItem>
                        {distributors.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.name || "(unnamed)"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </LabeledInput>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${profile.name || "retailer"}`}
                    onClick={() => setRetailers((prev) => prev.filter((p) => p.id !== profile.id))}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <LabeledInput label="Margin basis">
                    <Select
                      value={profile.retailerMarginBasis}
                      onValueChange={(value) =>
                        value &&
                        patchRetailer(profile.id, { retailerMarginBasis: value as MarginBasis })
                      }
                    >
                      <SelectTrigger size="sm" className={cn(EDITABLE_CLASSES, "w-full text-xs")}>
                        <SelectValue>{profile.retailerMarginBasis}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="margin">margin</SelectItem>
                        <SelectItem value="markup">markup</SelectItem>
                      </SelectContent>
                    </Select>
                  </LabeledInput>
                  <RateInput
                    label="Retailer %"
                    value={profile.retailerMarginRate}
                    onChange={(v) => patchRetailer(profile.id, { retailerMarginRate: v })}
                    className={rateClasses}
                  />
                  <RateInput
                    label="Broker %"
                    value={profile.brokerRate}
                    onChange={(v) => patchRetailer(profile.id, { brokerRate: v })}
                    className={rateClasses}
                    optional
                  />
                  <RateInput
                    label="Deductions %"
                    value={profile.deductionsRate}
                    onChange={(v) => patchRetailer(profile.id, { deductionsRate: v })}
                    className={rateClasses}
                    optional
                  />
                  <RateInput
                    label="Trade spend %"
                    value={profile.tradeSpendRate}
                    onChange={(v) => patchRetailer(profile.id, { tradeSpendRate: v })}
                    className={rateClasses}
                    optional
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <LabeledInput label="Payment terms">
                    <Input
                      value={profile.paymentTerms}
                      onChange={(e) => patchRetailer(profile.id, { paymentTerms: e.target.value })}
                      className={fieldClasses}
                      placeholder="Net 30"
                    />
                  </LabeledInput>
                  <LabeledInput label="Notes">
                    <Input
                      value={profile.notes}
                      onChange={(e) => patchRetailer(profile.id, { notes: e.target.value })}
                      className={fieldClasses}
                    />
                  </LabeledInput>
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setRetailers((prev) => [
                  ...prev,
                  {
                    id: crypto.randomUUID(),
                    name: "",
                    channel: "",
                    defaultDistributorProfileId: "",
                    retailerMarginBasis: "margin",
                    retailerMarginRate: "0.48",
                    brokerRate: "",
                    deductionsRate: "",
                    tradeSpendRate: "",
                    paymentTerms: "",
                    notes: "",
                  },
                ])
              }
            >
              <Plus className="size-3.5" aria-hidden /> Add retailer profile
            </Button>
          </TabsContent>

          <TabsContent value="distributors" className="space-y-3">
            {distributors.map((profile) => (
              <div
                key={profile.id}
                className="grid grid-cols-[1fr_120px_100px_110px_32px] items-end gap-2 rounded-lg border px-3 py-2.5"
              >
                <LabeledInput label="Distributor">
                  <Input
                    value={profile.name}
                    onChange={(e) => patchDistributor(profile.id, { name: e.target.value })}
                    className={fieldClasses}
                    placeholder="e.g. UNFI"
                  />
                </LabeledInput>
                <LabeledInput label="Margin basis">
                  <Select
                    value={profile.marginBasis}
                    onValueChange={(value) =>
                      value && patchDistributor(profile.id, { marginBasis: value as MarginBasis })
                    }
                  >
                    <SelectTrigger size="sm" className={cn(EDITABLE_CLASSES, "w-full text-xs")}>
                      <SelectValue>{profile.marginBasis}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="margin">margin</SelectItem>
                      <SelectItem value="markup">markup</SelectItem>
                    </SelectContent>
                  </Select>
                </LabeledInput>
                <RateInput
                  label="Margin %"
                  value={profile.marginRate}
                  onChange={(v) => patchDistributor(profile.id, { marginRate: v })}
                  className={rateClasses}
                />
                <LabeledInput label="Handling $/unit">
                  <Input
                    inputMode="decimal"
                    value={profile.handlingFeePerUnit}
                    onChange={(e) =>
                      patchDistributor(profile.id, { handlingFeePerUnit: e.target.value })
                    }
                    className={rateClasses}
                  />
                </LabeledInput>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${profile.name || "distributor"}`}
                  onClick={() => setDistributors((prev) => prev.filter((p) => p.id !== profile.id))}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setDistributors((prev) => [
                  ...prev,
                  {
                    id: crypto.randomUUID(),
                    name: "",
                    marginBasis: "margin",
                    marginRate: "0.15",
                    handlingFeePerUnit: "0.50",
                    notes: "",
                  },
                ])
              }
            >
              <Plus className="size-3.5" aria-hidden /> Add distributor profile
            </Button>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={save}>
            Save profiles
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LabeledInput({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-[11px] text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

function RateInput({
  label,
  value,
  onChange,
  className,
  optional,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className: string;
  optional?: boolean;
}) {
  return (
    <LabeledInput label={label}>
      <Input
        inputMode="decimal"
        placeholder={optional ? "—" : undefined}
        value={value.trim() === "" ? "" : rateToPointsString(value)}
        onChange={(e) =>
          onChange(e.target.value.trim() === "" ? "" : pointsToRateString(e.target.value))
        }
        className={className}
      />
    </LabeledInput>
  );
}
