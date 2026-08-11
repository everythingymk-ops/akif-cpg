# PRD: CPG Pricing, Landed Cost & Trade Spend Planning Platform

> Source of truth for this project. Provided by the product owner on 2026-08-11. Do not edit without the owner's approval; implementation decisions that deviate from this document are recorded in CLAUDE.md.

**Working product name:** CPG Pricing Architect
**Alternative names:** Shelf Economics, MarginMap, CPG PriceLab, ShelfPrice, TradeSpend Planner

## 1. Product Vision

Build a web-based pricing and commercial planning application for CPG brands, manufacturers, private-label manufacturers, importers, and vertically integrated companies.

The application should help a user answer a deceptively simple question:

> "If my product costs X to make, what does it need to sell for at retail, and can everyone in the value chain make the margin they need?"

The application must model the complete path of a product:

Manufacturing COGS → Manufacturer Margin → Ex-Factory / Transfer Price → Freight / Duty / Tariff / Customs → Landed Cost → Brand Economics → Distributor Economics → Retailer Economics → Shelf Price → Promotions / Trade Spend → Net Brand Revenue → Contribution Margin

The tool must also work in reverse:

Target Shelf Price → Retailer Margin → Distributor Economics → Brand Net Revenue → Trade Spend → Maximum Affordable Landed Cost → Maximum Manufacturing COGS

The product should not simply act as a calculator. It should behave like a knowledgeable CPG commercial finance assistant that identifies unrealistic assumptions, explains terminology, provides editable rules of thumb, highlights margin problems, and tells the user what variables they may need to change.

## 2. Primary Product Goal

Allow a brand or manufacturer to input a product's COGS and commercial assumptions and immediately understand:

- What shelf price the product requires.
- What price the brand should sell to a distributor.
- What price the distributor would sell to the retailer.
- What retailer margin is created.
- What distributor margin is created.
- How much trade spend should be budgeted.
- How promotions affect annual trade spend.
- How trade spend affects contribution margin.
- What contribution margin remains for the brand.
- What profit remains for the manufacturer.
- What happens if assumptions change.
- What maximum COGS the business can afford for a target shelf price.
- Whether the economics appear commercially realistic.
- Which variable is creating the biggest margin problem.

## 3. Critical Product Principle

The tool must understand that different companies own different parts of the value chain. Do not assume the brand always owns manufacturing, logistics, importation, warehousing, or distribution. At onboarding, determine which commercial structure applies.

### Business Structure Options

**A. Brand using a contract manufacturer**

- Manufacturer produces product and sells finished goods to the brand.
- Manufacturer has: manufacturing COGS, manufacturer margin, manufacturing-related costs.
- Brand has: manufacturer purchase price, freight, duty, warehousing, distributor, trade spend, broker, deductions, retailer economics.

**B. Manufacturer selling to an independent brand**

- Manufacturer primarily cares about: manufacturing COGS, manufacturing margin, quotation price, logistics responsibility, possible delivered price.
- The manufacturer may optionally model the customer's downstream retail economics to determine whether its quotation is commercially viable.

**C. Vertically integrated manufacturer + brand**

Example structure: manufacturer entity produces product; brand entity purchases product internally or through a transfer price.

The tool must calculate:

- *Manufacturer Economics:* Manufacturing COGS → Transfer Price → Manufacturer Gross Profit → Manufacturer Gross Margin
- *Brand Economics:* Transfer Price + Import/Landed Costs → Brand Landed Cost → Brand Invoice → Brand Net Revenue → Brand Contribution
- *Consolidated Economics:* True Manufacturing COGS + External Supply Chain Costs → Retail Economics → Consolidated Group Contribution

The internal transfer price must NOT artificially increase consolidated COGS. Show Manufacturer Margin, Brand Margin, and Consolidated Company Margin separately.

**D. Private Label Manufacturer**

- Manufacturer produces a retailer-owned/private-label item.
- The manufacturer may not incur: traditional branded trade spend, retailer promotional funding, consumer marketing, broker commission, distributor margin.
- The model should allow these items to be disabled.

**E. Brand Selling Direct to Retailer**

- No distributor is involved.
- Flow becomes: COGS → Landed Cost → Brand Sell Price to Retailer → Retailer Margin → SRP.
- Distributor fields disappear automatically.

## 4. Onboarding

Before creating the first product, ask the user a short commercial setup questionnaire.

**Question 1 — What best describes your company?**
Options: Brand · Manufacturer · Manufacturer + Brand · Private Label Manufacturer · Importer / Distributor · Consultant / Broker

**Question 2 — Who manufactures the product?**
Options: We manufacture it ourselves · Contract manufacturer · Related company · Different manufacturer by SKU

**Question 3 — Who imports the product?**
Options: Manufacturer · Brand · Distributor · Retailer · Not imported · Depends on customer

**Question 4 — How do you normally sell?** (multi-select)
Direct to retailer · Through distributor · Private label · Wholesale · Amazon · DTC · Club · Foodservice

**Question 5 — Primary retail channels:**
Grocery · Natural / Specialty · Drug · Mass · Club · Convenience · Beauty · Ecommerce · Other

## 5. Product Creation

User clicks: **+ Add Product**

Required fields (Product Basics): Product Name, SKU, Brand, Category, Subcategory, Unit Size, Count / Weight / Volume, Case Pack, Country of Manufacture, Currency, Target Market, Target Retailer (optional), Current SRP (optional), Target SRP (optional).

## 6. COGS Input

The tool should offer two input modes.

**SIMPLE COGS MODE** — User enters: Finished Product COGS / Unit. Example: `$3.65`. This is appropriate when the manufacturer already provides a completed COGS.

## 7. Detailed COGS Mode

Allow the user to build COGS from components.

- **Formula / Product:** Raw Materials, Active Ingredients, Inactive Ingredients, Flavoring, Coating, Fill Material, Other
- **Packaging:** Bottle, Cap, Label, Carton, Blister, Sachet, Desiccant, Display, Case, Pallet allocation, Other Packaging
- **Manufacturing:** Direct Labor, Manufacturing Overhead, Machine Time, Quality Control, Testing, Waste Allowance, Yield Loss, Batch Setup, Other Conversion Costs

Display: Material Cost, Packaging Cost, Manufacturing Cost, **Total Manufacturing COGS**.

## 8. Manufacturer Margin

If an independent manufacturer exists, provide:

- Manufacturing COGS: `$3.65`
- Target Manufacturer Margin: editable. Example: `20%`

**IMPORTANT:** The user must select whether this number represents:

- **Margin** (Margin = Profit / Selling Price) → Manufacturer Price = `COGS / (1 - Margin)`
- **Markup** (Markup = Profit / Cost) → Manufacturer Price = `COGS × (1 + Markup)`

The application must NEVER silently treat markup and margin as the same thing.

Display a tooltip: *"A 20% markup and a 20% margin produce different selling prices."*

Every margin field in the application must identify its basis.

## 9. Cost Ownership System

Every cost should contain:

- Cost Name
- Amount
- Calculation Type — options: `$ per unit`, `$ per case`, `$ per shipment`, `$ annually`, `% of COGS`, `% of invoice price`, `% of customs value`, `% of SRP`, `% of net sales`
- Paid By — options: Manufacturer, Brand, Distributor, Retailer, Shared

This cost ownership architecture is extremely important. It allows the same pricing engine to work for very different companies.

## 10. Landed Cost Module

Allow users to build landed cost. Possible cost lines:

International Freight, Ocean Freight, Air Freight, Domestic Freight, Insurance, Tariff, Import Duty, Customs Fee, Customs Broker, MPF, HMF, Port Charges, Drayage, Inspection, FDA-related cost allocation, Warehouse Receiving, 3PL Inbound, Pallet Cost, Labeling, Repacking, Other.

Each cost should be configurable. Example:

- Manufacturing Purchase Price: $4.56
- International Freight: $0.35
- Tariff: 15%
- Customs Broker Allocation: $0.05
- Domestic Freight: $0.25
- Warehouse Receiving: $0.06
- **Result — Brand Landed Cost: $5.96**

Do not assume tariffs are calculated on COGS. Allow the user to select the basis.

## 11. Incoterm Field

Optional field: EXW, FCA, FOB, CFR, CIF, DAP, DDP, Other.

Incoterm should primarily be used as contextual information. Do not automatically make legal or customs assumptions solely from Incoterm. Instead ask:

- "Who is responsible for freight?"
- "Who is responsible for import duty?"
- "Who is responsible for customs clearance?"

This prevents incorrect costing.

## 12. Channel Setup

After landed cost, user selects route to market:

- **Route A:** Brand → Retailer
- **Route B:** Brand → Distributor → Retailer
- **Route C:** Manufacturer → Brand → Distributor → Retailer
- **Route D:** Manufacturer → Retailer Private Label
- **Route E:** Manufacturer → Distributor → Retailer

The pricing waterfall changes automatically.

## 13. Distributor Economics

Fields: Distributor Name, Distributor Margin %, Margin / Markup selection, Distributor Handling Fee, Distributor Warehouse Fee, Distributor Freight Fee, Distributor Fuel Surcharge, Distributor Case Fee, Distributor New Item Fee, Distributor Damage / Returns Reserve, Other Distributor Fees.

Allow fields to be: `%`, `$/unit`, `$/case`, `$/shipment`.

Display: Brand invoice to distributor, Distributor net acquisition cost, Distributor margin dollars, Distributor sell price to retailer, Distributor fees, Retailer landed acquisition cost.

## 14. Retailer Economics

Inputs: Retailer Name, Target Retailer Margin, Retailer Fees, Warehouse / DC Fee, Retailer Landed Fee, New Store Fee, Slotting Fee, Free Fills, New Item Setup, BDF, Early Payment Discount, Returns / Damages, Chargebacks Reserve, Other Allowances.

Each fee should support: `% of invoice`, `$/unit`, `$/case`, annual fixed cost, one-time cost.

Fixed costs should be amortized based on expected annual volume.

## 15. Retailer Margin Calculation

If retailer landed cost is known: `SRP = Retailer Landed Cost / (1 - Retailer Margin)`

Example: Retailer Landed Cost = $10, Retailer Margin = 50% → Required SRP = **$20**.

Show both Retailer Gross Profit Dollars and Retailer Gross Margin %. Again, distinguish margin from markup.

## 16. Trade Spend Module

This should be one of the most important features in the application.

Do NOT ask the user simply: "Trade Spend = 20%". Instead offer two modes:

- **Mode A:** Manual Trade Spend %
- **Mode B:** Build Trade Spend From Promotional Calendar

Mode B should be strongly encouraged.

## 17. Promotion Planner

Allow unlimited promotion rows. Fields:

Promotion Name, Promotion Type, Number of Events, Total Promotional Weeks, Discount %, Funding %, Expected Sales Lift, Fixed Event Fee, Additional Cost, Start Date (optional), End Date (optional), Notes.

## 18. Promotion Types

Include: BOGO, BOGO 50%, Buy 2 Get 1, Temporary Price Reduction, Off Invoice, Scanback, Feature Ad, Display, Feature + Display, Introductory Allowance, Case Allowance, Free Fill, New Store Opening, Loyalty Promotion, Digital Coupon, Retailer Coupon, Markdown Support, Other.

Do NOT assume all promotion types calculate the same way.

## 19. Promotion Funding

For each event, ask: **Who funds the promotion?** — Brand Funding %, Retailer Funding %, Distributor Funding %.

Example: BOGO retail discount = 50%, Brand funding = 100%. OR: Brand funding = 50%, Retailer funding = 50%.

This dramatically changes the brand's trade-spend burden.

## 20. Promotional Sales Lift

Allow: 1.0x, 1.25x, 1.5x, 1.75x, 2.0x, 2.5x, 3.0x — and custom input.

Tooltip: *"Sales lift represents promotional unit sales relative to a normal week. A 2.0x lift means the promotional week sells approximately twice normal weekly volume."*

Never automatically assume lift. Offer suggestions but require the user to accept or change them.

## 21. Effective Annual Trade Spend Calculation

If the user does not provide units, calculate using normalized weekly volume. Assume Normal Week Volume = 1.0.

For each promotion:

- Promo Equivalent Units = `Promo Weeks × Sales Lift`
- Promotion Spend Equivalent = `Promo Weeks × Sales Lift × Discount % × Brand Funding %`

Annual Equivalent Units = `Normal Weeks + Promotional Equivalent Units`

Then: **Effective Trade Spend % = Total Promotion Spend Equivalent ÷ Annual Equivalent Units**

If there are fixed event costs, use actual unit forecast instead.

## 22. Required Promotion Test Case

The application must pass this test.

- **BOGO:** 2 events, 4 total weeks, 50% effective discount, 2.0x sales lift, 100% brand funded
- **OI:** 8 weeks, 15% discount, 1.25x sales lift, 100% brand funded
- Remaining normal weeks: 40

Equivalent volume: 40 normal + 8 BOGO equivalent units + 10 OI equivalent units = **58 equivalent weeks**

Promotional spend equivalents: BOGO = 4 × 2.0 × 50% = 4; OI = 8 × 1.25 × 15% = 1.5; Total = **5.5**

Effective Trade Spend = 5.5 / 58 = **approximately 9.48%**

The software should return approximately 9.5%. This serves as an acceptance test.

## 23. Additional Trade Spend Reserve

Below promotional trade spend, allow: **Additional Trade Reserve %**.

Examples: Unplanned TPR, Retailer markdowns, Extra promotion, Promotional leakage, Deductions, Annual customer allowance.

This allows: Calculated Promotion Spend 9.5% + Additional Reserve 2% = **Total Planned Trade Spend 11.5%**.

## 24. Trade Spend Rule-of-Thumb Engine

The system should proactively help users understand whether the entered trade spend appears aggressive or conservative.

**IMPORTANT:** These are planning heuristics, not facts or guarantees. They must be editable in an Admin / Benchmark Settings database.

Initial suggested planning bands:

- **Low Promotional Support (≈5–10%):** "Your trade-spend budget is relatively conservative. This may be sufficient for businesses with limited promotional commitments, strong everyday pricing, private-label relationships, or retailer-funded promotions."
- **Moderate Support (≈10–15%):** "This represents a moderate promotional budget. Review your planned TPRs, OIs, digital promotions, introductory programs, and retailer allowances to confirm they fit within this reserve."
- **Active Retail Support (≈15–20%):** "Your trade-spend budget represents meaningful retail support. Verify that your expected promotional lift and incremental sales justify the margin investment."
- **Highly Promotional (20%+):** "Trade spend is consuming a significant portion of gross sales. Review promotional ROI, retailer requirements, and whether base pricing is sufficient to support this level of investment."

Industry publications use different definitions of trade spend, and estimates commonly fall in broad ranges near 10–25% depending on methodology, company and maturity. Therefore the software must present these values as guidance rather than universal standards.

## 25. Launch Strategy Advisor

Ask:

- **Product Stage:** New Launch, Growth, Established, Mature
- **Retail Expansion:** First Retailer, Regional Expansion, National Expansion, Existing Distribution

Then show contextual advice. Example (New Brand + First Major Retailer):

> "You are modeling a new retail launch. Consider budgeting additional trade support beyond the known promotion calendar for introductory allowances, TPRs, retailer programs and unforeseen deductions."

If calculated trade spend is 6%:

> "Your current modeled trade spend is 6%. That may be aggressive from a profitability perspective in the positive direction, but conservative from a retail-support perspective. Before using 6% in the final pricing model, confirm whether all retailer promotional commitments are included."

The advisor should never automatically change the input. Give buttons: **Keep My Assumption**, **Add 2% Buffer**, **Add 5% Buffer**, **Review Promotions**.

## 26. Brand Commercial Expenses

Allow additional brand variables: Broker Commission %, Sales Commission %, Returns / Deductions %, Spoilage %, Damage %, EDI Fees, Distributor Deductions, Retailer Deductions, Marketing Reserve, Sampling, Demo, Merchandising, Freight Allowance, Early Payment Discount, Bad Debt Reserve, Other Variable Costs.

These should feed contribution margin if enabled.

## 27. Gross-to-Net Waterfall

Show visually:

Gross Brand Invoice Revenue − Trade Spend − Promotional Allowances − Returns − Deductions − Broker Commission (if appropriate) = **Net Brand Revenue**

Then: Net Brand Revenue − Landed Product Cost − Variable Distribution / Commercial Costs = **Contribution Dollars**

Display: **Contribution Margin %**.

## 28. Contribution Margin Definition

Do not leave "contribution margin" undefined. Default formula:

`Contribution Margin % = Contribution Profit ÷ Net Sales`

Where:

- `Net Sales = Gross Invoice Revenue − Trade Spend − Revenue Deductions`
- `Contribution Profit = Net Sales − Landed Product Cost − Broker − Variable Selling / Distribution Expenses`

Allow advanced users to change accounting treatment (e.g. some companies classify broker commission below contribution). Create: **Contribution Definition Settings**.

## 29. Primary Pricing Mode — BUILD PRICE FROM COGS

The user enters: COGS, Manufacturer Margin, Logistics, Tariff, Distributor Margin, Trade Spend, Broker, Deductions, Target Brand Contribution, Retailer Margin.

The system calculates: Manufacturer Sell Price, Brand Landed Cost, Required Brand Invoice Price, Distributor Sell Price, Retailer Acquisition Cost, Required SRP.

## 30. Reverse Pricing Mode — WORK BACKWARD FROM SHELF

User enters: Target SRP = $19.99, Retailer Margin = 48%, Distributor Margin = 15%, Trade Spend = 12%, Broker = 5%, Target Contribution = 10%.

The system calculates: Retailer Cost, Distributor Buy Price, Maximum Brand Invoice, Maximum Landed COGS, Maximum Manufacturing COGS.

Display: *"To sell at $19.99 while maintaining the selected commercial assumptions, your maximum landed cost is approximately $X."*

This should be one of the product's central features.

## 31. Price Gap Analysis

If actual COGS exceeds allowable COGS, show:

**Pricing Gap** — Actual Landed COGS: $6.15 · Maximum Supported Landed COGS: $5.40 · Gap: **+$0.75**

Then explain: *"Your current cost structure is $0.75/unit above the level supported by your target $19.99 shelf price."*

Provide possible paths: Reduce COGS, Increase SRP, Reduce trade spend, Negotiate retailer margin, Reduce distributor costs, Sell direct, Reduce broker commission, Reduce deductions, Change package configuration.

## 32. Target Contribution Pricing

Input: Target U.S. Contribution: 8%.

System calculates: Required Brand Invoice, Required Retailer Cost, Required SRP.

Also show:

- **If You Keep Current SRP:** Current SRP $19.99 → Actual Contribution 3.1%
- **To Reach Target:** Required SRP $21.49 OR Required COGS reduction $0.62/unit

This creates actionable output.

## 33. Trade Spend Sensitivity

Automatically calculate: 5%, 10%, 15%, 20%, 25%, 30%.

For each scenario show: Required Brand Invoice, Required SRP, Contribution at Current SRP, Contribution Dollars. Use a table and chart. Example:

| Trade Spend | Required SRP | CM at $19.99 |
|---|---|---|
| 5% | $18.49 | 14.2% |
| 10% | $19.49 | 10.6% |
| 15% | $20.49 | 6.5% |
| 20% | $21.99 | 1.8% |
| 25% | $23.49 | -3.7% |

Values should come from the actual model.

## 34. Retailer Margin Sensitivity

Test: 40%, 42%, 45%, 48%, 50%, 52%, 55%. Show resulting required SRP and contribution.

## 35. Distributor Sensitivity

Test: 10%, 12%, 15%, 18%, 20%, 25%. Allow custom ranges.

## 36. Multivariable Scenario Matrix

Allow user to choose two variables. Example — Rows: Trade Spend; Columns: Retailer Margin. Every cell displays Required SRP OR Contribution %.

This allows rapid commercial negotiation analysis.

## 37. Scenario Builder

User should be able to save: Base, Conservative, Target, Aggressive Launch, Direct Retail, Distributor, Retailer Request, Broker Proposal, Scenario A / B / C.

Then compare side by side. Fields to compare: COGS, Landed Cost, Trade Spend, Distributor Margin, Retailer Margin, Brand Invoice, SRP, Brand Gross Margin, Brand Contribution Margin, Manufacturer Margin, Consolidated Margin.

## 38. Proactive CPG Advisor

Create an insight engine on the right side of the screen. Call it: **Commercial Advisor**.

It continuously evaluates the model. Do not use generic AI chat messages. Use specific numerical observations. Examples:

- "Trade spend increased from 10% to 18%. At the current $19.99 SRP, your contribution margin falls from 11.4% to 4.2%."
- "Your retailer margin is 52%. Reducing it to 48% would lower the required shelf price by approximately $1.62."
- "Your distributor and retailer margins together are creating more pricing pressure than trade spend."
- "At the current shelf price you cannot achieve your 10% target contribution. You need either a $1.40 SRP increase or approximately $0.63 lower landed cost."

## 39. Advisor Priority System

Rank insights:

- **Critical:** Negative contribution · Impossible target economics · COGS greater than available revenue · Retail price below break-even
- **Warning:** Very low contribution · Large promotional burden · High fixed fees relative to volume · Target SRP substantially different from calculated SRP
- **Opportunity:** Direct distribution improves margin · Lower retailer margin meaningfully improves economics · COGS reduction has high leverage · Trade-spend optimization significantly improves contribution

## 40. Never Let AI Silently Change Financial Inputs

The AI may recommend: "Try 15% instead." But must require explicit user action.

Buttons: **Apply Suggestion**, **Ignore**, **Explain**.

No financial assumption should change automatically.

## 41. Explain Every Number

Every calculated field should have a tooltip. Example — Required SRP: *"Calculated from retailer acquisition cost and retailer target margin."*

Click: **Show Calculation** → then display: Retailer Cost = $10.25, Retailer Margin = 48%, Formula: `$10.25 / (1 - 0.48)`, Required SRP: $19.71.

This transparency is extremely important.

## 42. Price Waterfall Visualization

Main visualization should show: Manufacturing COGS, Manufacturer Profit, Manufacturer Sell Price, Freight, Duty, Other Landed Costs, Brand Landed Cost, Brand Margin, Trade Spend, Distributor Margin, Distributor Fees, Retailer Cost, Retailer Margin, SRP.

Allow user to hover over every stage.

## 43. Dollar Allocation View

For a $20 consumer purchase, answer: **Where does the $20 go?**

Example visualization: Consumer Pays $20.00 → Retailer $9.60 · Distributor $1.45 · Trade Spend $1.25 · Broker $0.40 · Logistics $0.80 · Manufacturing $3.65 · Manufacturer Profit $0.90 · Brand Contribution $1.95.

All numbers must come from the active scenario. This is a powerful educational view.

## 44. Product Portfolio

Create Portfolio page. Columns: SKU, Product, COGS, Landed Cost, Brand Invoice, Distributor, Retailer, SRP, Trade Spend %, Brand Gross Margin %, Contribution %, Manufacturer Margin %, Status.

Status: Green = commercially healthy · Yellow = review economics · Red = negative / below required threshold.

Thresholds should be configurable.

## 45. Product Selection

On pricing page: dropdown **Select Product**. Changing product loads all product-specific assumptions.

Allow assumptions to be:

- **Global** (e.g. broker commission 5%)
- **Customer Specific** (e.g. distributor margin for Albertsons)
- **SKU Specific** (e.g. Black Seed Oil COGS)

Priority: **SKU + Customer** over **Customer** over **SKU** over **Global Default**.

## 46. Retailer Profiles

Create reusable customer profiles. Example fields: Retailer, Channel, Distributor, Target Retailer Margin, Distributor Margin, Distributor Fee, Broker, Typical Deductions, Payment Terms, BDF, New Item Fees, Trade Spend Plan, Notes.

Then users do not need to re-enter economics for every SKU.

## 47. Distributor Profiles

Create: Distributor Name, Margin, Markup / Margin basis, Handling Fee, Warehouse Fee, Freight, Case Fee, Other deductions, Default retailer relationships.

Users can change distributor by retailer. Example: Retailer A → UNFI, Retailer B → KeHE, Retailer C → Direct.

## 48. Promotion Calendar

Future enhancement but architect database for it now.

Calendar view displaying Week 1–52: BOGO, OI, TPR, Feature, Display, Coupon.

Show: promotional weeks, expected volume, promotional spend, annual spend. Warn if promotions overlap.

## 49. Promo ROI (Phase 2)

If user enters: normal weekly sales, promo weekly sales, promo cost, gross profit/unit — calculate: incremental units, incremental revenue, incremental contribution, promo spend, promo ROI.

Ask: *"Did the promotion create profitable incremental sales?"*

## 50. Volume Forecast

Optional: Stores, Units per Store per Week, Weeks → calculate Annual Units.

Example: 1,000 stores × 0.5 units/store/week × 52 weeks = **26,000 units**.

Promotion volume changes automatically according to expected lift.

## 51. Fixed Cost Amortization

For costs such as $25,000 slotting, $60,000 new item rack, $10,000 onboarding fee — allow annual forecast volume.

Example: Annual units 100,000; Slotting $25,000 → Effective unit cost **$0.25**.

Show: **Fixed Retail Cost / Unit**. Do not hide fixed costs from contribution economics.

## 52. Private Label Mode

When selected: default trade spend 0% (editable), default broker 0% (editable), consumer marketing off, distributor optional, retailer margin can still be modeled.

Show: Manufacturer quote, Retailer acquisition cost, Retailer margin, Shelf price, Manufacturer contribution.

Private label comparison should focus heavily on: target retailer shelf price, current incumbent cost, required cost reduction, manufacturer quote, manufacturer margin.

## 53. Branded Mode

Enable: Trade Spend, Broker, Launch Fees, Retailer Promotions, Distributor, Marketing, Returns, Deductions, Contribution.

## 54. Competitive Shelf Target

User enters: Comparable Product SRP ($19.99) and Desired Price Position: Same Price, 5% Lower, 10% Lower, 15% Lower, Premium +10%, Custom.

Calculate target SRP, then reverse engineer maximum COGS.

This should answer: *"How much can I afford to manufacture this product for if I need to land 10% below the existing shelf price?"*

## 55. Rule of Thumb System Architecture

Do not hardcode business advice in UI components. Create benchmark records.

Fields: Benchmark Name, Category, Channel, Company Stage, Metric, Low, Typical, High, Source, Source Date, Admin Notes, Confidence.

Examples: Trade Spend, Retailer Margin, Distributor Margin, Broker Commission, Deductions, Contribution Target.

These benchmarks can later be updated without rebuilding application logic.

## 56. Guidance Language

Never say: "You must use 20% trade spend."

Say: *"A planning range of X–Y% may be worth stress-testing for this scenario. Your actual requirements depend on retailer commitments and promotional strategy."*

Always distinguish **Your Input** from **Tool Suggestion**. Use separate colors/styles.

## 57. UI Design

The application must feel closer to a modern SaaS financial tool than a spreadsheet.

Design principles: Clean, Minimal, Professional, Financial, Fast, No unnecessary animations, Desktop-first, Responsive.

## 58. Main Pricing Screen

Layout:

- **TOP BAR:** Product Selector, Retailer Selector, Distributor Selector, Scenario Selector, Save, Duplicate, Export
- **SUMMARY CARDS:** Target SRP, Calculated SRP, Brand Invoice, Landed COGS, Trade Spend, Retailer Margin, Contribution Margin
- **LEFT PANEL:** Editable assumptions — accordion sections: Product, Manufacturing, Landed Cost, Commercial, Distributor, Retailer, Promotions, Contribution Target
- **CENTER PANEL:** Pricing Waterfall
- **RIGHT PANEL:** Commercial Advisor

## 59. Input Styling

Clearly distinguish: Blue = editable · Gray = calculated · Green = healthy · Yellow = warning · Red = problem.

Never make users guess which cells or fields are editable.

## 60. Live Calculations

Every input change should update calculations immediately. No Calculate button should be required. Use debounced updates if necessary.

## 61. Decimal Precision

Use precise decimal arithmetic. Do not rely on standard JavaScript floating-point calculations for financial calculations. Use Decimal.js or equivalent.

Store percentages as decimal values. Example: 15% stored as `0.15`.

## 62. Currency Support

Support: USD, EUR, GBP, TRY, CAD, Custom.

Allow product-level exchange rate. Show: Source Currency, Model Currency, Exchange Rate, Date.

Do not automatically fetch exchange rates in MVP. User manually enters rate. Design architecture for automated FX later.

## 63. Data Model

Suggested main tables/entities: User, Organization, Brand, Manufacturer, Product, SKU, Retailer, Distributor, RetailerProfile, DistributorProfile, CostComponent, ManufacturingScenario, SupplyChainScenario, PricingScenario, Promotion, TradeSpendPlan, Benchmark, CalculationSnapshot, Assumption, AdvisorInsight.

## 64. Cost Component Data Structure

Each CostComponent should include: id, sku_id, name, category, amount, currency, calculation_type, calculation_basis, owner, frequency, annual_units, per_unit_equivalent, included_in_landed_cost, included_in_contribution, notes.

## 65. Promotion Data Structure

Promotion: id, scenario_id, name, type, events, weeks, discount_rate, brand_funding_rate, retailer_funding_rate, distributor_funding_rate, sales_lift, fixed_fee, estimated_units, spend, effective_trade_rate, start_date, end_date, notes.

## 66. Calculation Engine

Do not scatter formulas throughout React components. Create a dedicated calculation engine.

Suggested structure — `/lib/pricing-engine/`: manufacturing.ts, landedCost.ts, distribution.ts, retailer.ts, tradeSpend.ts, contribution.ts, reversePricing.ts, sensitivity.ts, validation.ts, types.ts.

Every function should be independently testable.

## 67. Formula Audit Panel

Add **View Formula** for every major output. Example — Required Shelf Price: Formula, Inputs, Intermediate Values, Output.

This allows users to audit the calculation.

## 68. Assumption Audit Trail

When user saves scenario, store snapshot. Show:

- Trade Spend: 10% → 15%
- Retailer Margin: 48% → 50%
- SRP: $19.99 → $21.49
- Contribution: 10.2% → 5.7%

## 69. Export

Allow export to: Excel, CSV, PDF. At minimum MVP: Excel / CSV.

Export should include: Inputs, Assumptions, Waterfall, Promotions, Trade Spend, Calculated SRP, Contribution, Sensitivity.

## 70. Save & Duplicate

User can: Save Scenario, Duplicate Scenario, Duplicate SKU, Duplicate Customer Economics.

This is important because most commercial modeling involves small variations of previous cases.

## 71. Model Validation

Warn when:

- Retailer margin >= 100%
- Distributor margin >= 100%
- Trade spend >= 100%
- Negative cost
- Negative freight
- Promo weeks > 52
- Promotion weeks overlap unexpectedly
- Contribution is negative
- Target SRP below break-even
- No annual volume exists while fixed costs exist
- Distributor selected but distributor margin missing
- Imported product but import costs blank
- Manufacturer margin entered but no manufacturing COGS exists

## 72. Model Health Score (optional feature)

Create: **Commercial Viability Score**. Do not make this a black-box AI score. Show component scoring.

Examples: Contribution Health, Shelf Competitiveness, Promotional Burden, COGS Efficiency, Channel Margin Pressure, Fixed Cost Burden.

Score: 78 / 100 — then explain exactly why.

## 73. "What Should I Change?" Feature

Button: **Improve Economics**. System evaluates variables and identifies the highest-impact levers.

Example — Current contribution 3.2%, Target 10%. Possible solutions:

- Increase SRP by $1.75, OR
- Reduce COGS by $0.68, OR
- Reduce trade spend from 18% to 11%, OR
- Negotiate retailer margin from 50% to 46%, OR
- Sell direct and eliminate 15% distributor margin

Allow combinations.

## 74. Break-Even Engine

Calculate: Break-even Brand Invoice, Break-even Retail Cost, Break-even SRP, Maximum Trade Spend Before Negative Contribution, Maximum Retailer Margin Affordable, Maximum Distributor Margin Affordable, Maximum COGS Affordable.

These are extremely useful negotiation metrics.

## 75. Example Product Workflow

User creates: **Black Seed Oil 1000 mg**

- COGS: $3.65
- Manufacturer Margin: 20%
- International freight: $0.35
- Tariff: 15%
- Domestic logistics: $0.25
- Distributor margin: 15%
- Distributor fee: $0.50
- Retailer margin: 48%
- Broker: 5%
- Deductions: 2%
- Target contribution: 8%

Then enters promotions:

- 2 BOGO events, 4 total weeks, 50% discount, 2.0x lift, 100% funding
- 8 weeks OI, 15%, 1.25x lift, 100% funding

Application calculates: Trade Spend ≈ 9.5%. Then calculates: required brand invoice, retailer landed cost, required SRP, contribution at current SRP, target SRP to protect 8% contribution, maximum affordable COGS at current SRP.

The user should be able to understand the full commercial economics in less than five minutes.

## 76. First-Time User Education

Do not present a giant blank form. Use guided steps:

1. What does the product cost?
2. Who owns logistics?
3. How do you sell it?
4. What margin does the retailer need?
5. What promotions are planned?
6. What profit do you want to protect?

Then show full model. Advanced users can select: **Skip Guided Setup**.

## 77. Contextual Help

Examples:

- User enters 50% retailer margin → tooltip: *"Retailer margin is the percentage of retail selling price retained as gross profit before the retailer's operating expenses."*
- User enters distributor margin → tooltip: *"Distributor margin and distributor markup are not the same. Confirm which calculation your distributor uses."*
- User enters 20% trade spend → tool asks: *"Would you like to build this 20% from actual planned promotions?"* Buttons: **Build Promotions**, **Keep 20%**.

## 78. Trade Spend Coach

If user manually enters 20%, display: *"You have allocated 20% of gross invoice sales to trade spend."*

Then translate it: At $1,000,000 gross invoice sales → Trade spend $200,000, Net after trade $800,000.

Make percentages financially tangible.

## 79. Promotion Translator

If the user enters BOGO, explain:

> "A fully brand-funded BOGO can represent approximately a 50% discount across promoted units, but actual brand cost depends on retailer reimbursement mechanics. Confirm whether funding is based on scan data, wholesale cost, retail discount, free units, or another agreement."

Therefore allow funding method: % of Brand Invoice, % of Retail Discount, $/Promoted Unit, $/Free Unit, $/Case, Fixed Event Fee, Manual Total.

## 80. Advanced Trade Spend Engine (Phase 2)

Phase 2 should distinguish: Off Invoice, Scanback, Billback, Accrual, Lump Sum, Slotting, Free Goods, Coupon, Display Fee, Ad Fee.

Each can have a different calculation basis.

## 81. Important Accounting Principle

Do not combine every retailer cost into "trade spend." Allow classification: Trade Promotion, Distribution, Retailer Fees, Sales Expense, Marketing, Logistics, Returns / Deductions, COGS.

This lets companies map the model to their own P&L.

## 82. Security / Multi-Tenancy

This may eventually be used by multiple brands. Each organization must only see its own: COGS, Pricing, Retailers, Products, Scenarios, Promotions, Benchmarks.

Use organization-level tenant isolation.

## 83. Suggested Technology Stack

- **Frontend:** Next.js, TypeScript, Tailwind CSS, shadcn/ui, Recharts, React Hook Form, Zod, Decimal.js
- **Backend:** Supabase, PostgreSQL, Supabase Auth

Start with simple email/password authentication. Architecture should allow migration later.

## 84. Responsiveness

Desktop is primary because users will work with financial models. Tablet should work. Mobile should provide summary viewing but does not need full financial modeling experience initially.

## 85. Testing

Write unit tests for every financial formula. Especially: margin vs markup, retailer SRP, distributor margin, trade spend, promo weighting, contribution, maximum COGS, reverse pricing, fixed-cost amortization, vertically integrated consolidated margin.

## 86. Required Promotion Unit Test

Input: 52 weeks; BOGO 4 weeks, 50%, 2x lift, 100% brand funding; OI 8 weeks, 15%, 1.25x lift, 100% brand funding.

Expected: Effective annual trade-spend rate ≈ **9.48%**. Use tolerance ±0.02%.

## 87. Required Margin Test

COGS $8, Target Margin 20% → Expected sell price **$10** (because 8 / (1 − .20) = 10).

## 88. Required Markup Test

COGS $8, Markup 20% → Expected **$9.60**.

This test exists specifically to ensure the application never confuses margin and markup.

## 89. MVP Requirements

MVP MUST INCLUDE:

- User authentication
- Organization
- Products
- Simple and detailed COGS
- Manufacturer margin
- Landed cost
- Cost ownership
- Direct vs distributor channel
- Distributor economics
- Retailer economics
- Build-up pricing
- Reverse pricing
- Promotion planner
- Trade-spend calculation
- Contribution margin
- Pricing waterfall
- Commercial Advisor
- Sensitivity analysis
- Save scenario
- Duplicate scenario
- Portfolio screen
- Excel/CSV export
- Tooltips explaining calculations

## 90. Phase 2

Add: Promotion calendar, Promo ROI, Retailer benchmark database, Category benchmark database, Competitive shelf price uploads, Distributor contract terms, Volume forecasting, Scenario optimization, Retailer-specific templates, AI document extraction, Import distributor agreements, Import retailer terms, Automatically identify fees, Amazon economics, DTC economics, Club economics, Private label bidding, Multi-currency FX feeds.

## 91. Future AI Document Upload

Eventually allow users to upload: retailer terms, distributor agreement, costing sheet, retailer price list, promotion calendar, product COGS Excel.

AI extracts: distributor margin, retailer terms, BDF, payment terms, promotions, fees, trade requirements.

Then asks: *"I found a 2% BDF and a 5% broker commission. Should I add these to the model?"*

Never automatically add extracted assumptions without approval.

## 92. Future Retail Whitespace Integration

Eventually allow user to upload competitive shelf prices. Example: Competitor A $19.99, Competitor B $21.99, Competitor C $17.99.

Tool can say: *"Your required SRP is $24.49, approximately 18% above the category median."* Then explain what cost or margin variables would need to change to compete.

## 93. Core Product Philosophy

The application must always answer three questions:

1. **WHAT IS THE ECONOMICS?** Show exactly where the money goes.
2. **IS IT VIABLE?** Show whether contribution and shelf price work.
3. **WHAT CAN I CHANGE?** Show which variables have the greatest impact.

## 94. Do Not Build a Glorified Spreadsheet

The product should simplify complex pricing decisions. Avoid showing 100 input fields at once. Use progressive disclosure.

Basic users should see approximately 8–12 important assumptions. Advanced users can expand: Advanced Costs, Advanced Distributor Terms, Advanced Retail Terms, Advanced Promotions.

## 95. Main Dashboard Summary

At the top of every scenario show:

- Shelf Price: $19.99
- Required Shelf Price: $21.49
- Trade Spend: 11.5%
- Brand Contribution: 5.2%
- Target Contribution: 10%
- Pricing Gap: -$1.50

Then one sentence: *"At the current $19.99 SRP, this product falls 4.8 percentage points below your target contribution margin."*

Then: **See How to Fix This**.

## 96. Price Build Visual

Use a clean vertical waterfall:

- Manufacturing COGS $3.65
- ↓ Manufacturer Margin → Manufacturer Price $4.56
- ↓ Freight + Duty → Landed Cost $5.75
- ↓ Brand Economics → Brand Invoice $8.90
- ↓ Distributor → Retailer Cost $10.97
- ↓ Retailer Margin → Required SRP $21.10

Beside it: Trade Spend 11.5%, Net Brand Revenue $7.88, Contribution $1.03, Contribution Margin 13.1%.

## 97. User Should Always Be Able to Modify

COGS, Manufacturer Margin, Freight, Tariff, Duty, Other logistics, Distributor, Distributor Margin, Distributor Fees, Retailer, Retailer Margin, Broker, Trade Spend, Promo Calendar, Promo Discount, Promo Lift, Promo Funding, Deductions, Target Contribution, Target SRP, Annual Volume, Fixed Fees.

No major commercial assumption should be locked.

## 98. Claude Implementation Instruction

You are building this application, not merely designing mockups. Begin by:

1. Creating the database schema.
2. Creating financial calculation types.
3. Building and testing the calculation engine.
4. Building product setup.
5. Building pricing scenario page.
6. Building Promotion Planner.
7. Building reverse-pricing engine.
8. Building sensitivity analysis.
9. Building the Commercial Advisor.
10. Adding persistence.
11. Adding export.
12. Adding sample products.

Do not put financial formulas directly into UI components. Create unit-tested calculation functions first.

## 99. Seed Demo

Create one demo product called: **Example Supplement 60 Count**

Seed:

- Manufacturing COGS: $3.65
- Manufacturer Margin: 20%
- International Logistics: $0.35
- Tariff: 15%
- Domestic Logistics: $0.25
- Distributor Margin: 15%
- Distributor Handling: $0.50
- Retailer Margin: 48%
- Broker: 5%
- Deductions: 2%
- Target Contribution: 8%

Promotions:

- BOGO: 4 weeks, 50%, 2.0x lift, 100% funding
- OI: 8 weeks, 15%, 1.25x lift, 100% funding

The Promotion Planner should calculate approximately **9.48% trade spend**. Use this product to demonstrate the application.

## 100. Final Product Experience

A user should be able to enter: "My product costs $4.20." Then progressively add: manufacturer relationship, freight, tariff, distributor, retailer margin, promotions, desired contribution.

Within minutes the application should tell the user:

- "Your estimated landed cost is $5.48."
- "Your planned promotions create approximately 11.2% annual trade spend."
- "To maintain a 10% contribution margin, you need to invoice your distributor approximately $X."
- "With a 15% distributor margin and 48% retailer margin, your required shelf price is approximately $Y."
- "At your desired $19.99 shelf price, your contribution would instead be Z%."
- "To make $19.99 work, your maximum landed COGS is $A."
- "The biggest pressure on your economics is currently retailer margin, followed by manufacturing cost."

That is the core value proposition. The software is not only calculating a price. It is teaching a manufacturer or brand how retail economics work and what decisions they can make to create a commercially viable product.
