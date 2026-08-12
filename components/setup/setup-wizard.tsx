"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Check, Plus, Trash2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import {
  buildDetailedCogs,
  type CogsComponent,
  type CogsComponentCategory,
} from "@/lib/pricing-engine";
import { computeScenario } from "@/lib/scenario/computeScenario";
import { formatMoney } from "@/lib/scenario/format";
import {
  BUSINESS_STRUCTURES,
  CHANNEL_ROUTES,
  assumptionsForProduct,
  suggestSetup,
  type BusinessStructure,
  type ChannelRoute,
  type CogsMode,
  type CompanyType,
  type Importer,
  type ManufacturingSource,
  type OnboardingAnswers,
  type ProductSetup,
  type RetailChannel,
  type SalesMethod,
} from "@/lib/scenario/product";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogoPicker, ProductLogo } from "@/components/ui/product-logo";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { EDITABLE_CLASSES, MoneyField } from "@/components/pricing/inputs";
import { useProducts } from "./product-provider";

/**
 * Guided product setup (roadmap step 6): onboarding questionnaire (PRD §4,
 * §76), business structure + channel route confirmation (PRD §3, §12),
 * product basics (PRD §5) and simple/detailed COGS (PRD §6–7). The wizard
 * suggests, the user decides — nothing is silently assumed.
 */

const STEPS = ["Business", "Structure & route", "Product basics", "COGS", "Review"] as const;

const COMPANY_TYPES: { value: CompanyType; label: string }[] = [
  { value: "brand", label: "Brand" },
  { value: "manufacturer", label: "Manufacturer" },
  { value: "manufacturerAndBrand", label: "Manufacturer + Brand" },
  { value: "privateLabelManufacturer", label: "Private Label Manufacturer" },
  { value: "importerDistributor", label: "Importer / Distributor" },
  { value: "consultantBroker", label: "Consultant / Broker" },
];

const MANUFACTURING_SOURCES: { value: ManufacturingSource; label: string }[] = [
  { value: "ourselves", label: "We manufacture it ourselves" },
  { value: "contractManufacturer", label: "Contract manufacturer" },
  { value: "relatedCompany", label: "Related company" },
  { value: "bySku", label: "Different manufacturer by SKU" },
];

const IMPORTERS: { value: Importer; label: string }[] = [
  { value: "manufacturer", label: "Manufacturer" },
  { value: "brand", label: "Brand" },
  { value: "distributor", label: "Distributor" },
  { value: "retailer", label: "Retailer" },
  { value: "notImported", label: "Not imported" },
  { value: "dependsOnCustomer", label: "Depends on customer" },
];

const SALES_METHODS: { value: SalesMethod; label: string }[] = [
  { value: "directToRetailer", label: "Direct to retailer" },
  { value: "throughDistributor", label: "Through distributor" },
  { value: "privateLabel", label: "Private label" },
  { value: "wholesale", label: "Wholesale" },
  { value: "amazon", label: "Amazon" },
  { value: "dtc", label: "DTC" },
  { value: "club", label: "Club" },
  { value: "foodservice", label: "Foodservice" },
];

const RETAIL_CHANNELS: { value: RetailChannel; label: string }[] = [
  { value: "grocery", label: "Grocery" },
  { value: "naturalSpecialty", label: "Natural / Specialty" },
  { value: "drug", label: "Drug" },
  { value: "mass", label: "Mass" },
  { value: "club", label: "Club" },
  { value: "convenience", label: "Convenience" },
  { value: "beauty", label: "Beauty" },
  { value: "ecommerce", label: "Ecommerce" },
  { value: "other", label: "Other" },
];

const COGS_CATEGORIES: { value: CogsComponentCategory; label: string }[] = [
  { value: "formula", label: "Formula / Product" },
  { value: "packaging", label: "Packaging" },
  { value: "manufacturing", label: "Manufacturing" },
];

const basicsSchema = z.object({
  name: z.string().trim().min(1, "Product name is required"),
  sku: z.string().trim().min(1, "SKU is required"),
  brand: z.string(),
  category: z.string(),
  subcategory: z.string(),
  unitSize: z.string(),
  countPerUnit: z.string(),
  casePack: z.string(),
  countryOfManufacture: z.string(),
  currency: z.enum(["USD", "EUR", "GBP", "TRY", "CAD"]),
  targetMarket: z.string(),
  targetRetailer: z.string(),
  currentSrpPerUnit: z.string(),
  targetSrpPerUnit: z.string(),
});
type BasicsForm = z.infer<typeof basicsSchema>;

const EMPTY_BASICS: BasicsForm = {
  name: "",
  sku: "",
  brand: "",
  category: "",
  subcategory: "",
  unitSize: "",
  countPerUnit: "",
  casePack: "",
  countryOfManufacture: "",
  currency: "USD",
  targetMarket: "",
  targetRetailer: "",
  currentSrpPerUnit: "",
  targetSrpPerUnit: "",
};

interface ComponentRow extends CogsComponent {
  localId: number;
}

function ChoiceButton({
  selected,
  onClick,
  title,
  description,
  badge,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  description?: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
        selected ? "border-editable-border bg-editable-bg" : "border-border hover:bg-accent/50",
      )}
    >
      <div className="flex items-center gap-2 font-medium">
        {selected && <Check className="size-3.5 shrink-0 text-editable" aria-hidden />}
        <span>{title}</span>
        {badge && (
          <Badge variant="outline" className="ml-auto text-[11px] text-muted-foreground">
            {badge}
          </Badge>
        )}
      </div>
      {description && <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>}
    </button>
  );
}

function QuestionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{title}</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export function SetupWizard() {
  const router = useRouter();
  const { addProduct } = useProducts();
  const [step, setStep] = useState(0);

  // Step 0 — onboarding questionnaire (PRD §4).
  const [companyType, setCompanyType] = useState<CompanyType | null>(null);
  const [manufacturingSource, setManufacturingSource] = useState<ManufacturingSource | null>(null);
  const [importer, setImporter] = useState<Importer | null>(null);
  const [salesMethods, setSalesMethods] = useState<SalesMethod[]>([]);
  const [retailChannels, setRetailChannels] = useState<RetailChannel[]>([]);
  const [answers, setAnswers] = useState<OnboardingAnswers | undefined>(undefined);

  // Step 1 — structure & route (PRD §3, §12).
  const [structure, setStructure] = useState<BusinessStructure>("contractManufacturerBrand");
  const [route, setRoute] = useState<ChannelRoute>("B");
  const [suggested, setSuggested] = useState<{ structure: BusinessStructure; route: ChannelRoute } | null>(null);

  // Step 3 — COGS (PRD §6–7).
  const [cogsMode, setCogsMode] = useState<CogsMode>("simple");
  // Logo lives outside the RHF/zod form like the other non-text step state:
  // the value is produced asynchronously from a file, not typed.
  const [logoDataUrl, setLogoDataUrl] = useState<string | undefined>(undefined);
  const [simpleCogsPerUnit, setSimpleCogsPerUnit] = useState("");
  const [components, setComponents] = useState<ComponentRow[]>([
    { localId: 1, name: "", category: "formula", amountPerUnit: "" },
  ]);
  // Derive the next row id inside the functional update — two rapid clicks
  // must never mint the same React key.
  const addComponentRow = () =>
    setComponents((previous) => [
      ...previous,
      {
        localId: previous.reduce((max, row) => Math.max(max, row.localId), 0) + 1,
        name: "",
        category: "formula",
        amountPerUnit: "",
      },
    ]);

  const form = useForm<BasicsForm>({
    resolver: zodResolver(basicsSchema),
    defaultValues: EMPTY_BASICS,
  });

  const questionnaireComplete =
    companyType !== null && manufacturingSource !== null && importer !== null && salesMethods.length > 0;

  const applyQuestionnaire = () => {
    if (!companyType || !manufacturingSource || !importer) return;
    const collected: OnboardingAnswers = {
      companyType,
      manufacturingSource,
      importer,
      salesMethods,
      retailChannels,
    };
    const suggestion = suggestSetup(collected);
    setAnswers(collected);
    setSuggested(suggestion);
    setStructure(suggestion.structure);
    setRoute(suggestion.route);
    setStep(1);
  };

  const skipGuidedSetup = () => {
    setAnswers(undefined);
    setSuggested(null);
    setStep(2);
  };

  const detailedCogs = useMemo(() => {
    try {
      const plainComponents = components.map((row) => ({
        name: row.name,
        category: row.category,
        amountPerUnit: row.amountPerUnit,
      }));
      return { result: buildDetailedCogs(plainComponents), error: null };
    } catch (error) {
      return { result: null, error: error instanceof Error ? error.message : String(error) };
    }
  }, [components]);

  const buildCandidate = (id: string): ProductSetup => {
    const values = form.getValues();
    return {
      id,
      basics: {
        name: values.name,
        sku: values.sku,
        brand: values.brand,
        category: values.category,
        subcategory: values.subcategory,
        unitSize: values.unitSize,
        countPerUnit: values.countPerUnit,
        casePack: values.casePack,
        countryOfManufacture: values.countryOfManufacture,
        currency: values.currency,
        targetMarket: values.targetMarket,
        targetRetailer: values.targetRetailer,
      },
      structure,
      route,
      cogsMode,
      simpleCogsPerUnit,
      cogsComponents: components
        .filter((row) => row.name.trim() !== "" || String(row.amountPerUnit).trim() !== "")
        .map((row) => ({
          name: row.name,
          category: row.category,
          amountPerUnit: row.amountPerUnit,
        })),
      onboarding: answers,
      assumptionOverrides: {
        currentSrpPerUnit: values.currentSrpPerUnit,
        targetSrpPerUnit: values.targetSrpPerUnit,
      },
      logoDataUrl,
    };
  };

  // Review-step model check: the product must produce a computable scenario.
  const reviewCheck = useMemo(() => {
    if (step !== 4) return null;
    try {
      const candidate = buildCandidate("candidate");
      return computeScenario(assumptionsForProduct(candidate));
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-check on wizard state
  }, [step, structure, route, cogsMode, simpleCogsPerUnit, components]);

  const createProduct = () => {
    const product = buildCandidate(crypto.randomUUID());
    addProduct(product);
    router.push("/");
  };

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 lg:p-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Add product</h1>
          <p className="text-sm text-muted-foreground">
            Guided setup — the tool suggests, you decide.
          </p>
        </div>
        <Link href="/" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-xs")}>
          <ArrowLeft className="size-3.5" aria-hidden /> Back to pricing
        </Link>
      </header>

      <ol className="flex flex-wrap gap-1.5" aria-label="Setup steps">
        {STEPS.map((label, index) => (
          <li
            key={label}
            aria-current={index === step ? "step" : undefined}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs",
              index === step
                ? "border-primary/40 bg-primary/10 font-semibold text-primary"
                : index < step
                  ? "border-transparent bg-muted text-muted-foreground"
                  : "border-border text-muted-foreground",
            )}
          >
            {index < step && <Check className="size-3 text-positive" aria-hidden />}
            {index + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Card className="gap-4 py-5">
          <CardHeader className="px-5">
            <CardTitle className="text-base">How does your business work?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 px-5">
            <QuestionBlock title="1 — What best describes your company?">
              {COMPANY_TYPES.map((option) => (
                <ChoiceButton
                  key={option.value}
                  selected={companyType === option.value}
                  onClick={() => setCompanyType(option.value)}
                  title={option.label}
                />
              ))}
            </QuestionBlock>
            <QuestionBlock title="2 — Who manufactures the product?">
              {MANUFACTURING_SOURCES.map((option) => (
                <ChoiceButton
                  key={option.value}
                  selected={manufacturingSource === option.value}
                  onClick={() => setManufacturingSource(option.value)}
                  title={option.label}
                />
              ))}
            </QuestionBlock>
            <QuestionBlock title="3 — Who imports the product?">
              {IMPORTERS.map((option) => (
                <ChoiceButton
                  key={option.value}
                  selected={importer === option.value}
                  onClick={() => setImporter(option.value)}
                  title={option.label}
                />
              ))}
            </QuestionBlock>
            <QuestionBlock title="4 — How do you normally sell? (select all that apply)">
              {SALES_METHODS.map((option) => (
                <ChoiceButton
                  key={option.value}
                  selected={salesMethods.includes(option.value)}
                  onClick={() =>
                    setSalesMethods((previous) =>
                      previous.includes(option.value)
                        ? previous.filter((v) => v !== option.value)
                        : [...previous, option.value],
                    )
                  }
                  title={option.label}
                />
              ))}
            </QuestionBlock>
            <QuestionBlock title="5 — Primary retail channels (select all that apply)">
              {RETAIL_CHANNELS.map((option) => (
                <ChoiceButton
                  key={option.value}
                  selected={retailChannels.includes(option.value)}
                  onClick={() =>
                    setRetailChannels((previous) =>
                      previous.includes(option.value)
                        ? previous.filter((v) => v !== option.value)
                        : [...previous, option.value],
                    )
                  }
                  title={option.label}
                />
              ))}
            </QuestionBlock>
            <div className="flex items-center justify-between gap-3 border-t pt-4">
              <Button variant="ghost" size="sm" onClick={skipGuidedSetup}>
                Skip guided setup
              </Button>
              <Button size="sm" disabled={!questionnaireComplete} onClick={applyQuestionnaire}>
                Continue <ArrowRight className="size-3.5" aria-hidden />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card className="gap-4 py-5">
          <CardHeader className="px-5">
            <CardTitle className="text-base">Business structure & route to market</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 px-5">
            <QuestionBlock title="Business structure (PRD A–E)">
              {(Object.keys(BUSINESS_STRUCTURES) as BusinessStructure[]).map((key) => (
                <ChoiceButton
                  key={key}
                  selected={structure === key}
                  onClick={() => setStructure(key)}
                  title={`${BUSINESS_STRUCTURES[key].code} — ${BUSINESS_STRUCTURES[key].label}`}
                  description={BUSINESS_STRUCTURES[key].description}
                  badge={suggested?.structure === key ? "suggested" : undefined}
                />
              ))}
            </QuestionBlock>
            <QuestionBlock title="Route to market — the pricing waterfall follows this">
              {(Object.keys(CHANNEL_ROUTES) as ChannelRoute[]).map((key) => (
                <ChoiceButton
                  key={key}
                  selected={route === key}
                  onClick={() => setRoute(key)}
                  title={`Route ${key}: ${CHANNEL_ROUTES[key].label}`}
                  description={
                    CHANNEL_ROUTES[key].privateLabel
                      ? "Private label: trade spend and broker default to 0% (editable)."
                      : CHANNEL_ROUTES[key].usesDistributor
                        ? "Distributor economics included."
                        : "Distributor fields disappear automatically."
                  }
                  badge={suggested?.route === key ? "suggested" : undefined}
                />
              ))}
            </QuestionBlock>
            <WizardNav onBack={() => setStep(0)} onNext={() => setStep(2)} />
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card className="gap-4 py-5">
          <CardHeader className="px-5">
            <CardTitle className="text-base">Product basics</CardTitle>
          </CardHeader>
          <CardContent className="px-5">
            <form
              className="space-y-4"
              onSubmit={form.handleSubmit(() => setStep(3))}
              noValidate
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <TextField form={form} name="name" label="Product name *" />
                <TextField form={form} name="sku" label="SKU *" />
                <TextField form={form} name="brand" label="Brand" />
                <TextField form={form} name="category" label="Category" />
                <TextField form={form} name="subcategory" label="Subcategory" />
                <TextField form={form} name="unitSize" label="Unit size" />
                <TextField form={form} name="countPerUnit" label="Count / weight / volume" />
                <TextField form={form} name="casePack" label="Case pack" />
                <TextField form={form} name="countryOfManufacture" label="Country of manufacture" />
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Currency</Label>
                  <Controller
                    control={form.control}
                    name="currency"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger size="sm" className={cn(EDITABLE_CLASSES, "w-full text-sm")}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(["USD", "EUR", "GBP", "TRY", "CAD"] as const).map((currency) => (
                            <SelectItem key={currency} value={currency}>
                              {currency}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <TextField form={form} name="targetMarket" label="Target market" />
                <TextField form={form} name="targetRetailer" label="Target retailer (optional)" />
                <TextField form={form} name="currentSrpPerUnit" label="Current SRP (optional)" />
                <TextField form={form} name="targetSrpPerUnit" label="Target SRP (optional)" />
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">Logo (optional)</Label>
                  <LogoPicker
                    name={form.getValues("name")}
                    logoDataUrl={logoDataUrl}
                    onChange={setLogoDataUrl}
                  />
                  <p className="text-xs text-muted-foreground">
                    Shown next to the product name across the app. Stored locally in your browser.
                  </p>
                </div>
              </div>
              <WizardNav onBack={() => setStep(answers ? 1 : 0)} nextIsSubmit />
            </form>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card className="gap-4 py-5">
          <CardHeader className="px-5">
            <CardTitle className="text-base">Manufacturing COGS</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 px-5">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <ChoiceButton
                selected={cogsMode === "simple"}
                onClick={() => setCogsMode("simple")}
                title="Simple — I know the finished COGS"
                description="Enter the completed cost per unit your manufacturer quotes."
              />
              <ChoiceButton
                selected={cogsMode === "detailed"}
                onClick={() => setCogsMode("detailed")}
                title="Detailed — build it from components"
                description="Formula, packaging and manufacturing components summed per unit."
              />
            </div>

            {cogsMode === "simple" ? (
              <div className="max-w-56">
                <MoneyField
                  label="Finished product COGS / unit"
                  value={simpleCogsPerUnit}
                  onChange={setSimpleCogsPerUnit}
                />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-2">
                  {components.map((row) => (
                    <div
                      key={row.localId}
                      className="grid grid-cols-[1fr_150px_110px_32px] items-center gap-2"
                    >
                      <Input
                        aria-label="Component name"
                        placeholder="e.g. Active ingredients"
                        value={row.name}
                        onChange={(event) =>
                          setComponents((previous) =>
                            previous.map((c) =>
                              c.localId === row.localId ? { ...c, name: event.target.value } : c,
                            ),
                          )
                        }
                        className={cn(EDITABLE_CLASSES, "text-sm")}
                      />
                      <Select
                        value={row.category}
                        onValueChange={(category) =>
                          setComponents((previous) =>
                            previous.map((c) =>
                              c.localId === row.localId
                                ? { ...c, category: category as CogsComponentCategory }
                                : c,
                            ),
                          )
                        }
                      >
                        <SelectTrigger size="sm" className={cn(EDITABLE_CLASSES, "text-xs")}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {COGS_CATEGORIES.map((category) => (
                            <SelectItem key={category.value} value={category.value}>
                              {category.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        aria-label="Amount per unit"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={String(row.amountPerUnit)}
                        onChange={(event) =>
                          setComponents((previous) =>
                            previous.map((c) =>
                              c.localId === row.localId
                                ? { ...c, amountPerUnit: event.target.value }
                                : c,
                            ),
                          )
                        }
                        className={cn(EDITABLE_CLASSES, "text-right font-mono text-sm tabular-nums")}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${row.name || "component"}`}
                        onClick={() =>
                          setComponents((previous) => previous.filter((c) => c.localId !== row.localId))
                        }
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" onClick={addComponentRow}>
                  <Plus className="size-3.5" aria-hidden /> Add component
                </Button>

                {detailedCogs.result ? (
                  <dl className="grid max-w-sm grid-cols-[1fr_auto] gap-x-6 gap-y-1 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
                    <dt className="text-muted-foreground">Material cost</dt>
                    <dd className="text-right font-mono tabular-nums">
                      {formatMoney(detailedCogs.result.materialCostPerUnit)}
                    </dd>
                    <dt className="text-muted-foreground">Packaging cost</dt>
                    <dd className="text-right font-mono tabular-nums">
                      {formatMoney(detailedCogs.result.packagingCostPerUnit)}
                    </dd>
                    <dt className="text-muted-foreground">Manufacturing cost</dt>
                    <dd className="text-right font-mono tabular-nums">
                      {formatMoney(detailedCogs.result.manufacturingCostPerUnit)}
                    </dd>
                    <dt className="font-semibold">Total manufacturing COGS</dt>
                    <dd className="text-right font-mono font-semibold tabular-nums">
                      {formatMoney(detailedCogs.result.totalCogsPerUnit)}
                    </dd>
                  </dl>
                ) : (
                  <p className="text-xs text-warning">
                    {detailedCogs.error ?? "Component amounts are incomplete."}
                  </p>
                )}
              </div>
            )}
            <WizardNav onBack={() => setStep(2)} onNext={() => setStep(4)} />
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card className="gap-4 py-5">
          <CardHeader className="px-5">
            <CardTitle className="text-base">Review & create</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 px-5">
            <dl className="grid grid-cols-[160px_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Product</dt>
              <dd className="flex items-center gap-2">
                <ProductLogo
                  name={form.getValues("name")}
                  logoDataUrl={logoDataUrl}
                  size="sm"
                />
                {form.getValues("name") || "—"} · {form.getValues("sku") || "—"}
              </dd>
              <dt className="text-muted-foreground">Structure</dt>
              <dd>
                {BUSINESS_STRUCTURES[structure].code} — {BUSINESS_STRUCTURES[structure].label}
              </dd>
              <dt className="text-muted-foreground">Route</dt>
              <dd>Route {route}: {CHANNEL_ROUTES[route].label}</dd>
              <dt className="text-muted-foreground">COGS</dt>
              <dd className="font-mono tabular-nums">
                {cogsMode === "simple"
                  ? `$${simpleCogsPerUnit || "—"} (simple)`
                  : detailedCogs.result
                    ? `${formatMoney(detailedCogs.result.totalCogsPerUnit)} (detailed, ${components.length} components)`
                    : "— (detailed)"}
              </dd>
            </dl>

            {reviewCheck &&
              (reviewCheck.ok ? (
                <Alert>
                  <Check aria-hidden />
                  <AlertTitle>Model check passed</AlertTitle>
                  <AlertDescription>
                    With default commercial assumptions this product prices to a required SRP of{" "}
                    {formatMoney(reviewCheck.scenario.requiredSrpPerUnit)}. You can tune every
                    assumption on the pricing screen.
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert variant="destructive">
                  <AlertTitle>The product cannot be priced yet</AlertTitle>
                  <AlertDescription>{reviewCheck.error}</AlertDescription>
                </Alert>
              ))}

            <div className="flex items-center justify-between gap-3 border-t pt-4">
              <Button variant="ghost" size="sm" onClick={() => setStep(3)}>
                <ArrowLeft className="size-3.5" aria-hidden /> Back
              </Button>
              <Button size="sm" disabled={!reviewCheck?.ok} onClick={createProduct}>
                Create product <ArrowRight className="size-3.5" aria-hidden />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  );
}

function WizardNav({
  onBack,
  onNext,
  nextIsSubmit,
}: {
  onBack: () => void;
  onNext?: () => void;
  nextIsSubmit?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t pt-4">
      <Button type="button" variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="size-3.5" aria-hidden /> Back
      </Button>
      <Button type={nextIsSubmit ? "submit" : "button"} size="sm" onClick={nextIsSubmit ? undefined : onNext}>
        Continue <ArrowRight className="size-3.5" aria-hidden />
      </Button>
    </div>
  );
}

function TextField({
  form,
  name,
  label,
}: {
  form: ReturnType<typeof useForm<BasicsForm>>;
  name: keyof BasicsForm;
  label: string;
}) {
  const error = form.formState.errors[name]?.message;
  return (
    <div className="space-y-1">
      <Label htmlFor={`basics-${name}`} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={`basics-${name}`}
        {...form.register(name)}
        aria-invalid={error ? true : undefined}
        className={cn(EDITABLE_CLASSES, "text-sm")}
      />
      {error && <p className="text-xs text-negative">{error}</p>}
    </div>
  );
}
