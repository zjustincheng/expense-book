# Shared Money SaaS — Website Creation Guideline

Status: implementation brief incorporating confirmed product decisions. Supplied historical files are examples only, not a migration requirement or a verified source of current balances.

## 1. Product purpose

Build a multi-user SaaS application that helps groups record shared income and expenses, distinguish economic entitlement from actual cash movement, and settle outstanding member balances with clear explanations.

The application must answer:

- What income was received and what expenses were paid?
- Who actually received or paid each amount?
- How was each transaction divided, and why?
- What is each member’s allocated income, allocated expense, and net fair share?
- What is each member’s actual net cash movement within the group?
- Who should pay whom, how much remains unsettled, and which records explain it?

Use generic concepts: groups, members, projects, categories, transactions, allocations, and settlements. Rental properties are one use case alongside families, roommates, trips, businesses, investment partnerships, vacation homes, couples, clubs, and events. Do not require addresses, tenants, property ownership, or rental periods in the core model.

## 2. What the example source files illustrate

Example sources: [rental_houses.toml](rental_houses.toml) and [rental-property-report-2015-to-2024.txt](rental-property-report-2015-to-2024.txt). Use them to understand possible workflows and data shapes. Do not review every old row, import them by default, or treat their balances as verified.

| Source feature                                  | Product requirement                                                                           |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Owners and per-house ownership shares           | Members and configurable project allocation defaults                                          |
| `keeper` with transaction-level `who` overrides | A default cash participant plus explicit actual payers/recipients on every posted transaction |
| Both `income` and `cost`                        | Equal support for shared income and shared expenses                                           |
| Arithmetic strings such as `1200 * 12`          | Preserve calculation expressions and show their evaluated amounts                             |
| Shared costs, family gifts, and trips           | Group-wide transactions and optional projects/tags                                            |
| `for_house = false`                             | Reporting classification independent of whether a transaction affects member balances         |
| Annual cash-flow records                        | Annual aggregate imports without invented payment dates                                       |
| Detailed report formulas                        | A drill-down explanation from balance to transaction, allocation, and cash participant        |
| `misc.pay_flow`                                 | Separate obligations, transfers, and settlements; examples do not require historical review   |
| Notes describing past clearing                  | Preserve notes; require evidence before marking a balance settled                             |
| Foreign-currency conversions in descriptions    | Preserve source notes; do not infer exchange rates or native-currency amounts automatically   |

The TOML includes 2025 shared entries, while the report covers 2015–2024. Any future optional comparison must explicitly identify the overlapping scope.

The report’s sign convention is useful: positive means a member should receive money; negative means they should pay. Its `earning` section excludes some non-property activity that still affects balances. Preserve that reporting distinction through filters rather than a property-specific boolean in the new model.

The report contains cent-level differences between some opposite member amounts. Treat it as a comparison reference, not an unquestionable rounding specification.

## 3. First-release scope and defaults

Deliver a responsive web application with authenticated users, multiple independent groups, member invitations, optional projects, income and expense entry, configurable splits, balance explanations, distinct financial record types, recorded settlements, and downloadable reports. Opening-balance entry and full historical import are later optional capabilities, not MVP requirements.

Defaults (confirmed decisions are recorded in section 11):

- One currency per group, selected at creation and fixed after financial posting. No cross-currency netting.
- Track actual money received and paid; planned transactions remain drafts and do not affect balances.
- Track cash through individual members only for MVP. Shared bank accounts and cash funds are a later extension; see section 11.
- New groups start at zero. Do not derive starting or current balances from the example files.
- Record payments made outside the application. The first release does not move money.
- Support members without login accounts, with optional later account linking.
- Use one optional project per transaction initially, plus tags and categories. Group-wide transactions need no project.
- Allow different allocations for every income and expense transaction.
- Carry balances forward across years; never reset balances automatically at year-end.

Full accounting, invoicing, payroll, tax reporting, asset valuation, loan amortization, bank synchronization, automatic currency conversion, and payment execution are later scope. Describe the core result as “shared net activity,” not accounting profit. Historical mortgage, purchase, and deposit entries need explicit classification review if accounting-style reports are introduced.

## 4. Core financial rules

### Separate actual cash from economic allocation

Every posted income or expense contains two independent sets of rows:

1. Cash participation: the amounts actually received or paid by each member.
2. Economic allocation: the amounts of income entitlement or expense responsibility assigned to each member.

Both sets must individually sum exactly to the transaction amount. Support multiple recipients or payers, including members who receive or pay cash but have no economic share. Cash participation must never be inferred from the split.

Split methods: equal among selected members, percentages, proportional weights, and exact amounts. Defaults follow transaction override → project default → group default. Store the resolved member amounts and rule snapshot when posting. Later membership or default changes must not silently recalculate history.

### Balance formula

For member `m`, using posted records through a selected cutoff:

```text
fair_share[m] = allocated_income[m] - allocated_expenses[m]
activity_cash[m] = income_received[m] - expenses_paid[m]
settlement_cash[m] = completed_settlements_received[m]
                   - completed_settlements_sent[m]
transfer_cash[m] = completed_transfers_received[m]
                 - completed_transfers_sent[m]
actual_net_cash[m] = activity_cash[m] + transfer_cash[m] + settlement_cash[m]

outstanding[m] = opening_balance[m]
               + fair_share[m]
               - actual_net_cash[m]
               + obligation_adjustments[m]
               + balance_corrections[m]
```

`opening_balance` is zero for new groups. A later optional “Opening balance as of [date]” feature may record the supported unsettled amount at a defined cutoff, not a bank balance. `obligation_adjustments` are explicit non-cash amounts owed between members that are not already represented by income or expenses. `balance_corrections` contains separately recorded, balanced non-cash corrections; reversal/replacement effects are counted in their original record categories, never again as balance corrections.

- Positive outstanding: “Should receive.”
- Negative outstanding: “Should pay.”
- Zero outstanding: “Settled.”

“Actual net cash” describes recorded movement within this group. It is not a member’s bank balance or total wealth.

A direct obligation from A to B adds a negative adjustment to A and an equal positive adjustment to B. It changes neither income nor expenses and must include a reason. A completed settlement from A to B increases A’s outstanding balance toward zero and decreases B’s toward zero. An obligation and its payment are distinct records.

Opening balances, obligation adjustments, and non-cash balance corrections must each balance to zero across the group. Never import an opening balance for activity also imported in full.

### Worked example

A receives 1,000 of income; B pays 200 of expenses; both transactions are split equally.

| Member | Income share | Expense share | Fair share | Activity cash | Outstanding |
| ------ | -----------: | ------------: | ---------: | ------------: | ----------: |
| A      |          500 |           100 |        400 |         1,000 |        -600 |
| B      |          500 |           100 |        400 |          -200 |        +600 |

A should pay B 600. After a completed payment of 250, A should pay 350 and B should receive 350. Income remains 1,000 and expenses remain 200.

### Precision and invariants

- Store posted money in integer minor units, with currency precision defined explicitly. Use decimal or rational arithmetic for expressions and split calculations; never binary floating point for money.
- Round an expression’s final amount once to currency precision using a documented rule, proposed half-up. Preserve the original expression and evaluated result.
- Allocate indivisible minor units by largest remainder, with a stable member-ID tie-break. Store the resulting amounts; expose rounding details.
- Validate percentages total 100%, weights are positive, and exact allocations total the transaction amount. A zero share can be represented by excluding a member.
- Across a member-only group, outstanding balances sum exactly to zero.
- Total unsettled equals the sum of positive outstanding balances, equivalently the absolute sum of negative balances. Do not add both sides.
- Totals must reconcile between transaction details, dashboards, exports, and explanations.

## 5. Transaction and settlement lifecycle

Use draft, posted, and reversed states. Only posted entries and their posted reversals affect calculations. Corrections to posted financial records must preserve the original and create linked reversal/replacement records in an atomic operation.

Income and expenses use positive amounts; the transaction type defines direction. Support linked partial or full refunds that reverse the original economic allocation proportionally, respect the original rounding, and record the actual refund payer/recipient independently. Prevent refunds exceeding the original amount unless recorded as a separate justified transaction.

Keep these concepts distinct:

- Income or expense: creates economic allocation and records external cash movement.
- Direct obligation: records an amount owed without claiming cash moved; requires a reason and duplicate-entry checks.
- Transfer: records actual movement of money between members without creating income or expense allocations. Keep it distinct from a payment explicitly designated to settle an obligation. Completed transfers affect member cash positions and therefore outstanding balances.
- Settlement: records a completed member-to-member payment explicitly intended to settle outstanding balances, without changing shared net activity.
- Adjustment/correction: records an explicit, explained correction with audit history. Non-cash balance adjustments must balance to zero; corrections to existing posted records use linked reversal/replacement records. Do not disguise corrections as new obligations or payments.

A cash movement is recorded once, as either a transfer or a settlement; linking it to an obligation must not duplicate its financial effect.

Keep computed proposals separate:

- Settlement suggestion: a computed proposal with no ledger effect.

For the MVP, an authorized editor may record a completed settlement with sender, recipient, amount, date, and optional reference. Show who recorded it and do not label it bank-verified. Pending or disputed payment claims must be visibly separate from completed payments.

Generate deterministic debtor-to-creditor suggestions within one group and currency. Explain that these are proposed ways to settle net balances, not proof of a direct historical debt between those two people. Do not claim a globally minimal number of payments. Recompute after any financial change and revalidate before recording a suggested payment.

Support partial payments and reversals. An overpayment must show the resulting opposite balance rather than disappear or be capped silently.

## 6. Website structure and key flows

| Screen                           | Required behavior                                                                                                                                                                              |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public landing page              | Explain shared income, expenses, fair shares, and settlements using a mixed-income example; show several group use cases                                                                       |
| Sign-in and onboarding           | Create a group, choose currency, add members, choose split defaults, optionally add a project                                                                                                  |
| Group dashboard                  | Show income, expenses, shared net activity, total unsettled, and the signed balance of each member with clear date scope                                                                       |
| Transactions                     | Search/filter by period, project, type, category, member, and status; distinguish income/expense allocations, direct obligations, transfers, settlements, and adjustments/corrections visually |
| Add income / expense             | Enter amount or expression, description, date, actual recipient(s)/payer(s), split, optional project/category/notes/attachment                                                                 |
| Transaction detail               | Show cash participation, economic allocation, calculation, per-member balance impact, source provenance, and revision history                                                                  |
| Members and balances             | Show each member’s fair share, actual net cash, adjustments, payments, and outstanding balance                                                                                                 |
| Balance explanation              | Trace the selected balance through opening amount, activity, obligations, and settlements to contributing records                                                                              |
| Settlements                      | Show proposed payments, record completed payments, and inspect payment history                                                                                                                 |
| Projects                         | Organize optional subgroups of activity and configure prospective defaults                                                                                                                     |
| Reports                          | Period activity, cumulative balance, member statement, project/category breakdown, and CSV export                                                                                              |
| Opening balance / import (later) | Optionally enter “Opening balance as of [date]” or upload full history with validation and preview                                                                                             |
| Settings                         | Membership roles, currency, categories, split defaults, export, and group archive                                                                                                              |

Before posting a transaction, preview the cash amounts, allocated amounts, and resulting balance changes. Use “Received by” for income and “Paid by” for expenses. Keep “Shared with” and allocation controls separate.

Distinguish a period activity report from a cumulative unsettled balance. A member statement shows opening outstanding, period balance changes, and closing outstanding. A project-filtered activity balance must not be presented as fully settled unless settlements have an explicit project allocation. Initially record settlements at group level and label project views accordingly.

Use a calm, legible interface with clear tables, visible currency, accessible forms, keyboard support, responsive mobile entry, and text labels alongside colors. Make “Why this balance?” available directly from each member balance. Include helpful empty, loading, validation, permission, and import-error states.

## 7. Generic data model

| Entity                  | Main responsibilities                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| User                    | Login identity and profile                                                                                          |
| Group                   | Tenant boundary, name, currency, timezone, settings                                                                 |
| Member                  | Group participant, optional linked user, active/archive status                                                      |
| Membership/access grant | User’s role and access to a group; distinct from economic allocation                                                |
| Project                 | Optional activity grouping and prospective split/cash-participant defaults                                          |
| Category/tag            | Generic reporting organization scoped to the group                                                                  |
| Split rule/version      | Method, participants, weights or percentages, effective settings                                                    |
| Transaction             | Type, amount, date or aggregate period, description, status, project, source metadata, revision links               |
| Cash participation      | Transaction, member, actual amount received or paid                                                                 |
| Economic allocation     | Transaction, member, allocated amount, rule snapshot and rounding detail                                            |
| Transfer                | Group, sender, recipient, amount, date, state, recorder, reason, reference, reversal link; distinct from settlement |
| Settlement              | Group, sender, recipient, amount, date, state, recorder, reference, reversal link                                   |
| Adjustment/correction   | Balanced non-cash corrections or linked reversal/replacement records, reason, actor, date, provenance               |
| Obligation adjustment   | Balanced debtor/creditor entries, amount, reason, date, provenance                                                  |
| Opening balance batch   | Balanced member amounts and cutoff date with source explanation                                                     |
| Attachment              | Private file reference, ownership, metadata                                                                         |
| Import batch/source row | Source checksum, original row identity/text, mapping, review status, errors                                         |
| Audit event             | Actor, timestamp, action, affected record and changes                                                               |

All financial child records must belong to the same group as their parent and referenced members. Archived members remain in historical reports and balances. Archiving a project or group preserves records.

## 8. Architecture and SaaS requirements

Use a modular application with a relational database, server-side authorization, and a centralized financial calculation module. Keep calculation rules independent of UI and import format. Use the confirmed stack below. Select compatible package and provider versions during implementation.

### Required repository structure

When implementation begins, organize code into these top-level directories:

```text
frontend/        # Website, UI components, client-side interactions, frontend tests
backend/         # API, authorization, financial rules, persistence, migrations, backend tests
infrastructure/  # Deployment configuration, infrastructure provisioning, environment setup
```

Keep financial calculations and authoritative validation in `backend/`; the website consumes backend APIs. Keep database schema migrations with backend code and database provisioning in `infrastructure/`. Root-level documentation and shared development configuration may remain at the repository root. Do not place application source code at the root or mix backend business logic into deployment configuration.

### Confirmed technology stack

- **Frontend:** Next.js, React, TypeScript, Tailwind CSS, and shadcn/ui in `frontend/`.
- **Backend:** Node.js and TypeScript in `backend/`, with a separate API/service layer owning authorization, financial calculations, authoritative validation, and database access. Next.js may handle presentation and frontend integration, but must not become the authoritative financial service. Choose the backend HTTP framework during implementation.
- **Database:** PostgreSQL with Drizzle ORM. Keep Drizzle schema definitions and migrations in `backend/`; provision the database through infrastructure code.
- **Infrastructure:** Terraform in `infrastructure/`, targeting AWS.
- **CI/CD:** GitHub Actions workflows in the required `.github/workflows/` location. Workflows validate and build the frontend/backend and support Terraform checks and deployment. Keep provisioning definitions in `infrastructure/`.
- **Application hosting:** ECS/Fargate is the default target for separately deployable frontend and backend services; a comparable AWS option may be used if justified during implementation.
- **Managed database:** Amazon RDS for PostgreSQL, with network access restricted to authorized application and operational paths.
- **Attachments:** private Amazon S3 storage, with backend-authorized upload/download access and no public bucket access.
- **Delivery and DNS:** Amazon CloudFront and Route 53. Configure dynamic/API routes to avoid caching private user responses; define routing and TLS in infrastructure code.
- **Secrets:** AWS Secrets Manager for runtime secrets, accessed through scoped workload permissions. Do not commit secrets or expose backend credentials through frontend environment variables.

Amazon Cognito is the confirmed authentication provider. AWS region, domain, and environment sizing remain implementation/deployment choices. They do not block building the core application; resolve them before the affected integrations or deployment. Subscription packaging is needed before paid launch, not before starting the MVP.

- Persist a financial event and all its cash/allocation rows atomically.
- Enforce tenant boundaries on every query, mutation, export, and attachment request. Test access through guessed identifiers.
- Use a proposed role matrix: admin manages settings/members and financial records; editor manages financial records; viewer reads and exports. All group members see group financial activity initially; granular privacy is later scope.
- Keep SaaS billing separate from members’ financial shares and balances. Subscription fees must not appear in a group ledger automatically.
- Use idempotency for posting, imports, and settlement recording; use version checks to prevent lost edits.
- Treat the financial ledger as authoritative. Cached balances must be rebuildable and identifiable by ledger version.
- Store attachments privately, validate uploaded content and size, and authorize downloads.
- Provide backups, restoration verification, error monitoring, and audit history. Keep financial contents out of routine application logs.
- Specify subscription packaging before paid launch; core ledger correctness must not depend on plan tier.

## 9. Historical data and optional future import

The supplied files are examples only. Do not build a required migration, review every old miscellaneous row, or use the files to establish verified current balances. MVP groups start at zero and record new activity.

Later, support two optional ways to establish prior history:

1. **Opening balance as of [date]:** enter balanced member outstanding amounts at an explicit cutoff, with a source explanation. These are unsettled amounts, not bank balances. Clearly define which subsequent activity is included.
2. **Full historical import:** upload, map, validate, preview, and explicitly commit user-selected history. Preserve source provenance, actual date precision, calculation expressions, and original files. Keep unresolved records in staging and label incomplete history clearly.

Do not combine an opening balance with imported activity already included in that balance. Separate income/expense allocations, direct obligations, transfers, settlements, and adjustments/corrections during import. Never infer completed payments from ambiguous notes or claim current balances are verified solely from historical activity.

Future import must use a restricted arithmetic parser, preserve multilingual labels, prevent duplicate financial effects on reimport, and preview revisions to changed source rows. Annual aggregates must retain year precision rather than invented payment dates. Any optional comparison with a reference report must distinguish scope, rounding, and classification differences.

## 10. Delivery sequence and acceptance criteria

### Stage 1 — Financial foundation

Implement the generic schema, decimal expression evaluation, allocations, direct obligations, transfers, settlements, balanced adjustments/corrections, reversals, and financial explanations. New groups must start at zero. Validate the core independently of the interface.

Required calculation cases:

- Income only: A receives 100, split equally with B; A owes B 50.
- Expense only: A pays 100, split equally with B; B owes A 50.
- Mixed activity: reproduce the 1,000 income / 200 expense example above.
- Unequal split: A receives 100 split 70/30; A owes B 30.
- Multiple payers: A pays 60 and B pays 40 for a 100 expense allocated 25/75; A should receive 35 from B.
- Rounding: allocate 10.00 equally among three members as 3.34/3.33/3.33 under the documented tie-break, with no lost cent.
- A completed settlement changes outstanding balances but never income or expenses.
- A direct obligation creates equal opposite balances without claiming cash moved.
- Transfers and settlements remain distinct records; each completed cash movement affects balances exactly once and never changes income or expenses.
- Non-cash corrections balance to zero and preserve their explanation and audit history.
- A new group has zero balances without reading or importing example files.
- Partial settlement, overpayment, refund, reversal, archived member, and default-share changes preserve correct history.
- Repeated requests/imports do not duplicate financial effects; group balances always reconcile exactly.

### Stage 2 — Usable group application

Deliver authentication, group setup, invitations/roles, transaction entry, dashboard, balance drill-down, settlement recording, reports, and mobile layouts. Demonstrate a three-member trip and an income-sharing club without rental terminology or custom schema changes.

### Later optional capability — Opening balances and historical import

After MVP, support explicit opening balances at a cutoff or full historical import as described in section 9. This work does not block launch and does not require reviewing the supplied example files.

### Stage 3 — SaaS launch readiness

Verify group isolation, authorization, concurrent updates, backup restoration, financial audit history, accessibility, exports, and deployment configuration. Finalize subscription packaging and operational ownership before paid launch.

The release is acceptable when a user can enter mixed income/expense activity, inspect each participant’s fair share and actual cash movement, understand every outstanding balance, record a partial or full payment, and see all figures reconcile without unexplained adjustments.

## 11. Confirmed product decisions

1. **Historical miscellaneous records:** do not review every old row. Treat the old files only as examples. The new app must clearly separate income/expense allocations, direct obligations, transfers, settlements, and adjustments/corrections.
2. **Shared accounts:** no shared bank accounts or cash funds in MVP; track money paid or received by individual members only. Keep the financial calculation module extensible for later explicit account and ownership models. Before enabling shared accounts, distinguish retained group cash from member-held cash, model contributions/distributions as internal transfers, and extend reconciliation and settlement suggestions to account for retained funds. Do not model a shared account as a member with a fair share.
3. **Starting balances:** new groups start at zero by default. Old files are not a verified source of current balances. Later support optional “Opening balance as of [date]” or full historical import, with safeguards against double counting.

4. **Code organization:** use top-level `frontend/` (website), `backend/` (application/server code), and `infrastructure/` (deployment and provisioning) directories when coding begins.

5. **Technology stack:** Next.js/React/TypeScript/Tailwind/shadcn/ui frontend; a separate Node.js/TypeScript backend API; PostgreSQL with Drizzle ORM; Terraform; GitHub Actions; AWS with RDS PostgreSQL, private S3 attachments, ECS/Fargate by default, CloudFront/Route 53, and Secrets Manager.

6. **Authentication:** Amazon Cognito, confirmed before implementation. Use authorization code flow with PKCE and backend verification of access tokens.
7. **Implementation quality:** review code throughout development for correctness, readability, maintainability, and efficiency; run appropriate tests and checks with each meaningful implementation milestone.
