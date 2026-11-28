/*
 * What the bell at the top of every page is pointing at.
 *
 * Lifted out of App.tsx unchanged. It is a pure function of the data the shell already holds --
 * no state, no rendering -- and it decides whether a reminder fires at all, which makes it
 * exactly the kind of thing that should be testable. It could not be: the QA suite runs under
 * Node's own type stripping, which handles .ts and refuses .tsx, so nothing in a component file
 * can be imported by a test. Its own module, and the suite can reach it.
 */
import {
  INSURANCE_REMINDER_DEFAULT_DAYS,
  debitsInMonth,
  insuranceKindLabel,
  policyExpiry,
  policyExpiryLabel
} from "../shared/finance.ts";
import { formatINRWhole } from "./format.ts";
import type { Page } from "./navigation.ts";
import type { Account, AutopaySubscription, InsurancePolicy, Loan } from "./types.ts";

/** How much of its limit a card is using, as a whole percent. A card with no limit uses none. */
export function cardUsagePercent(account: Account): number {
  const limit = account.creditLimitPaise ?? 0;
  if (limit <= 0) {
    return 0;
  }
  return Math.round((Math.max(account.outstandingPaise, 0) / limit) * 100);
}

/** One thing asking to be looked at, and where looking at it happens. */
export type AttentionItem = {
  id: string;
  label: string;
  detail: string;
  page: Page;
  tone: "warning" | "danger" | "neutral";
};

/**
 * What actually needs attention, in the order it deserves it.
 *
 * The reference's shell has a bell on it. A bell that is always lit, or lit by nothing, is
 * decoration -- so this is a rule rather than a list: each item is a condition that is either
 * true of the data or absent entirely. Nothing needing attention produces nothing, and the
 * control says so rather than showing an empty tray.
 *
 * Three conditions, each one the owner can act on today:
 *   - transactions with no category, which quietly fall out of every report and budget
 *   - a bill due in the next week: a card's payment, a loan's instalment, a subscription's debit
 *   - a card past the utilisation the owner themselves set as the line
 *
 * `today` is passed rather than read, so the same data gives the same answer on any day a test
 * cares to ask about.
 */
export function attentionItems({
  accounts,
  loans,
  subscriptions,
  policies = [],
  uncategorizedCount,
  cardAlertPercent,
  insuranceReminderDays = INSURANCE_REMINDER_DEFAULT_DAYS,
  today
}: {
  accounts: Account[];
  loans: Loan[];
  subscriptions: AutopaySubscription[];
  policies?: InsurancePolicy[];
  uncategorizedCount: number;
  cardAlertPercent: number;
  insuranceReminderDays?: number;
  today: string;
}): AttentionItem[] {
  const items: AttentionItem[] = [];
  const day = Number(today.slice(8, 10));
  const daysInMonth = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate();
  /* "Within the next week" has to wrap: on the 28th, a bill on the 2nd is four days off, not
     twenty-six days behind. A day already past this month is not due again until next month. */
  const daysAway = (dueDay: number) => (dueDay >= day ? dueDay - day : dueDay + daysInMonth - day);
  const soon = (dueDay: number | null) => dueDay !== null && dueDay >= 1 && daysAway(dueDay) <= 7;
  const live = accounts.filter((account) => !account.isArchived);

  if (uncategorizedCount > 0) {
    items.push({
      id: "uncategorized",
      label: `${uncategorizedCount} transaction${uncategorizedCount === 1 ? "" : "s"} need${
        uncategorizedCount === 1 ? "s" : ""
      } a category`,
      detail: "Until they have one they are missing from reports and budgets.",
      page: "transactions",
      tone: "warning"
    });
  }

  for (const account of live) {
    if (account.type !== "credit_card" || account.outstandingPaise <= 0) continue;
    if (!soon(account.paymentDueDay)) continue;
    const away = daysAway(account.paymentDueDay as number);
    items.push({
      id: `card-due-${account.id}`,
      label: `${account.name} bill due ${away === 0 ? "today" : away === 1 ? "tomorrow" : `in ${away} days`}`,
      detail: `${formatINRWhole(account.outstandingPaise)} outstanding.`,
      page: "accounts",
      tone: away <= 1 ? "danger" : "warning"
    });
  }

  for (const loan of loans) {
    if (loan.isArchived || loan.outstandingPaise <= 0 || !soon(loan.emiDueDay)) continue;
    const away = daysAway(loan.emiDueDay as number);
    items.push({
      id: `emi-due-${loan.id}`,
      label: `${loan.name} instalment due ${away === 0 ? "today" : away === 1 ? "tomorrow" : `in ${away} days`}`,
      detail: `${formatINRWhole(loan.monthlyEmiPaise)} a month.`,
      page: "loans",
      tone: away <= 1 ? "danger" : "warning"
    });
  }

  /*
   * A policy about to lapse, and one that already has.
   *
   * Unlike everything else in this list, which asks "is the due day within a week", a policy
   * is measured against a real date and a window the owner sets -- a renewal needs weeks of
   * notice, not days, and a bill does not. And unlike everything else, it does not stop
   * mattering once the date has passed: a lapsed policy is the loudest thing here, and stays
   * loud until its end date is moved or it is deleted.
   */
  for (const policy of policies) {
    const expiry = policyExpiry(policy.endDate, today, insuranceReminderDays);
    if (expiry.state === "fine") continue;
    items.push({
      id: `insurance-${policy.id}`,
      label:
        expiry.state === "lapsed"
          ? `${policy.name} has lapsed`
          : `${policy.name} expires ${expiry.daysLeft === 1 ? "tomorrow" : `in ${expiry.daysLeft} days`}`,
      detail:
        expiry.state === "lapsed"
          ? `${policyExpiryLabel(expiry)}. Renew it, or change the end date if you already have.`
          : `${insuranceKindLabel(policy.kind)} cover · ${policyExpiryLabel(expiry)}.`,
      page: "insurance",
      tone: expiry.state === "lapsed" || expiry.daysLeft <= 7 ? "danger" : "warning"
    });
  }

  for (const subscription of subscriptions) {
    if (subscription.isArchived || subscription.status !== "active") continue;
    const debitDay = Number(subscription.startDate.slice(8, 10));
    if (!soon(debitDay)) continue;
    const away = daysAway(debitDay);
    // The day is right for every cadence; the month is only right for monthly. A day already
    // past this month falls next month, which is the same wrap daysAway makes.
    const [year, monthIndex] = today.split("-").map(Number);
    const dueMonth = new Date(year, monthIndex - 1 + (debitDay >= day ? 0 : 1), 1);
    const dueMonthKey = `${dueMonth.getFullYear()}-${String(dueMonth.getMonth() + 1).padStart(2, "0")}`;
    if (!debitsInMonth(subscription.startDate, dueMonthKey, subscription.cadence)) continue;
    items.push({
      id: `autopay-${subscription.id}`,
      label: `${subscription.name} debits ${away === 0 ? "today" : away === 1 ? "tomorrow" : `in ${away} days`}`,
      detail: `${formatINRWhole(subscription.amountPaise)}${
        subscription.accountName ? ` from ${subscription.accountName}` : ", with no account to take it from"
      }.`,
      page: "subscriptions",
      tone: subscription.accountName ? "neutral" : "warning"
    });
  }

  for (const account of live) {
    if (account.type !== "credit_card") continue;
    const used = cardUsagePercent(account);
    if (used < cardAlertPercent) continue;
    items.push({
      id: `card-usage-${account.id}`,
      label: `${account.name} is ${used}% used`,
      detail: `Your alert is set at ${cardAlertPercent}%.`,
      page: "accounts",
      tone: used >= 90 ? "danger" : "warning"
    });
  }

  // Worst first, so the control's own count and its first line agree about what matters.
  const weight = { danger: 0, warning: 1, neutral: 2 } as const;
  return items.sort((a, b) => weight[a.tone] - weight[b.tone]);
}
