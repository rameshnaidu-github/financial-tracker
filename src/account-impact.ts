import { SELF_TRANSFER_SUBCATEGORY_ID } from "../shared/finance.ts";
import type { Account, Transaction } from "./types";

export type AccountImpact = {
  /** Change in what the row describes: balance for bank/food cards, outstanding for credit cards. */
  amountPaise: number;
  /** Whether this movement is good news: balance up, or card outstanding down. */
  isGood: boolean;
  label: "Balance movement" | "Outstanding movement";
  percentLabel: string;
};

function isSelfTransferTo(transaction: Transaction, accountId: string) {
  return (
    transaction.subcategoryId === SELF_TRANSFER_SUBCATEGORY_ID && transaction.transferAccountId === accountId
  );
}

/**
 * How a set of transactions (e.g. one week) moved an account. For a credit card this is the
 * change in what you owe: spending raises it, refunds and bill payments lower it. The
 * percentage compares a card's movement with its limit and a bank's with its balance before
 * the movement.
 */
export function accountImpact(account: Account, transactions: Transaction[]): AccountImpact {
  if (account.type === "credit_card") {
    const amountPaise = transactions.reduce((sum, transaction) => {
      if (transaction.accountId === account.id) {
        return sum + (transaction.direction === "outflow" ? transaction.amountPaise : -transaction.amountPaise);
      }
      if (transaction.kind === "card_payment" && transaction.transferAccountId === account.id) {
        return sum - transaction.amountPaise;
      }
      return sum;
    }, 0);
    const limit = account.creditLimitPaise ?? 0;
    return {
      amountPaise,
      isGood: amountPaise < 0,
      label: "Outstanding movement",
      percentLabel: limit > 0 ? `${formatPercent(Math.abs(amountPaise) / limit)} of limit` : "No limit set"
    };
  }

  const amountPaise = transactions.reduce((sum, transaction) => {
    if (transaction.accountId === account.id) {
      return sum + (transaction.direction === "inflow" ? transaction.amountPaise : -transaction.amountPaise);
    }
    return isSelfTransferTo(transaction, account.id) ? sum + transaction.amountPaise : sum;
  }, 0);
  const balanceBefore = account.balancePaise - amountPaise;
  return {
    amountPaise,
    isGood: amountPaise > 0,
    label: "Balance movement",
    percentLabel: balanceBefore > 0 ? `${formatPercent(Math.abs(amountPaise) / balanceBefore)} of balance` : "New activity"
  };
}

function formatPercent(ratio: number) {
  const value = Math.round(ratio * 1000) / 10;
  return value > 0 && value < 0.1 ? "<0.1%" : `${value}%`;
}
