/**
 * Which sections exist, and which of them the phone bar carries.
 *
 * Lives apart from App.tsx and imports no React, so the suite can read these answers directly
 * instead of a person reading them off a screen. The sidebar and the phone bar are rendered
 * from one call, which is what stops them drifting apart.
 */

export type Page =
  | "overview"
  | "transactions"
  | "reports"
  | "budgets"
  | "accounts"
  | "loans"
  | "investments"
  | "cardEmis"
  | "vacations"
  | "subscriptions"
  | "insurance"
  | "categories"
  | "whatsNew"
  | "faq"
  | "profile";

/** Every section, in the order the navigation lists them. */
export const NAV_ORDER: Page[] = [
  "overview",
  "transactions",
  "reports",
  "budgets",
  "subscriptions",
  "insurance",
  "vacations",
  "accounts",
  "loans",
  "investments",
  "cardEmis",
  "categories",
  "whatsNew",
  "faq",
  "profile"
];

/**
 * Simple mode: the four sections the application is cut down to when the switch in Profile is
 * on.
 *
 * The owner named these four. Reports and Investments were in this list and are not any more --
 * anyone running the mode loses them until they switch it off, which is what the switch says.
 *
 * Profile is not listed and is added by `navigationPagesFor` regardless, because the switch
 * lives on it: a mode that hid Profile could not be turned off.
 */
export const SIMPLE_MODE_PAGES: Page[] = ["overview", "transactions", "budgets", "accounts"];

/** What the phone bar carries when every section is available. */
export const MOBILE_PRIMARY_PAGES: Page[] = ["overview", "transactions", "budgets", "accounts"];

/**
 * Is simple mode on, according to what the server stored?
 *
 * "1" and nothing else. A value the application did not write -- an old row, a hand-edited
 * setting, a missing one -- means off, which is the state that hides nothing from anybody.
 */
export function simpleModeFromSettings(settings: Record<string, string> | undefined): boolean {
  return settings?.simple_mode === "1";
}

export function pageAllowedIn(page: Page, simpleMode: boolean): boolean {
  if (!simpleMode) {
    return true;
  }
  return SIMPLE_MODE_PAGES.includes(page) || page === "profile";
}

/**
 * What each navigation offers in this mode.
 *
 * `items` is every section that can be reached by navigating, `primary` is what the phone bar
 * shows as its own buttons, and `more` is everything else. Profile is deliberately not in
 * `primary`: it is reached from the avatar in the header, and the bar's room is worth more as a
 * way to record a spend.
 */
export function navigationPagesFor(simpleMode: boolean): {
  items: Page[];
  primary: Page[];
  more: Page[];
} {
  const items = simpleMode ? NAV_ORDER.filter((page) => pageAllowedIn(page, true)) : NAV_ORDER;
  const primary = (simpleMode ? SIMPLE_MODE_PAGES : MOBILE_PRIMARY_PAGES).filter((page) =>
    items.includes(page)
  );
  return { items, primary, more: items.filter((page) => !primary.includes(page)) };
}

/** The short name the phone bar gives a section. */
const mobileLabels: Record<Page, string> = {
  overview: "Home",
  transactions: "Txns",
  reports: "Reports",
  budgets: "Budget",
  accounts: "Accounts",
  loans: "Loan",
  investments: "Invest",
  cardEmis: "EMI",
  vacations: "Trips",
  subscriptions: "Auto",
  insurance: "Cover",
  categories: "Cats",
  whatsNew: "New",
  faq: "FAQ",
  profile: "Me"
};

export function mobileLabelFor(page: Page): string {
  return mobileLabels[page];
}
