/**
 * What changed, written for the person using the application rather than for whoever changed it.
 *
 * Two kinds of line and no others: something you can now do, and something that was wrong and is
 * no longer. Nothing about the work itself -- no reviews, no counts of fixes, no notes on how the
 * application came to be the way it is. A reader opens this to find out what the application does
 * today, and every line that is not that is a line they have to read past.
 *
 * Newest first, one entry per day something shipped, and each date appears once. Add to the top of
 * this list as part of the change itself; an entry written weeks later is one nobody writes. The
 * dot beside What's new in Setup is on until the reader has seen the newest date here.
 */
export type NewsEntry = {
  /** The day it shipped. Also its identity, which is why no two entries share one. */
  date: string;
  /** What you can now do that you could not before. */
  added?: string[];
  /** What was wrong, and is not any more. */
  fixed?: string[];
};

export const WHATS_NEW: NewsEntry[] = [
  {
    date: "2026-11-08",
    added: [
      "Budget planner: a month can take last month's plan in one press, whether it is empty or already part-planned. The offer says how many lines it will copy and what they come to.",
      "Setting a budget line shows what that category was budgeted last month and what it actually cost, and either figure fills the amount in one press.",
      "Profile is laid out in groups — you, preferences, your data and your account — instead of one long list.",
      "What's new: this page, with a dot beside it in Setup until you have read the newest entry.",
      "An EMI can be moved to a different card, or taken off a card altogether, in which case it becomes an ordinary loan.",
      "An AutoPay can have its bank removed. It goes back to only reminding you, and stops paying itself."
    ],
    fixed: [
      "A fund moved from SIP back to lump sum now really does lose its schedule, and stops taking instalments.",
      "A credit balance on a card no longer reads as spending power: the available limit stops at the card's limit, and a card in credit is no longer counted as money you have.",
      "An archived card EMI still counts as owed on the card it sits on. It used to vanish, which quietly raised your net worth.",
      "A trip no longer counts spending that was refunded, so a fully refunded trip expense costs the trip nothing.",
      "A transaction can no longer be dated in the future. A mistyped year was quietly moving your balance.",
      "A transfer can only name another account when it is a self transfer or a card payment. On any other subtype the money left one bank and arrived nowhere.",
      "An AutoPay that cannot pay because its bank was archived now says so under Upcoming payments instead of going quiet.",
      "The theme control in Profile said the same thing whichever theme you were in. It now says which one it will switch to.",
      "The intro film no longer plays over the sign-in screen."
    ]
  },
  {
    date: "2026-11-07",
    added: [
      "The transactions list is grouped by day, with each heading carrying that day's count and net. Rows no longer repeat the date, and are about half as tall as they were.",
      "Editing anything opens a popup where you are, instead of sending you to a form at the top of the page. Closing it leaves the page exactly where it was.",
      "The add forms are folded away behind a single row until you want them.",
      "An AutoPay shows the bank it is taken from, beside its status."
    ],
    fixed: [
      "Loan and EMI interest paid before you started recording EMIs is now read from the loan's own schedule rather than the calendar. A loan entered with nothing yet repaid correctly shows no interest paid."
    ]
  },
  {
    date: "2026-11-01",
    added: [
      "Post Office schemes, fixed deposits and bonds credit their bank on schedule until their last paying day, and show interest earned rather than a paper gain.",
      "A mutual fund can be bought as a SIP: it takes its own instalment from a bank you choose, when the balance covers it.",
      "An AutoPay with a bank attached pays itself, and waits quietly when the balance is short.",
      "Paying a credit card asks which of that card's EMIs the payment settled, and updates both together.",
      "The Overview shows what you charged to your cards this month, EMIs excluded.",
      "Transactions can be deleted several at a time, and holdings can be grouped by the year or month you invested."
    ]
  }
];

/** Every line in an entry, in the order the page shows them. */
export function newsLines(entry: NewsEntry): string[] {
  return [...(entry.added ?? []), ...(entry.fixed ?? [])];
}

/**
 * Is there an entry the reader has not seen?
 *
 * `lastSeen` is the date of the newest entry they have read, or null on a first visit -- when
 * everything is unread, which is the honest answer rather than the quiet one.
 *
 * Compared for difference, not for being later. A newest entry whose date is corrected backwards
 * -- which happened once, to an entry dated a day ahead of the day it shipped -- is still an
 * entry the reader has not seen, and a rule that only looked forward would have hidden it.
 */
export function hasUnreadNews(entries: NewsEntry[], lastSeen: string | null): boolean {
  const newest = entries[0]?.date;
  if (!newest) {
    return false;
  }
  return newest !== lastSeen;
}

/** The date to remember once the page has been opened. */
export function newestNewsDate(entries: NewsEntry[]): string | null {
  return entries[0]?.date ?? null;
}
