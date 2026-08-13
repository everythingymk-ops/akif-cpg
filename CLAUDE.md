# Akif-CPG — CPG Pricing Architect

Web-based pricing, landed-cost and trade-spend planning platform for CPG brands and manufacturers. Models the full value chain (manufacturing COGS → manufacturer margin → freight/duty/tariff → landed cost → brand → distributor → retailer → shelf price → promotions/trade spend → contribution margin) in **both directions**: build price from COGS, and work backward from a target shelf price to the maximum affordable COGS.

**Source of truth: [docs/PRD.md](docs/PRD.md)** — the full 100-section PRD. Follow it when implementing any feature. Where the PRD conflicts with the locked decisions below, the decisions win. When the PRD is ambiguous, ask the user before inventing behavior.

## Communication

The user (Yahya) writes in Turkish — respond in Turkish. All code, comments, UI copy, commit messages, and docs are in English.

## Locked decisions (2026-08-11)

- **Local MVP — no Supabase, no auth, no multi-tenancy for now.** Single user; data persists locally (localStorage behind a thin repository interface, so Supabase/Postgres can replace it later without touching the engine or UI). PRD items requiring auth/org (§82, first two MVP items in §89) are deferred; everything else in the §89 MVP list stands.
- **English UI.**
- **Step-by-step delivery.** The 12-step MVP roadmap is complete (see below). For any new multi-step work, keep the same rhythm: agree the steps, finish and verify one before starting the next, don't scaffold ahead.

## Non-negotiable engineering rules (from the PRD)

1. All financial math lives in pure, unit-tested modules under `lib/pricing-engine/` (types, manufacturing, landedCost, distribution, retailer, tradeSpend, contribution, reversePricing, sensitivity, validation). **No formulas inside React components** (PRD §66, §98).
2. **Decimal.js for every money/percentage calculation** — never raw JS floats. Percentages stored as decimals: 15% → `0.15` (§61).
3. **Margin ≠ markup.** Every margin-like field carries an explicit basis: `margin` = profit/selling price → price = cost/(1−m); `markup` = profit/cost → price = cost×(1+m). Never silently conflate them (§8, §87–88).
4. Every cost line has an **owner** (manufacturer/brand/distributor/retailer/shared) and a **calculation basis** ($/unit, $/case, $/shipment, % of COGS, % of invoice, % of customs value, % of SRP, % of net sales). Tariff basis is user-selectable, never assumed (§9–10).
5. The Advisor **recommends but never changes a financial input by itself**. Suggestions require explicit Apply/Ignore/Explain action (§40).
6. Every calculated number must be explainable: tooltip + "Show Calculation" with formula, inputs, and intermediate values (§41, §67).
7. Rules of thumb / benchmarks are **editable data records**, never hardcoded strings in components. Guidance language only ("a planning range of X–Y% may be worth stress-testing"), never prescriptive (§24, §55–56).
8. Progressive disclosure: basic view shows ~8–12 assumptions; advanced sections expand (§94).
9. In vertically integrated mode, the internal transfer price must NOT inflate consolidated COGS; show manufacturer, brand, and consolidated margins separately (§3C).

## Acceptance tests (must always pass — PRD §86–88)

| Test | Input | Expected |
|---|---|---|
| Margin | COGS $8, 20% margin | sell price $10.00 |
| Markup | COGS $8, 20% markup | sell price $9.60 |
| Retailer SRP | retailer landed cost $10, 50% retailer margin | SRP $20.00 |
| Trade spend | 52 weeks; BOGO 4 wks, 50% disc, 2.0x lift, 100% funded; OI 8 wks, 15% disc, 1.25x lift, 100% funded | ≈9.48% (tolerance ±0.02 pp) |

Trade-spend math: equivalent weeks 40 + (4×2.0) + (8×1.25) = 58; spend 4×2.0×0.50 + 8×1.25×0.15 = 5.5; 5.5/58 ≈ 9.48%.

## Tech stack

Next.js (App Router) · TypeScript strict · Tailwind CSS · shadcn/ui · Recharts · React Hook Form · Zod · Decimal.js · **Vitest** for unit tests. Persistence: localStorage behind a repository interface (MVP). No backend services.

## Current state (2026-08-12)

**The MVP plus the UI-refresh/logo phase (steps 12–15) is complete and verified: 229 tests green, lint clean, production build + static export pass.** Everything in the §89 MVP list is built except the two auth/organization items, deferred by the locked decision above. Last roadmap commit: `step 15`.

Design tokens (step 12): brand accent is deep green-ink (`--primary` oklch 0.40 0.06 168); status trios `--positive/-soft/-border` etc. and the editable-blue quartet live in `app/globals.css` and are exposed as Tailwind utilities (`text-positive`, `bg-warning-soft`, `border-editable-border`, …). Shared class maps: `components/ui/status.ts`. Chart identity slots `--chart-1..5` + neutral `--chart-6`. Light theme only; the `.dark` block is an unused future seam.

**Running it**
- `npm run dev` → http://localhost:3000 (development)
- Double-click `Akif-CPG-Baslat.command` → serves the static bundle in `out/`. Rebuild it with `npm run export:static`. Opening `out/index.html` via `file://` does **not** work — Chrome blocks scripts from file:// origins. **Since step 21 the app needs internet and a sign-in**: data lives in Supabase, not the browser.
- Needs `.env.local` (copy `.env.example`) or the app renders a "not connected" screen. See `supabase/README.md`.
- `npm test` · `npm run lint` · `npm run build`

**Where things live**
- `lib/pricing-engine/` — 17 pure modules, all financial math, Decimal.js, unit-tested. Every result carries a `CalculationTrace` (formula + inputs + steps) that powers the "Show Calculation" dialogs.
- `lib/scenario/` — composition layer between engine and UI: `assumptions` (form state), `computeScenario` (runs the engine once, returns everything a screen draws), `product`, `scenarios` (+ §68 audit diff), `profiles`, `priority` (§45 resolution), `portfolio`, `exportCsv`, `coach`, `format`.
- `lib/repository/` — persistence boundary. `LocalStorageRepository` today; swapping to Supabase means changing the one instance in `lib/repository/index.ts`.
- `lib/import/` — spreadsheet template. `templateSchema.ts` is the single source of truth for both the generated workbook and the parser (a field cannot exist on one side only); `parseTemplate.ts` is pure and takes plain cell matrices; `workbook.ts` is the exceljs glue. **exceljs is imported dynamically** — it is ~900 KB and must stay out of the initial bundle.
- `components/pricing/` — main screen (top bar, summary cards, assumptions panel, four center tabs, Advisor). `components/setup/`, `components/portfolio/`, `components/profiles/`, `components/benchmarks/` — the rest. `components/ui/` — shadcn primitives (Base UI under the hood: use the `render` prop, not `asChild`).
- `docs/` — PRD, plus three Turkish PDFs and the scripts that generate them: `make-pdfs.py` (plain-language intro + user guide) and `make-example-guide.py` (landscape "Godiva Sticks örneğiyle" walkthrough built from real screenshots in `docs/guide-shots/`; every figure in it comes from the app's own calculation, so re-shoot the screenshots before changing any number in that script).

**Known deferrals / next candidates**
- Phase 2 features (PRD §90): promo ROI, advanced trade-spend engine (scanback vs off-invoice vs billback mechanics), promotion calendar view (§48), AI document upload (§91).
- Auth + Supabase migration (PRD §82) — the repository interface is the seam.
- Model Health Score (§72) is marked optional in the PRD and was not built.

## Roadmap history

| Step | Scope | Status |
|---|---|---|
| 0 | Scaffold: Next.js + TS + Tailwind + shadcn/ui + Vitest + Decimal.js; app boots, one dummy test passes; no business logic | done (2026-08-11) |
| 1 | Engine core: `types.ts`, Decimal money/percent helpers, manufacturing (margin/markup), landed cost (cost lines + selectable tariff basis), distributor, retailer math + unit tests incl. margin/markup/retailer-SRP acceptance tests | done (2026-08-11) |
| 2 | Trade spend engine: promotion model, effective annual trade spend (normalized weeks + actual-units mode), fixed event fees, additional reserve + the 9.48% acceptance test | done (2026-08-11) |
| 3 | Contribution + gross-to-net, reverse pricing (max brand invoice / max landed cost / max COGS), price gap, break-even engine + tests | done (2026-08-11) |
| 4 | Sensitivity (1-variable tables + 2-variable matrix), validation warnings (§71), Advisor rule engine (numeric insights, Critical/Warning/Opportunity) + tests | done (2026-08-11) |
| 5 | UI shell + main pricing screen: top bar, summary cards, left assumption accordions, center price waterfall, right Advisor panel; live debounced recalc; editable-vs-calculated styling; wired to an in-memory demo product | done (2026-08-11) |
| 6 | Product setup: onboarding questionnaire (business structures A–E), product creation, simple + detailed COGS, channel routes A–E with automatic field visibility | done (2026-08-11) |
| 7 | Promotion Planner UI + trade-spend coach + editable benchmark bands (§24, §77–78) | done (2026-08-11) |
| 8 | Reverse-pricing UI, sensitivity UI + scenario matrix, "Improve Economics" (§73), dollar allocation view (§43) | done (2026-08-11) |
| 9 | Scenarios: save/duplicate/compare, assumption audit trail, localStorage persistence layer behind repository interface | done (2026-08-12) |
| 10 | Portfolio screen, retailer & distributor profiles, assumption priority resolution (SKU+customer > customer > SKU > global, §45) | done (2026-08-12) |
| 11 | CSV/Excel export, seed demo "Example Supplement 60 Count" (§99), full validation pass, polish | done (2026-08-12) |
| 12 | Design foundation: font wiring fix (Geist actually applies now), green-ink brand palette + status/editable/chart tokens (WCAG + CVD validated), primitive polish (card shadow, green tab underline, dialog scrim), shared `status.ts`/`EmptyState`, waterfall-bars favicon | done (2026-08-12) |
| 13 | Screen polish: shared `AppHeader`, grouped top bar, status tokens across summary cards/advisor/portfolio/assumptions/reverse, setup-wizard shell fix + step chips, DialogFooter adoption, empty states | done (2026-08-12) |
| 14 | Charts on the token palette: styled Recharts tooltip/axes, matrix heatmap fills, semantic allocation colors + real tooltips, waterfall accent + delta chips | done (2026-08-12) |
| 15 | Product logos: `ProductSetup.logoDataUrl` (version stays 1), client-side downscale/compress (`lib/ui/logo.ts`), `ProductLogo`/`LogoPicker` with monogram fallback, `updateProduct` with quota rollback, wizard + panel + top bar + portfolio wiring, 19 new tests | done (2026-08-12) |
| 16 | Example customer profiles (5 retailers + 3 distributors, `(example)`-suffixed with representative terms) and the one-time delivery mechanism: `PersistedState.appliedSeeds` + `recordAppliedSeed`, `lib/scenario/seeds.ts` (`mergeSeedRecords`/`needsSeed`), applied on hydration in `ProfilesProvider`; 14 new tests | done (2026-08-13) |
| 17 | Second example product "Godiva Sticks (example)" — detailed COGS, 3-promotion calendar, opens 6.6 pp below target; real brand logo (`scripts/make-godiva-logo.py` → `lib/scenario/godivaLogo.ts`, 16.5K-char WebP data URL); delivered through the step-16 seed flag from `ProductProvider`; `Importer` gains `brandAndManufacturer`; 8 new tests incl. a guard that the seed still reproduces the printed guide's figures | done (2026-08-13) |
| 18 | Spreadsheet product template: `lib/import/` (`templateSchema` as the single source for writer + parser, pure `parseTemplate`, exceljs bridge `workbook.ts`), `TemplateActions` in wizard step 1, import prefills every step and lands on Review with a summary + per-cell warnings; 42 new tests incl. a build→read→parse→price round trip | done (2026-08-13) |
| 19 | Repository goes per-record: `loadWorkspace` + `upsertX`/`deleteX` replace whole-collection writes (`AkifRepository`, `LocalStorageRepository`, all three providers); `lib/scenario/diff.ts` turns the profile dialog's draft-then-save into per-record writes without inferring false deletes; portfolio thresholds debounced. First step of the Supabase phase — still localStorage | done (2026-08-13) |
| 20 | `supabase/migrations/0001_init.sql` — 9 tables keyed `(workspace_id, id)`, RLS on every one via a `security definer` `is_workspace_member()`, `updated_at` triggers; `supabase/README.md` for project setup (signups off, two accounts, workspace row); `.env.example`. Schema parses under the real Postgres grammar; Supabase-specific bits verified when the project runs it | done (2026-08-13) |
| 21 | Cloud swap: `lib/supabase/client.ts`, `SupabaseRepository` (per-record contract against Postgres, workspace resolved from membership), `AuthGate` with username→internal-email sign-in and a forced first-login password change, sign-out in `AppHeader`. The app now requires internet + sign-in; offline double-click use is gone | done (2026-08-13) |
| 22 | Two screens on one workspace: `lib/repository/workspaceSync.ts` (one shared refresh fanned out to all three providers, on focus/visibility + a 60s poll while visible, rate-limited), conditional scenario writes via `expectedUpdatedAt` + `ScenarioConflictError`, and a Reload-theirs / Save-mine-anyway alert instead of silent overwrite; 4 new tests | done (2026-08-13) |

## Working conventions

- **Verify before reporting done.** Full test suite + production build, and — when the change is visible in the app — check it in the browser rather than assuming. Several real bugs in this project were caught only that way (a stale closure silently undoing an applied plan; a first-run seed that discarded saved scenarios; relative asset paths 404ing on subroutes).
- Tests are written with or before engine code — never retrofitted after UI work.
- Do not add Phase 2 features (PRD §90) unless the user asks.
- Small, reviewable commits with a body explaining what and why; no pushing anywhere (local repo only).
- Summarize in Turkish for the user at the end of a piece of work; say plainly what was verified and what wasn't.

### Gotchas worth knowing

- **Synthetic input events don't drive React in the production build.** When testing in the browser, use real typing (`computer` type) — setting `input.value` + dispatching an `input` event works in dev but silently no-ops in the prod bundle.
- **shadcn components here are Base UI**, not Radix: `TooltipTrigger render={<Button …/>}` instead of `asChild`, `Accordion defaultValue={[...]}` without `type`, `TooltipProvider delay=` not `delayDuration=`.
- **Rates are decimal fractions everywhere** (15% → `0.15`); the UI converts to percentage points at the input boundary only (`rateToPointsString` / `pointsToRateString`).
- **Never round intermediates.** Rounding happens in `lib/scenario/format.ts` at display time; the engine keeps full precision (this is why PRD examples that round each line can differ by a cent).
- ReportLab's built-in fonts lack ğ/ş/ı/İ — the PDF script embeds Arial/Georgia. Don't drop that.
- **`PersistedState.version` must stay `1` unless a real migration is added.** `readState` returns null on unknown versions, and the first-run seed then overwrites the user's saved workspace. New fields go in as optional (like `logoDataUrl`, `appliedSeeds`).
- **Shipped example data is delivered once, not on every load.** Bundles live in `lib/scenario/seeds.ts` with a stable id; the id is written to `PersistedState.appliedSeeds` after delivery, so existing workspaces get it on the next load and deleted examples never come back. `mergeSeedRecords` also keeps a user's edited record when ids collide. Never seed straight into a provider without going through that flag.
- Product logos are data URLs capped at 64K chars (`lib/ui/logo.ts` downscales/compresses on intake) because the whole workspace is one localStorage blob — an oversized value would block every later save. `updateProduct` rolls state back and rethrows on a failed write; `LogoPicker` shows the error inline.
