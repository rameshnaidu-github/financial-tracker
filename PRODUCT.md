# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A small, closed set of people whose accounts the owner creates by hand. There is no sign-up:
`node server/account.ts create someone@example.com` is the only way an account comes into
existence. Three accounts exist today — the owner and two people he invited.

The primary user is a salaried person in India tracking a household's real money across bank
accounts, credit cards, food cards, loans, credit-card EMIs, investments, trips and
self-paying subscriptions. They are an expert in their own data: they learn the app once and
then use it for years, so density and precision serve them better than hand-holding.

This is a private tool, not a product being brought to market. There is no funnel, no pricing,
no marketing surface and no stranger arriving cold. Future work optimises for the people
already here.

## Product Purpose

To hold one household's complete money picture in a single place where the figures agree with
each other and with the bank.

Four jobs, all confirmed as real by the owner, all of them ordinary parts of a week:

1. **Log what was just spent** — quick capture, usually on a phone, soon after the transaction.
2. **Reconcile against a statement** — sit with a bank or card statement and make the app agree
   with it.
3. **Check before spending** — available cash, card utilisation, what is due soon, budget left.
4. **Plan and review the month** — Budget Planner, Reports, net worth, loan and EMI progress.

Success is that the owner trusts the number on the screen enough to act on it without opening
a banking app to check.

## Positioning

The app is built around Indian household money as it is actually shaped, not around a generic
ledger with a currency symbol swapped:

- Amounts are stored and computed in **paise**, formatted as INR, with lakh/crore shorthand.
- **Things bought on a credit card in instalments** are a first-class object (the EMI section),
  separate from borrowing (the Loans section), and an EMI's unpaid balance rides on the card it
  sits on.
- Paying a card bill asks **which of that card's EMIs the payment settled**, and updates both.
- **Food cards**, **Post Office schemes**, **fixed deposits** and **bonds** that credit a bank on
  schedule, and **AutoPay** subscriptions that take their own payment when the balance covers it,
  are modelled rather than approximated.

The other durable claim is internal consistency: one rule decides inflow versus outflow, and both
the Overview and Reports read it, so the two pages cannot disagree. Self transfers and card bill
payments are excluded from both sides, so money moving between the household's own pockets is
never counted as income or spending.

## Operating Context

**Phone first for the daily jobs, desktop for the heavy ones.** Capture, Overview, Accounts and
the quick "can I afford this" check happen on a phone — there is a bottom navigation bar, and a
whole operations doc (`docs/PHONE_ACCESS_AND_OPERATIONS.md`) about reaching a self-hosted
instance from a phone over Tailscale. Reports, Budget Planner and Investments are sit-down work
on a laptop and may assume width.

The app runs two ways from one codebase, decided by whether `DATABASE_URL` is set:

- **Hosted** — Vercel plus Supabase Postgres, behind a sign-in; this is how the owner and the two
  invited people reach it day to day.
- **On a single machine** — an in-process Postgres under `data/`, reaching nothing outside the
  project, with automatic local backups every 30 minutes and on shutdown.

Statements, spreadsheets and the import template (`docs/financial-tracker-import-template.xlsx`)
are part of how data arrives. The Transactions page exports whatever the current filters show,
which is the copy the user holds themselves.

## Capabilities and Constraints

Confirmed functionality, by section: Overview, Transactions, Reports, Budget Planner, AutoPay,
Vacations, Accounts, Loans, Investments, EMI, Categories, What's new, FAQ, Profile.

Terminology that is load-bearing and must not drift:

- **Type** and **SubType** — the two-level taxonomy everything is filed under. Each has a
  *behavior* (expense, income, loan, investment, transfer, refund, adjustment) and the behavior,
  not the name, decides how a transaction counts.
- **Outstanding** for a card and a loan; **balance** for a bank or food card. A card shows what
  you owe, a bank shows what you have, and the two must never be worded alike.
- **EMI** means something bought on a credit card in instalments. **Loan** means borrowed money.
  They work the same way; the difference is the credit card.

Durable constraints:

- Every row carries whose it is, and every query names the person. A test in the suite reads the
  statements the services issue and fails if one touches a user-scoped table without naming the
  user.
- Row-level security is enabled on all tables but enforces nothing for the application, because
  the role it connects as carries `rolbypassrls`. The query scoping above is the real protection.
  **Known open item**, recorded here so no future work assumes otherwise.
- `DATABASE_URL` must never be shared: that string reads and writes everyone's rows.
- A transaction cannot be dated in the future.
- Deleting an account is history-safe: unused accounts go, used ones are hidden so past
  transactions and reports still compute.
- Every account receives the shipped Types and SubTypes, including ones added in a later release,
  while a default deleted on purpose stays deleted.
- Hosted deployments take no backups of their own; the database host keeps them.

Explicitly undecided: whether archiving an account means "closed, the money moved" or "delete,
this was a mistake". The question is open and future work must not quietly pick one.

## Brand Commitments

The name is **Financial Tracker**. Nothing else is a binding identity constraint — no logo,
wordmark, palette or typeface has been declared fixed by the owner, and the incumbent interface
is evidence rather than a commitment.

The product's voice, as written throughout the UI, FAQ and What's new, is plain, specific and
unembarrassed: it explains how a figure is worked out rather than asserting it, and it says what
changed rather than celebrating it. What's new carries two kinds of line and no others — what you
can now do, and what was wrong and is not any more.

## Evidence on Hand

- `README.md` — the maintained account of what the app does, how money is counted, and how it is
  run and deployed.
- `assets/screenshots/overview.png` — the Overview screen, **with fake demo data**, and labelled
  as such.
- `docs/QA_CHECKLIST.md` — the A/B quality pass the project is held to.
- `docs/financial-tracker-import-template.xlsx` — the spreadsheet users import from.
- `docs/PHONE_ACCESS_AND_OPERATIONS.md` — remote access over Tailscale.
- `src/whats-new.ts` — the shipped release history, in the product's own voice.
- `tests/qa-smoke.ts` — 110 automated tests covering the business logic.

There are **no** customers, testimonials, case studies, press, benchmarks, pricing or usage
figures, and none may be invented. Any screenshot used anywhere must either be labelled as demo
data or contain no real figures.

## Product Principles

1. **The figures agree, everywhere.** One rule for inflow and outflow, read by every page. If two
   screens could disagree, that is a defect, not a presentation choice.
2. **Reality wins over the ledger.** When the app and the statement disagree, the app is wrong and
   must be correctable in place — an adjustment, an editable opening figure — and the correction
   is itself a record that can be undone.
3. **Indian household money is the shape of the product**, not a localisation layer: paise, card
   EMIs, food cards, Post Office schemes, AutoPay.
4. **Capture on a phone, analyse at a desk.** The daily jobs must be excellent at 375px; the
   analytical pages may assume width.
5. **Each person sees only their own money.** Separation is enforced in every query, and no
   feature may need a route around it.

## Accessibility & Inclusion

No formal standard has been set by the owner, and none is claimed. The incumbent implementation
already honours `prefers-reduced-motion`, labels its controls, and describes its fields with
`aria-describedby`; treat that as the floor to maintain rather than as a commitment the owner
has made. Establishing a target standard is an open question.
