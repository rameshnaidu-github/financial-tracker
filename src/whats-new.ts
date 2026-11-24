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
    date: "2026-11-24",
    fixed: [
      "The spending pie is on the Overview on a phone, with every category's share and amount beside it. It used to be folded away behind an \u201cOpen reports\u201d button, so the one chart that answers \u201cwhere did it go\u201d was two taps and another screen away on the device this app is built around. It is drawn smaller here than on a laptop so it costs a few hundred pixels rather than a third of the page.",
      "The five figures at the top of Overview read as two answers and three supporting figures. The fifth used to be stranded on a row of its own, and one label wrapped where its neighbour did not, which left the two amounts sitting at different heights with the rule between them cutting across. They line up now.",
      "Available cash and Credit card outstanding each answer with one figure. The notes under them \u2014 what sits on food cards, which card is near its limit \u2014 are gone; the food card is on Accounts and the cards are in the panel a little further down the same page.",
      "On a narrow phone, \u201cavailable\u201d was drawn across \u201cOpened at \u20b945,000\u201d on the Accounts cards, and \u201cover\u201d across \u201cNothing left this month\u201d on Budget. The figure and the word under it now wrap inside their own column.",
      "A long shop name is no longer cut short where the row has space for it. \u201cOutstanding adjustment\u201d and the like wrap onto a second line instead of trailing off, and chart legends do the same \u2014 a key that is cut does not say which slice it belongs to.",
      "The account filter shows which account you have picked. On a narrow phone it had been squeezed to a third of the width its own label needs, so the control that decides which money the whole page shows could not show which money it was showing. It takes a line of its own now."
    ]
  },
  {
    date: "2026-11-23",
    fixed: [
      "The figures on Overview, Budget Planner and Accounts show the actual amount \u2014 \u20b96,75,636, not \u20b96.76 L. The exact number used to be the hover tooltip, which a phone has no way to reach, so on the device this app is built around you could never see what you had.",
      "A summary tile is tinted by what it means rather than by where it sits. Four of them took a colour each from their position in the row, so a figure that wanted watching could come out reassuringly green for being fifth. Amber now marks what wants watching and green what is well.",
      "In simple mode on a phone, a transaction is one line: the shop, a tag and the amount. The three round buttons on every row have gone \u2014 tapping the row opens it, and refund and add-again are on the form that opens. The list is a third shorter.",
      "Record no longer wears the same green as the section you are in. Tapping Budget used to leave Budget and Record both green, so the one colour that says where you are was being used by something that is not a place. Record is amber.",
      "Type is a step smaller throughout simple mode on a phone, and tags are smaller again, so a tag reads as the footnote it is rather than competing with the shop and the amount. Nothing you tap got smaller.",
      "Transactions fits a phone. A row is two lines instead of three, the count of what you are looking at is stated once next to the More button rather than twice, and the totals put Export beside the heading instead of under the figures.",
      "A transaction's payment method no longer takes a line of its own in the phone ledger. It is still on the row's edit form and on a laptop; what you scan the list by is the shop and the amount."
    ]
  },
  {
    date: "2026-11-22",
    added: [
      "Record sits in the middle of the bar at the bottom of a phone, so logging a spend is one press from wherever you are instead of a trip to Transactions.",
      "Simple mode is the four sections you actually use day to day \u2014 Overview, Transactions, Budget Planner and Accounts. Reports and Investments are no longer part of it; turn the mode off in Profile to get everything back."
    ],
    fixed: [
      "The top of every screen on a phone was three rows deep \u2014 the page's name, the account filter, then a row of small circles \u2014 and took up a fifth of the screen before a single figure. It is one row now.",
      "Nothing you tap on a phone is smaller than your thumb any more. The tick that selects a transaction, the Edit buttons, the spending-mix rows and the chart switches were all below the size a thumb reliably hits.",
      "Budget Planner and Accounts open on what you came for. Both spent three quarters of a screen on four summary tiles stacked one per row; the tiles sit two across now, and a budget line is a third shorter.",
      "Overview fits a phone. It opens on the month's figures, and Cashflow is folded until you ask for it \u2014 it was repeating the money in and money out already shown at the top of the same page.",
      "Simple mode on a phone shows less, instead of only hiding sections. Overview leads with the two figures you open it for \u2014 available cash and card outstanding \u2014 and the month's spends, outflow and inflow sit quietly underneath them.",
      "The \u201cvs last month\u201d percentages are gone from Overview in simple mode on a phone. They were comparisons on a part-month, so a quiet month could read \u201c\u2191 2816%\u201d.",
      "Budget guardrails shows how much of the budget is used and how many categories are on track, watched or over. Unplanned spend and the uncategorised count moved off the phone's Overview in simple mode; they are reconciliation, and Budget Planner and Transactions have them.",
      "The Transactions page no longer stacks Add transaction and Import above the ledger on a phone. Record is in the bar at the bottom, and importing a spreadsheet is something you do at a desk.",
      "Paying a credit card bill that covers an EMI is one entry in the ledger again, not two. The bill still settles the instalment and the card's outstanding still comes down by the whole payment \u2014 the instalment is named on the bill itself rather than listed beside it as a second payment you never made.",
      "A card bill no longer asks how much of it goes to each EMI. It settles that month's instalment, or whatever is left of it if the EMI is nearly paid off, and shows you the figure.",
      "The search box is on Transactions, where the transactions are. It used to sit at the top of every screen, where it could not search what was in front of you."
    ]
  },
  {
    date: "2026-11-21",
    added: [
      "A credit card's outstanding can be corrected the same way a bank balance can, from the card's edit popup, for when the app and your statement disagree.",
      "This page opens on the newest release and keeps the rest folded away, instead of listing every change ever made."
    ],
    fixed: [
      "Anything added to the app after your account was created now reaches it. The EMI SubType and Adjust balance were missing for everyone except the first account."
    ]
  },
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
