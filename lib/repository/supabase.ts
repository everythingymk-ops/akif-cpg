import type { TradeSpendBand } from "@/lib/pricing-engine";
import type { ProductSetup } from "@/lib/scenario/product";
import type { DistributorProfile, RetailerProfile } from "@/lib/scenario/profiles";
import type { Scenario } from "@/lib/scenario/scenarios";
import { supabase } from "@/lib/supabase/client";
import {
  DEFAULT_PORTFOLIO_SETTINGS,
  type AkifRepository,
  type PortfolioSettings,
  type UiState,
  type WorkspaceSnapshot,
} from "./types";

/**
 * Supabase implementation of the same per-record contract the localStorage one
 * satisfies — the swap the repository interface was built for.
 *
 * Every method is scoped to the caller's workspace, which is resolved from
 * their membership rather than configured: row-level security already decides
 * what they can see, so asking the database is both simpler and impossible to
 * misconfigure. Reads and writes that touch another workspace return nothing
 * and fail respectively, by policy rather than by client-side care.
 */

// ── Row shapes (snake_case as stored) ──────────────────────────────────────

interface ProductRow {
  id: string;
  basics: ProductSetup["basics"];
  structure: ProductSetup["structure"];
  route: ProductSetup["route"];
  cogs_mode: ProductSetup["cogsMode"];
  simple_cogs_per_unit: string;
  cogs_components: ProductSetup["cogsComponents"];
  onboarding: ProductSetup["onboarding"] | null;
  assumption_overrides: ProductSetup["assumptionOverrides"] | null;
  logo_data_url: string | null;
}

interface ScenarioRow {
  id: string;
  product_id: string;
  name: string;
  assumptions: Scenario["assumptions"];
  history: Scenario["history"];
  created_at: string;
  updated_at: string;
}

interface RetailerRow {
  id: string;
  name: string;
  channel: string;
  default_distributor_profile_id: string;
  retailer_margin_basis: RetailerProfile["retailerMarginBasis"];
  retailer_margin_rate: string;
  broker_rate: string;
  deductions_rate: string;
  trade_spend_rate: string;
  payment_terms: string;
  notes: string;
}

interface DistributorRow {
  id: string;
  name: string;
  margin_basis: DistributorProfile["marginBasis"];
  margin_rate: string;
  handling_fee_per_unit: string;
  notes: string;
}

interface BandRow {
  id: string;
  position: number;
  label: string;
  min_rate: string;
  max_rate: string | null;
  guidance: string;
  advisor_priority: TradeSpendBand["advisorPriority"];
}

interface SettingsRow {
  portfolio_settings: PortfolioSettings;
  applied_seeds: string[];
}

interface UiRow {
  active_product_id: string | null;
  active_scenario_by_product: Record<string, string>;
}

// ── Mapping ────────────────────────────────────────────────────────────────
// `undefined` and `null` are not interchangeable here: the app uses absent to
// mean "not set" (an open-ended band, a product with no logo), and Postgres
// spells that null.

const toProduct = (row: ProductRow): ProductSetup => ({
  id: row.id,
  basics: row.basics,
  structure: row.structure,
  route: row.route,
  cogsMode: row.cogs_mode,
  simpleCogsPerUnit: row.simple_cogs_per_unit,
  cogsComponents: row.cogs_components,
  ...(row.onboarding ? { onboarding: row.onboarding } : {}),
  ...(row.assumption_overrides ? { assumptionOverrides: row.assumption_overrides } : {}),
  ...(row.logo_data_url ? { logoDataUrl: row.logo_data_url } : {}),
});

const fromProduct = (product: ProductSetup, workspaceId: string) => ({
  workspace_id: workspaceId,
  id: product.id,
  basics: product.basics,
  structure: product.structure,
  route: product.route,
  cogs_mode: product.cogsMode,
  simple_cogs_per_unit: product.simpleCogsPerUnit,
  cogs_components: product.cogsComponents,
  onboarding: product.onboarding ?? null,
  assumption_overrides: product.assumptionOverrides ?? null,
  logo_data_url: product.logoDataUrl ?? null,
});

const toScenario = (row: ScenarioRow): Scenario => ({
  id: row.id,
  productId: row.product_id,
  name: row.name,
  assumptions: row.assumptions,
  history: row.history,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const fromScenario = (scenario: Scenario, workspaceId: string) => ({
  workspace_id: workspaceId,
  id: scenario.id,
  product_id: scenario.productId,
  name: scenario.name,
  assumptions: scenario.assumptions,
  history: scenario.history,
  created_at: scenario.createdAt,
  updated_at: scenario.updatedAt,
});

const toRetailer = (row: RetailerRow): RetailerProfile => ({
  id: row.id,
  name: row.name,
  channel: row.channel,
  defaultDistributorProfileId: row.default_distributor_profile_id,
  retailerMarginBasis: row.retailer_margin_basis,
  retailerMarginRate: row.retailer_margin_rate,
  brokerRate: row.broker_rate,
  deductionsRate: row.deductions_rate,
  tradeSpendRate: row.trade_spend_rate,
  paymentTerms: row.payment_terms,
  notes: row.notes,
});

const fromRetailer = (profile: RetailerProfile, workspaceId: string) => ({
  workspace_id: workspaceId,
  id: profile.id,
  name: profile.name,
  channel: profile.channel,
  default_distributor_profile_id: profile.defaultDistributorProfileId,
  retailer_margin_basis: profile.retailerMarginBasis,
  retailer_margin_rate: profile.retailerMarginRate,
  broker_rate: profile.brokerRate,
  deductions_rate: profile.deductionsRate,
  trade_spend_rate: profile.tradeSpendRate,
  payment_terms: profile.paymentTerms,
  notes: profile.notes,
});

const toDistributor = (row: DistributorRow): DistributorProfile => ({
  id: row.id,
  name: row.name,
  marginBasis: row.margin_basis,
  marginRate: row.margin_rate,
  handlingFeePerUnit: row.handling_fee_per_unit,
  notes: row.notes,
});

const fromDistributor = (profile: DistributorProfile, workspaceId: string) => ({
  workspace_id: workspaceId,
  id: profile.id,
  name: profile.name,
  margin_basis: profile.marginBasis,
  margin_rate: profile.marginRate,
  handling_fee_per_unit: profile.handlingFeePerUnit,
  notes: profile.notes,
});

const toBand = (row: BandRow): TradeSpendBand => ({
  id: row.id,
  label: row.label,
  minRate: row.min_rate,
  // Absent, not null: an open-ended top band has no upper bound (PRD §24).
  ...(row.max_rate === null ? {} : { maxRate: row.max_rate }),
  guidance: row.guidance,
  advisorPriority: row.advisor_priority,
});

const fromBand = (band: TradeSpendBand, workspaceId: string, position: number) => ({
  workspace_id: workspaceId,
  id: band.id,
  position,
  label: band.label,
  min_rate: String(band.minRate),
  max_rate: band.maxRate === undefined ? null : String(band.maxRate),
  guidance: band.guidance,
  advisor_priority: band.advisorPriority,
});

// ── Repository ─────────────────────────────────────────────────────────────

export class SupabaseRepository implements AkifRepository {
  private workspaceId: string | null = null;

  /** The caller's workspace, asked once per session and cached. */
  private async workspace(): Promise<string> {
    if (this.workspaceId !== null) return this.workspaceId;
    const { data, error } = await supabase()
      .from("workspace_members")
      .select("workspace_id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      throw new Error(
        "This account is not a member of any workspace. Add it in Supabase " +
          "(see supabase/README.md, step 5).",
      );
    }
    this.workspaceId = (data as { workspace_id: string }).workspace_id;
    return this.workspaceId;
  }

  /** Forget the cached workspace — called on sign-out so the next user resolves their own. */
  reset(): void {
    this.workspaceId = null;
  }

  async loadWorkspace(): Promise<WorkspaceSnapshot | null> {
    const client = supabase();
    const {
      data: { session },
    } = await client.auth.getSession();
    if (!session) return null;

    const workspaceId = await this.workspace();
    const scoped = <T>(table: string, columns: string, order: string) =>
      client
        .from(table)
        .select(columns)
        .eq("workspace_id", workspaceId)
        .order(order, { ascending: true })
        .then((result) => {
          if (result.error) throw result.error;
          return (result.data ?? []) as T[];
        });

    const [products, scenarios, retailers, distributors, bands, settings, ui] = await Promise.all([
      scoped<ProductRow>("products", "*", "created_at"),
      scoped<ScenarioRow>("scenarios", "*", "created_at"),
      scoped<RetailerRow>("retailer_profiles", "*", "created_at"),
      scoped<DistributorRow>("distributor_profiles", "*", "created_at"),
      scoped<BandRow>("trade_spend_bands", "*", "position"),
      client
        .from("workspace_settings")
        .select("portfolio_settings, applied_seeds")
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
      client
        .from("user_ui_state")
        .select("active_product_id, active_scenario_by_product")
        .eq("workspace_id", workspaceId)
        .eq("user_id", session.user.id)
        .maybeSingle(),
    ]);

    if (settings.error) throw settings.error;
    if (ui.error) throw ui.error;
    const settingsRow = settings.data as SettingsRow | null;
    const uiRow = ui.data as UiRow | null;

    return {
      products: products.map(toProduct),
      scenarios: scenarios.map(toScenario),
      tradeSpendBands: bands.map(toBand),
      retailerProfiles: retailers.map(toRetailer),
      distributorProfiles: distributors.map(toDistributor),
      portfolioSettings: settingsRow?.portfolio_settings ?? { ...DEFAULT_PORTFOLIO_SETTINGS },
      appliedSeeds: settingsRow?.applied_seeds ?? [],
      ui: {
        ...(uiRow?.active_product_id ? { activeProductId: uiRow.active_product_id } : {}),
        activeScenarioIdByProduct: uiRow?.active_scenario_by_product ?? {},
      },
    };
  }

  /** Every workspace table is keyed (workspace_id, id); name the target so
   *  PostgREST never has to guess at a composite primary key. */
  private async upsert(
    table: string,
    row: Record<string, unknown>,
    onConflict = "workspace_id,id",
  ): Promise<void> {
    const { error } = await supabase().from(table).upsert(row, { onConflict });
    if (error) throw error;
  }

  private async remove(table: string, id: string): Promise<void> {
    const workspaceId = await this.workspace();
    const { error } = await supabase()
      .from(table)
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("id", id);
    if (error) throw error;
  }

  async upsertProduct(product: ProductSetup): Promise<void> {
    await this.upsert("products", fromProduct(product, await this.workspace()));
  }

  async deleteProduct(id: string): Promise<void> {
    await this.remove("products", id);
  }

  async upsertScenario(scenario: Scenario): Promise<void> {
    await this.upsert("scenarios", fromScenario(scenario, await this.workspace()));
  }

  async deleteScenario(id: string): Promise<void> {
    await this.remove("scenarios", id);
  }

  async upsertRetailerProfile(profile: RetailerProfile): Promise<void> {
    await this.upsert("retailer_profiles", fromRetailer(profile, await this.workspace()));
  }

  async deleteRetailerProfile(id: string): Promise<void> {
    await this.remove("retailer_profiles", id);
  }

  async upsertDistributorProfile(profile: DistributorProfile): Promise<void> {
    await this.upsert("distributor_profiles", fromDistributor(profile, await this.workspace()));
  }

  async deleteDistributorProfile(id: string): Promise<void> {
    await this.remove("distributor_profiles", id);
  }

  async replaceTradeSpendBands(bands: readonly TradeSpendBand[]): Promise<void> {
    const workspaceId = await this.workspace();
    const client = supabase();
    // Clear then insert. The bands are one small ladder edited as a whole in a
    // single dialog, and `position` has to match the new order, so replacing
    // the set is both the honest operation and the simplest one.
    const { error: clearError } = await client
      .from("trade_spend_bands")
      .delete()
      .eq("workspace_id", workspaceId);
    if (clearError) throw clearError;
    if (bands.length === 0) return;

    const { error } = await client
      .from("trade_spend_bands")
      .insert(bands.map((band, index) => fromBand(band, workspaceId, index)));
    if (error) throw error;
  }

  async savePortfolioSettings(settings: PortfolioSettings): Promise<void> {
    await this.upsert(
      "workspace_settings",
      { workspace_id: await this.workspace(), portfolio_settings: settings },
      "workspace_id",
    );
  }

  async recordAppliedSeed(seedId: string): Promise<void> {
    const workspaceId = await this.workspace();
    const client = supabase();
    // Read-modify-write the union. Two providers seed on the same load, and a
    // blind overwrite would drop the other's flag — which would re-deliver a
    // bundle the user had deleted.
    const { data, error } = await client
      .from("workspace_settings")
      .select("applied_seeds")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (error) throw error;
    const applied = (data as { applied_seeds: string[] } | null)?.applied_seeds ?? [];
    if (applied.includes(seedId)) return;
    const { error: writeError } = await client
      .from("workspace_settings")
      .upsert(
        { workspace_id: workspaceId, applied_seeds: [...applied, seedId] },
        { onConflict: "workspace_id" },
      );
    if (writeError) throw writeError;
  }

  async saveUiState(ui: UiState): Promise<void> {
    const client = supabase();
    const {
      data: { session },
    } = await client.auth.getSession();
    if (!session) return;
    const { error } = await client.from("user_ui_state").upsert(
      {
        user_id: session.user.id,
        workspace_id: await this.workspace(),
        active_product_id: ui.activeProductId ?? null,
        active_scenario_by_product: ui.activeScenarioIdByProduct ?? {},
      },
      { onConflict: "user_id,workspace_id" },
    );
    if (error) throw error;
  }
}
