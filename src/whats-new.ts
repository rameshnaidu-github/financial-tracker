/**
 * What changed, written for the person using the application rather than for whoever changed it.
 *
 * Newest first, one entry per day something shipped, and each date appears once. Add to the top
 * of this list as part of the change itself; an entry written weeks later is one nobody writes.
 * The dot beside What's new in Setup is on until the reader has seen the newest date here.
 */
export type NewsEntry = {
  /** The day it shipped. Also its identity, which is why no two entries share one. */
  date: string;
  lines: string[];
};

export const WHATS_NEW: NewsEntry[] = [
  {
    date: "2026-11-09",
    lines: [
      "A review of every feature turned up nine gaps, and these are the fixes. Three of them change figures you already had on screen.",
      "Archiving now only hides. An archived card EMI still counts as owed and an archived bank still counts as yours, the way an archived loan always did — so your net worth may move when you open this.",
      "A credit balance on a card no longer reads as spending power: the available limit stops at the card's limit, and a card in credit is no longer counted as an asset.",
      "A trip no longer counts spending that was refunded. A fully refunded trip expense now costs the trip nothing, as it already did in the reports.",
      "A transaction can no longer be dated in the future — the ledger records what has happened, and a mistyped year was quietly moving your balance.",
      "A transfer can only name another account when it is a self transfer or a card payment. On any other subtype the money used to leave one bank and arrive nowhere.",
      "An AutoPay that cannot pay because its bank was archived now says so under Upcoming payments instead of stopping in silence.",
      "The intro film no longer plays over the sign-in screen."
    ]
  },
  {
    date: "2026-11-08",
    lines: [
      "What's new: this page. The speaker in Setup carries a dot until you have read the latest entry.",
      "Editing something and then switching part of it off now sticks. A fund moved from SIP back to lump sum really does lose its schedule, and stops taking instalments.",
      "An EMI can be moved to a different card, or taken off a card altogether, in which case it becomes an ordinary loan.",
      "An AutoPay can have its bank removed. It goes back to only reminding you, and stops paying itself."
    ]
  },
  {
    date: "2026-11-07",
    lines: [
      "The transactions list is grouped by day, with each heading carrying that day's count and net. Rows no longer repeat the date, and are about half as tall as they were.",
      "Editing anything opens a popup where you are, instead of sending you to a form at the top of the page. Closing it leaves the page exactly where it was.",
      "The add forms are folded away behind a single row until you want them.",
      "An AutoPay shows the bank it is taken from, beside its status.",
      "Loan and EMI interest paid before you started recording EMIs is now read from the loan's own schedule rather than the calendar. A loan entered with nothing yet repaid correctly shows no interest paid."
    ]
  },
  {
    date: "2026-11-01",
    lines: [
      "Post Office schemes, fixed deposits and bonds credit their bank on schedule until their last paying day, and show interest earned rather than a paper gain.",
      "A mutual fund can be bought as a SIP: it takes its own instalment from a bank you choose, when the balance covers it.",
      "An AutoPay with a bank attached pays itself, and waits quietly when the balance is short.",
      "Paying a credit card asks which of that card's EMIs the payment settled, and updates both together.",
      "The Overview shows what you charged to your cards this month, EMIs excluded.",
      "Transactions can be deleted several at a time, and holdings can be grouped by the year or month you invested."
    ]
  }
];

/**
 * Is there an entry the reader has not seen?
 *
 * `lastSeen` is the date of the newest entry they have read, or null on a first visit -- when
 * everything is unread, which is the honest answer rather than the quiet one.
 */
export function hasUnreadNews(entries: NewsEntry[], lastSeen: string | null): boolean {
  const newest = entries[0]?.date;
  if (!newest) {
    return false;
  }
  return !lastSeen || newest > lastSeen;
}

/** The date to remember once the page has been opened. */
export function newestNewsDate(entries: NewsEntry[]): string | null {
  return entries[0]?.date ?? null;
}
