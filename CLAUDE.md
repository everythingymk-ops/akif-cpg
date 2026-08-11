# Akif-CPG — CPG Pricing Architect

Web-based pricing, landed-cost and trade-spend planning platform for CPG brands and manufacturers. Models the full value chain (manufacturing COGS → manufacturer margin → freight/duty/tariff → landed cost → brand → distributor → retailer → shelf price → promotions/trade spend → contribution margin) in **both directions**: build price from COGS, and work backward from a target shelf price to the maximum affordable COGS.

**Source of truth: [docs/PRD.md](docs/PRD.md)** — the full 100-section PRD. Follow it when implementing any feature. Where the PRD conflicts with the locked decisions below, the decisions win. When the PRD is ambiguous, ask the user before inventing behavior.

## Communication

The user (Yahya) writes in Turkish — respond in Turkish. All code, comments, UI copy, commit messages, and docs are in English.

## Locked decisions (2026-08-11)

- **Local MVP — no Supabase, no auth, no multi-tenancy for now.** Single user; data persists locally (localStorage behind a thin repository interface, so Supabase/Postgres can replace it later without touching the engine or UI). PRD items requiring auth/org (§82, first two MVP items in §89) are deferred; everything else in the §89 MVP list stands.
- **English UI.**
- **Step-by-step delivery.** Follow the roadmap below strictly in order. Finish and verify one step (build passes, all tests green, user has seen the summary) before starting the next. Do not scaffold ahead, do not batch multiple steps into one run unless the user explicitly asks.

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

## Roadmap & status

Update the Status column when a step is completed and verified. One step per run.

| Step | Scope | Status |
|---|---|---|
| 0 | Scaffold: Next.js + TS + Tailwind + shadcn/ui + Vitest + Decimal.js; app boots, one dummy test passes; no business logic | done (2026-08-11) |
| 1 | Engine core: `types.ts`, Decimal money/percent helpers, manufacturing (margin/markup), landed cost (cost lines + selectable tariff basis), distributor, retailer math + unit tests incl. margin/markup/retailer-SRP acceptance tests | done (2026-08-11) |
| 2 | Trade spend engine: promotion model, effective annual trade spend (normalized weeks + actual-units mode), fixed event fees, additional reserve + the 9.48% acceptance test | not started |
| 3 | Contribution + gross-to-net, reverse pricing (max brand invoice / max landed cost / max COGS), price gap, break-even engine + tests | not started |
| 4 | Sensitivity (1-variable tables + 2-variable matrix), validation warnings (§71), Advisor rule engine (numeric insights, Critical/Warning/Opportunity) + tests | not started |
| 5 | UI shell + main pricing screen: top bar, summary cards, left assumption accordions, center price waterfall, right Advisor panel; live debounced recalc; editable-vs-calculated styling; wired to an in-memory demo product | not started |
| 6 | Product setup: onboarding questionnaire (business structures A–E), product creation, simple + detailed COGS, channel routes A–E with automatic field visibility | not started |
| 7 | Promotion Planner UI + trade-spend coach + editable benchmark bands (§24, §77–78) | not started |
| 8 | Reverse-pricing UI, sensitivity UI + scenario matrix, "Improve Economics" (§73), dollar allocation view (§43) | not started |
| 9 | Scenarios: save/duplicate/compare, assumption audit trail, localStorage persistence layer behind repository interface | not started |
| 10 | Portfolio screen, retailer & distributor profiles, assumption priority resolution (SKU+customer > customer > SKU > global, §45) | not started |
| 11 | CSV/Excel export, seed demo "Example Supplement 60 Count" (§99), full validation pass, polish | not started |

## Working conventions

- **One step per session/run.** At the end of a step: run the full test suite and a production build, update the roadmap table above, commit (`step N: <what>`), summarize in Turkish for the user, and stop.
- Tests are written with or before the engine code — never retrofitted after UI work.
- Do not add Phase 2 features (PRD §90) unless the user asks.
- Small, reviewable commits; no pushing anywhere (local repo only).
