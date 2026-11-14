import {
  ArrowDownUp,
  BarChart3,
  CalendarClock,
  CalendarDays,
  Check,
  CircleHelp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CreditCard,
  Download,
  Eye,
  EyeSlash,
  FileSpreadsheet,
  Home,
  Info,
  Landmark,
  LayoutGrid,
  Loader2,
  Archive,
  Megaphone,
  Moon,
  Pencil,
  PiggyBank,
  Plane,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sun,
  Tags,
  Target,
  Trash2,
  TrendingUp,
  Upload,
  UserCircle,
  Utensils,
  WalletCards,
  X
} from "./ui-icons";
import { FormEvent, type ReactNode, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Api, withoutCleared } from "./api";
import {
  MONTH_CHOICES,
  currentMonth,
  formatINR,
  formatINRCompact,
  formatINRWhole,
  formatMonth,
  EARLIEST_DATE,
  LATEST_DATE,
  formatDayHeading,
  groupHoldingsByPeriod,
  groupTransactionsByDay,
  formatShortDate,
  ordinalDay,
  mondayWeekRange,
  monthValue,
  outstandingSplit,
  parseAmountToPaise,
  parseSignedAmount,
  signedAmount,
  splitMonth,
  todayISO,
  yearChoices,
} from "./format";
import { IconGlyph } from "./icons";
import { WHATS_NEW, hasUnreadNews, newestNewsDate, type NewsEntry } from "./whats-new";
import { flushSync } from "react-dom";
import { prefersReducedMotion, useCountUp, useScrollReveal } from "./motion";
import { cashflowPartsFromTypes, INFLOW_BEHAVIORS, type CashflowPart } from "./report-cashflow";
import type {
  Account,
  AutopaySubscription,
  BackupStatus,
  Bootstrap,
  BudgetLine,
  BudgetPlan,
  BudgetScope,
  Category,
  CategoryType,
  CreateTransactionPayload,
  Investment,
  InvestmentType,
  PayoutFrequency,
  Vacation,
  Loan,
  LoanPaymentType,
  MonthlyReport,
  Overview,
  PaymentHistory,
  PaymentMethod,
  Subcategory,
  TaxonomyBehavior,
  Transaction,
  TransactionKind,
  TrendMode,
  TrendPoint,
  TrendReport,
  BudgetTrendReport,
  BudgetTrendPoint,
  UserProfile,
  WealthSummary,
  UpcomingPayments
} from "./types";
import {
  AUTOPAY_DURATION_MONTH_OPTIONS,
  AUTOPAY_SUBCATEGORY_ID,
  MUTUAL_FUNDS_SUBCATEGORY_ID,
  ADJUSTMENT_SUBCATEGORY_ID,
  ADJUSTMENT_TYPE_ID,
  EMI_SUBCATEGORY_ID,
  SELF_TRANSFER_SUBCATEGORY_ID,
  DEFAULT_HOLDING_GROUPING,
  HOLDING_GROUPINGS,
  HOLDING_GROUPING_IDS,
  INVESTMENT_TYPES,
  PAYOUT_FREQUENCIES,
  isPayoutInvestmentType,
  type HoldingGrouping,
  calculateEmiPaise
} from "../shared/finance";

// System Type that ties a refund to the purchase it came from (see shared/finance.ts).
const REFUND_TYPE_ID = "type_refund";

type Page = "overview" | "transactions" | "reports" | "budgets" | "accounts" | "loans" | "investments" | "cardEmis" | "vacations" | "subscriptions" | "categories" | "whatsNew" | "faq" | "profile";
type Theme = "light" | "dark";
type DonutSegment = {
  id: string;
  name: string;
  color: string;
  amountPaise: number;
  labelShare?: number;
  /** A ceiling this figure is measured against, such as a credit card's limit. */
  maxPaise?: number;
};
type NoticeAction = { label: string; onClick: () => void };
type NoticeOptions = { action?: NoticeAction; durationMs?: number };
type Navigate = (page: Page, filters?: Record<string, string | undefined>) => void;
type ConfirmRequest = {
  message: string;
  detail?: string;
  confirmLabel?: string;
  tone?: "danger" | "neutral";
  onConfirm: () => Promise<void> | void;
};

const emptyProfile: UserProfile = {
  name: "",
  email: "",
  age: ""
};

type NavGroup = "Daily" | "Plan" | "Own & owe" | "Setup";

// Grouped by how often people reach for them: everyday entry first, setup last.
const navItems: Array<{ page: Page; label: string; icon: typeof Home; group?: NavGroup }> = [
  { page: "overview", label: "Overview", icon: Home, group: "Daily" },
  { page: "transactions", label: "Transactions", icon: ArrowDownUp, group: "Daily" },
  { page: "reports", label: "Reports", icon: BarChart3, group: "Daily" },
  { page: "budgets", label: "Budget Planner", icon: Target, group: "Plan" },
  { page: "subscriptions", label: "AutoPay", icon: CalendarClock, group: "Plan" },
  { page: "vacations", label: "Vacations", icon: Plane, group: "Plan" },
  { page: "accounts", label: "Accounts", icon: WalletCards, group: "Own & owe" },
  { page: "loans", label: "Loans", icon: Landmark, group: "Own & owe" },
  { page: "investments", label: "Investments", icon: TrendingUp, group: "Own & owe" },
  { page: "cardEmis", label: "EMI", icon: CreditCard, group: "Own & owe" },
  { page: "categories", label: "Categories", icon: Tags, group: "Setup" },
  { page: "whatsNew", label: "What's new", icon: Megaphone, group: "Setup" },
  { page: "faq", label: "FAQ", icon: CircleHelp, group: "Setup" },
  { page: "profile", label: "Profile", icon: UserCircle }
];

/**
 * The sidebar's list of sections.
 *
 * Takes the sections rather than reading the whole list, so what it shows is a question about the
 * mode and not about this component -- and so the two navigations can be rendered against a mode
 * and read, rather than taken on trust.
 */
export function SidebarNav({
  items,
  activePage,
  newsUnread,
  badges,
  person,
  onNavigate
}: {
  items: typeof navItems;
  activePage: Page;
  newsUnread: boolean;
  /** How many things each section is waiting on. A page with nothing waiting is not in here. */
  badges?: Partial<Record<Page, number>>;
  person?: { name: string; email: string };
  onNavigate: (page: Page) => void;
}) {
  const groups = NAV_GROUPS.filter((group) => items.some((item) => item.group === group));
  return (
    <>
      <nav className="nav-list" aria-label="Main">
        {groups.map((group) => (
          <div className="nav-group" key={group} role="group" aria-labelledby={`nav-group-${group.replace(/\W+/g, "-")}`}>
            <span className="nav-group-label" id={`nav-group-${group.replace(/\W+/g, "-")}`}>
              {group}
            </span>
            {items
              .filter((item) => item.group === group)
              .map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.page}
                    className={`nav-item ${activePage === item.page ? "active" : ""}`}
                    aria-current={activePage === item.page ? "page" : undefined}
                    onClick={() => onNavigate(item.page)}
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                    {/* A count, where there is something to count. Never a zero: a badge reading
                        nought is a thing to read and dismiss on every single render. */}
                    {badges?.[item.page] ? (
                      <span className="nav-badge" aria-label={`${badges[item.page]} waiting`}>
                        {badges[item.page]}
                      </span>
                    ) : null}
                    {item.page === "whatsNew" && newsUnread && <span className="nav-dot" aria-label="Unread" />}
                  </button>
                );
              })}
          </div>
        ))}
      </nav>
      {/* The person sits below the list so a short window scrolls the sections past them rather
          than scrolling them away. A standing "safe to spend" figure used to sit above them;
          the owner asked for it gone. */}
      <button
        className={`nav-item profile-nav-item ${activePage === "profile" ? "active" : ""}`}
        aria-current={activePage === "profile" ? "page" : undefined}
        onClick={() => onNavigate("profile")}
      >
        {person ? (
          <>
            <span className="sidebar-avatar" aria-hidden="true">
              {initialsOf(person.name, person.email)}
            </span>
            <span className="sidebar-person">
              <strong>{person.name || "Your profile"}</strong>
              {person.email ? <small>{person.email}</small> : null}
            </span>
          </>
        ) : (
          <>
            <UserCircle size={18} />
            <span>Profile</span>
          </>
        )}
      </button>
    </>
  );
}

/**
 * One or two letters to stand for a person: their initials where they have given a name, the
 * first letter of their address where they have not, and a neutral mark where there is neither.
 * Never a generic avatar glyph -- an initial says which account this is, and a silhouette does
 * not.
 */
export function initialsOf(name: string, email: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  const local = email.trim();
  return local ? local[0].toUpperCase() : "\u00b7";
}

/**
 * The bell in the top bar, and what is behind it.
 *
 * Lit only when something is actually waiting, carrying the count rather than a dot, and opening
 * a list in which every line goes somewhere the thing can be dealt with. With nothing waiting it
 * is still pressable and still says so -- a control that disappears when there is no news leaves
 * you wondering whether it was ever there.
 *
 * It closes on Escape, on a click outside it, and on going somewhere, which is every way out a
 * small popover needs. It is not a dialog: it traps nothing and holds nothing still behind it.
 */
export function AttentionMenu({ items, onGo }: { items: AttentionItem[]; onGo: (page: Page) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  const listId = useId();
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);

  /*
   * Where the panel goes, measured from the button rather than positioned against it.
   *
   * It used to sit inside this wrapper, absolutely positioned, and the page drew straight over
   * it: every child of the content area carries `animation: rise ... both`, whose fill leaves a
   * permanent transform behind, and a transformed element is a stacking context of its own. The
   * page's sections therefore painted above anything in the top bar, whatever z-index it asked
   * for -- the owner's screenshot has a summary card and an attention banner cutting through
   * the middle of the list.
   *
   * So the panel is portalled onto the body, out of every one of those contexts, and anchored
   * to the button's rectangle instead. Re-measured on scroll and resize, because a fixed thing
   * anchored to a moving button drifts away from it otherwise.
   */
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const button = wrap.current?.querySelector("button");
      if (!button) return;
      const rect = button.getBoundingClientRect();
      setAt({ top: Math.round(rect.bottom + 8), right: Math.round(window.innerWidth - rect.right) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      // The panel is no longer inside the wrapper, so closing on an outside click has to ask
      // both of them whether the click was theirs.
      if (wrap.current?.contains(target) || panel.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  const count = items.length;
  return (
    <div className="attention-wrap" ref={wrap}>
      <button
        type="button"
        className={`icon-button attention-button${count > 0 ? " has-items" : ""}`}
        aria-label={count === 0 ? "Nothing needs attention" : `${count} ${count === 1 ? "thing needs" : "things need"} attention`}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
      >
        <CircleAlert size={17} />
        {count > 0 && <span className="attention-count" aria-hidden="true">{count}</span>}
      </button>
      {open && at && portalled(
        <div
          className="attention-panel"
          id={listId}
          role="group"
          aria-label="Needs attention"
          ref={panel}
          style={{ top: at.top, right: at.right }}
        >
          {count === 0 ? (
            <p className="attention-empty">Nothing needs attention.</p>
          ) : (
            <ul className="attention-list">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`attention-item tone-${item.tone}`}
                    onClick={() => {
                      setOpen(false);
                      onGo(item.page);
                    }}
                  >
                    <strong>{item.label}</strong>
                    <small>{item.detail}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Onto the body, where no page section's stacking context can paint over it. */
function portalled(content: React.ReactNode) {
  return typeof document === "undefined" ? content : createPortal(content, document.body);
}

/** What sits behind More on a phone, when there is more than one of them. */
export function MoreSheet({
  pages,
  activePage,
  onNavigate,
  onClose
}: {
  pages: Page[];
  activePage: Page;
  onNavigate: (page: Page) => void;
  onClose: () => void;
}) {
  return (
    <div className="mobile-more-backdrop" onClick={onClose}>
      <div
        className="mobile-more-sheet"
        id="mobile-more-sheet"
        role="dialog"
        aria-label="More pages"
        onClick={(event) => event.stopPropagation()}
      >
        {pages.map((page) => {
          const item = navItems.find((candidate) => candidate.page === page);
          if (!item) return null;
          const Icon = item.icon;
          return (
            <button
              key={page}
              type="button"
              className={activePage === page ? "active" : ""}
              onClick={() => {
                onClose();
                onNavigate(page);
              }}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The phone bar.
 *
 * `more` holding exactly one section is shown as that section rather than as a More button: in
 * simple mode the only thing not on the bar is Profile, and hiding one row behind a sheet asks
 * for two presses where one would do.
 */
export function MobileNav({
  primary,
  more,
  activePage,
  moreOpen,
  onToggleMore,
  onNavigate
}: {
  primary: Page[];
  more: Page[];
  activePage: Page;
  moreOpen: boolean;
  onToggleMore: () => void;
  onNavigate: (page: Page) => void;
}) {
  const soleExtra = more.length === 1 ? more[0] : null;
  const SoleIcon = soleExtra ? navItems.find((item) => item.page === soleExtra)?.icon : null;
  return (
    <nav className="mobile-nav" aria-label="Main">
      {primary.map((page) => {
        const item = navItems.find((candidate) => candidate.page === page);
        if (!item) return null;
        const Icon = item.icon;
        return (
          <button
            key={page}
            className={activePage === page && !moreOpen ? "active" : ""}
            onClick={() => onNavigate(page)}
          >
            <Icon size={19} />
            <span>{mobileLabels[page]}</span>
          </button>
        );
      })}
      {soleExtra && SoleIcon ? (
        <button
          key={soleExtra}
          className={activePage === soleExtra ? "active" : ""}
          onClick={() => onNavigate(soleExtra)}
        >
          <SoleIcon size={19} />
          <span>{mobileLabels[soleExtra]}</span>
        </button>
      ) : (
        <button
          type="button"
          className={moreOpen || !primary.includes(activePage) ? "active" : ""}
          aria-expanded={moreOpen}
          aria-controls="mobile-more-sheet"
          onClick={onToggleMore}
        >
          <LayoutGrid size={19} />
          <span>{primary.includes(activePage) ? "More" : mobileLabels[activePage]}</span>
        </button>
      )}
    </nav>
  );
}

/**
 * Page changes animate through the View Transitions API where the browser has it. Without it,
 * or when the person asks for less motion, the page simply swaps.
 *
 * `direction` says which way the navigation went down the sidebar, so the outgoing page leaves
 * the way the incoming one arrives: go further down the list and the new page rises from below,
 * go back up and it drops from above. A cross-fade alone said a page had changed; this says
 * which way you moved. The attribute is read by the ::view-transition rules in theme.css and is
 * cleared when the transition finishes, so a swap with no direction still cross-fades.
 */
function withPageTransition(update: () => void, direction: "forward" | "back" | "none" = "none") {
  const doc = document as Document & {
    startViewTransition?: (callback: () => void) => {
      finished?: Promise<void>;
      ready?: Promise<void>;
      updateCallbackDone?: Promise<void>;
    };
  };
  // A hidden page cannot capture the snapshots a transition needs, so it would only throw.
  if (typeof doc.startViewTransition !== "function" || prefersReducedMotion() || document.hidden) {
    update();
    return;
  }
  if (direction !== "none") {
    document.documentElement.dataset.pageDirection = direction;
  }
  /*
   * The browser decides when to run this callback: it waits until it can take the "before"
   * snapshot. A page that is not being painted -- which a browser will still report as visible --
   * may never reach that point, and then the page simply never changes, because the state update
   * is inside the callback. The floor below applies the update directly if the transition has
   * not done it shortly; `update` only sets the page it was given, so applying it twice settles
   * on the same place.
   */
  let applied = false;
  const apply = () => {
    if (applied) return;
    applied = true;
    update();
  };
  const transition = doc.startViewTransition(() => flushSync(apply));
  const floor = window.setTimeout(apply, 400);
  const clearDirection = () => {
    window.clearTimeout(floor);
    delete document.documentElement.dataset.pageDirection;
  };
  transition?.finished?.then(clearDirection, clearDirection);
  transition?.updateCallbackDone?.then(() => window.clearTimeout(floor), () => window.clearTimeout(floor));
  // An interrupted or skipped transition rejects all three of these. The page has already changed
  // by then, so none of them is an error worth surfacing; leaving any uncaught logs to the console.
  transition?.finished?.catch(() => {});
  transition?.ready?.catch(() => {});
  transition?.updateCallbackDone?.catch(() => {});
}

const NAV_GROUPS: NavGroup[] = ["Daily", "Plan", "Own & owe", "Setup"];

/* Pages that draw their own header. The shell prints the page's name in the top bar for every
   other one; these say it in their own body instead, and must not be told twice. */
/*
 * Pages that draw their own header -- a title on the left and the way to add on the right -- so
 * the shell's topbar does not name them a second time. Every section that can add something is
 * on this list now; the inline fold-out form each of them used to lead with is gone.
 */
const PAGES_WITH_OWN_HEADER: Page[] = [
  "budgets",
  "accounts",
  "transactions",
  "loans",
  "cardEmis",
  "investments",
  "vacations",
  "subscriptions",
  "categories"
];
const THEME_KEY = "finance-theme";
const INTRO_ON_LAUNCH_KEY = "finance-intro-on-launch";

function storedTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return value === "dark" || value === "light" ? value : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  if (typeof window.matchMedia !== "function") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Whether opening the app should play the intro. On by default, so a browser that refuses
 * storage still gets the film rather than silently losing it; "0" is the only way off.
 */
function shouldPlayIntroOnLaunch(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(INTRO_ON_LAUNCH_KEY) !== "0";
  } catch {
    return true;
  }
}

// The phone bar keeps the four daily destinations; everything else lives under "More".
const MOBILE_PRIMARY_PAGES: Page[] = ["overview", "transactions", "reports"];

/**
 * Simple mode: the five sections the application is cut down to when the switch in Profile is on.
 *
 * Profile is not listed here and is added by `navigationFor` regardless, because the switch lives
 * on it: a mode that hid Profile could not be turned off.
 */
export const SIMPLE_MODE_PAGES: Page[] = ["overview", "transactions", "accounts", "reports", "investments"];

/*
 * Simple mode needs no exception any more. Recording used to live on a Weekly Entry page that was
 * not one of the five sections, so the mode had to keep it reachable through a Record button.
 * The form is now a dialog on Transactions, which is one of the five, so the mode is exactly its
 * list and nothing beside it.
 */
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
 * One answer for both navigations, so the sidebar and the phone bar cannot drift apart: `items`
 * is every section that can be reached by navigating, `primary` is what the phone bar shows as
 * its own buttons, and `more` is what sits behind it. When `more` holds a single section the bar
 * shows it directly instead -- a sheet that opens on one row is a door to a cupboard.
 */
export function navigationFor(simpleMode: boolean) {
  const items = simpleMode
    ? navItems.filter((item) => SIMPLE_MODE_PAGES.includes(item.page) || item.page === "profile")
    : navItems;
  const primary = simpleMode ? SIMPLE_MODE_PAGES : MOBILE_PRIMARY_PAGES;
  return {
    items,
    primary,
    more: items.filter((item) => !primary.includes(item.page)).map((item) => item.page)
  };
}

const mobileLabels: Record<Page, string> = {
  overview: "Home",
  transactions: "Txns",
  reports: "Reports",
  budgets: "Bdgt",
  accounts: "Accts",
  loans: "Loan",
  investments: "Invest",
  cardEmis: "EMI",
  vacations: "Trips",
  subscriptions: "Auto",
  categories: "Cats",
  whatsNew: "New",
  faq: "FAQ",
  profile: "Me"
};

/** The short name the phone bar gives a section. */
export function mobileLabelFor(page: Page): string {
  return mobileLabels[page];
}

const pagePaths: Record<Page, string> = {
  overview: "/overview",
  transactions: "/transactions",
  reports: "/reports",
  budgets: "/budgets",
  accounts: "/accounts",
  loans: "/loans",
  investments: "/investments",
  cardEmis: "/emi",
  vacations: "/vacations",
  subscriptions: "/subscriptions",
  categories: "/categories",
  whatsNew: "/whats-new",
  faq: "/faq",
  profile: "/profile"
};

// The EMI page was called Card EMIs and lived at /card-emis. A bookmark from then still opens it.
const legacyPagePaths: Record<string, Page> = { "/card-emis": "cardEmis" };

function pageFromPath(pathname: string): Page {
  const match = (Object.entries(pagePaths) as Array<[Page, string]>).find(([, path]) => path === pathname);
  return match?.[0] ?? legacyPagePaths[pathname] ?? "overview";
}

const iconOptions = [
  "shopping-basket",
  "utensils",
  "ticket",
  "film",
  "car",
  "receipt",
  "shopping-bag",
  "heart-pulse",
  "plane",
  "wallet",
  "credit-card",
  "arrow-down-circle",
  "arrow-left-right",
  "rotate-ccw",
  "circle-question",
  "home",
  "book-open",
  "coffee",
  "gift",
  "briefcase",
  "landmark",
  "trending-up",
  "calendar-clock"
];

const colorOptions = [
  "#16a34a",
  "#f97316",
  "#7c3aed",
  "#dc2626",
  "#2563eb",
  "#0f766e",
  "#db2777",
  "#10b981",
  "#0891b2",
  "#059669",
  "#4f46e5",
  "#d97706",
  "#ea580c",
  "#64748b",
  "#0284c7",
  "#be123c"
];

const UNDO_WINDOW_MS = 8000;
const INITIAL_TRANSACTION_LIMIT = 12;
const TRANSACTION_PAGE_SIZE = 10;


/**
 * Everything the application does needs a person, so nothing is rendered until there is one.
 * There is no sign-up here on purpose: D5 is invite only, and accounts are made with
 * `node server/account.ts create <email>`.
 */
function SignInScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordShown, setPasswordShown] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await Api.signIn(email.trim(), password);
      onSignedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sign-in-page">
      <div className="panel sign-in-panel">
        <h1>Financial Tracker</h1>
        <p className="sign-in-lead">Sign in to see your money.</p>
        <form className="sign-in-form" onSubmit={submit}>
          <label className="control-field">
            <span className="control-label">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              required
              autoFocus
            />
          </label>
          <label className="control-field password-field">
            <span className="control-label">Password</span>
            <input
              type={passwordShown ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
            {/* A button, not a checkbox: it does something rather than recording a preference, and
                it must not submit the form it sits inside. aria-pressed carries the state to a
                screen reader, which cannot see the icon change. */}
            <button
              type="button"
              className="password-reveal"
              onClick={() => setPasswordShown((shown) => !shown)}
              aria-pressed={passwordShown}
              aria-label={passwordShown ? "Hide password" : "Show password"}
              title={passwordShown ? "Hide password" : "Show password"}
            >
              {passwordShown ? <EyeSlash size={18} /> : <Eye size={18} />}
            </button>
          </label>
          {error && (
            <p className="sign-in-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="sign-in-submit" disabled={busy || !email || !password}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);

  /**
   * The whole application as one document, for printing or saving as a PDF.
   *
   * Every page is mounted at once only while this is true. Mounting all thirteen permanently
   * would mean thirteen sets of requests on every visit for a button most people never press.
   *
   * The pages fetch their own data, so there is a wait before the dialog opens -- a print dialog
   * freezes the page as it finds it, and without the wait the report would be a stack of loading
   * states. afterprint puts the application back whether the reader saved or cancelled.
   */
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!printing) return undefined;
    const done = () => setPrinting(false);
    const timer = window.setTimeout(() => window.print(), 1400);
    window.addEventListener("afterprint", done);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", done);
    };
  }, [printing]);
  // Null until the first request answers: rendering the sign-in screen before knowing would
  // flash it at somebody who is already signed in.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [activePage, setActivePage] = useState<Page>(() =>
    typeof window === "undefined" ? "overview" : pageFromPath(window.location.pathname)
  );
  /* Where the page was before this navigation, for working out which way it moved. A ref rather
     than the state value: `navigate` is a stable callback and must not be rebuilt on every page
     change, which closing over `activePage` would force. */
  const activePageRef = useRef(activePage);
  useEffect(() => {
    activePageRef.current = activePage;
  }, [activePage]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ message: string; action?: NoticeAction } | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const contentRef = useRef<HTMLElement>(null);
  useScrollReveal(contentRef, activePage);
  const noticeTimer = useRef<number | undefined>(undefined);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [profileDraft, setProfileDraft] = useState<UserProfile>(emptyProfile);
  const [profileSaving, setProfileSaving] = useState(false);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  // Whether this person owns the installation. null until asked, so the Profile page shows neither
  // the owner's rows nor their absence while the answer is still in flight.
  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  // The intro plays on every open of the app, whatever page was asked for. Decided here,
  // synchronously at mount, so it is the first thing painted rather than something that
  // waits for the app's data; the owner can turn it off in Profile.
  const [introOnLaunch, setIntroOnLaunch] = useState(shouldPlayIntroOnLaunch);
  const [introOpen, setIntroOpen] = useState(() => shouldPlayIntroOnLaunch());

  // Follows the system light/dark setting until the person picks one on Profile.
  const [theme, setTheme] = useState<Theme>(() => (typeof window === "undefined" ? "light" : storedTheme() ?? systemTheme()));

  const loadBootstrap = useCallback(async () => {
    setError("");
    const data = await Api.bootstrap();
    setBootstrap(data);
  }, []);

  useEffect(() => {
    loadBootstrap()
      .catch((err: Error & { notSignedIn?: boolean }) => {
        // Not being signed in is not an error to report; it is a screen to show.
        if (err.notSignedIn) setSignedIn(false);
        else setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [loadBootstrap, refreshKey]);

  // Before paint, so a dark-mode visitor never sees a light frame.
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const follow = () => {
      if (!storedTheme()) setTheme(systemTheme());
    };
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, []);

  // Each page names its own browser tab, so history and open tabs are recognisable.
  useEffect(() => {
    const label = navItems.find((item) => item.page === activePage)?.label;
    document.title = label ? `${label} · Financial Tracker` : "Financial Tracker";
  }, [activePage]);

  useEffect(() => {
    const onPopState = () => withPageTransition(() => setActivePage(pageFromPath(window.location.pathname)));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((page: Page, filters?: Record<string, string | undefined>) => {
    // Optional filters travel in the URL so a page can open pre-filtered (e.g. drill-down).
    const params = new URLSearchParams();
    Object.entries(filters ?? {}).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    const target = params.toString() ? `${pagePaths[page]}?${params}` : pagePaths[page];
    if (`${window.location.pathname}${window.location.search}` !== target) {
      window.history.pushState({}, "", target);
    }
    /* Which way down the sidebar this went. A page outside the navigation -- the profile, say --
       has no place in that order, so it gets no direction and cross-fades instead. Read from a
       ref rather than from state: a state updater must stay free of side effects, and React
       calls it twice in development to prove it. */
    const from = navItems.findIndex((item) => item.page === activePageRef.current);
    const to = navItems.findIndex((item) => item.page === page);
    const direction = from < 0 || to < 0 || from === to ? "none" : to > from ? "forward" : "back";
    activePageRef.current = page;
    withPageTransition(() => setActivePage(page), direction);
  }, []);

  useEffect(() => {
    let isMounted = true;
    Api.me()
      .then((who) => {
        if (!isMounted) return;
        setIsOwner(Boolean(who.isOwner));
      })
      .catch(() => {
        if (isMounted) setIsOwner(false);
      });
    return () => {
      isMounted = false;
    };
  }, [refreshKey]);

  useEffect(() => {
    // The backup is the owner's. Asking for it as anybody else earns a 403, so don't ask: a
    // console full of refusals is how a real problem goes unnoticed.
    if (isOwner !== true) {
      setBackupStatus(null);
      return undefined;
    }
    let isMounted = true;

    async function loadBackupStatus() {
      try {
        const status = await Api.backupStatus();
        if (isMounted) setBackupStatus(status);
      } catch {
        if (isMounted) setBackupStatus(null);
      }
    }

    loadBackupStatus();
    const timer = window.setInterval(loadBackupStatus, 60_000);
    return () => {
      isMounted = false;
      window.clearInterval(timer);
    };
  }, [isOwner]);

  const refresh = useCallback(async () => {
    await loadBootstrap();
    setRefreshKey((key) => key + 1);
  }, [loadBootstrap]);

  const showNotice = useCallback((message: string, options: NoticeOptions = {}) => {
    // Cancel the previous timer so a new message is never cut short by an old one.
    window.clearTimeout(noticeTimer.current);
    setNotice({ message, action: options.action });
    noticeTimer.current = window.setTimeout(() => setNotice(null), options.durationMs ?? 3200);
  }, []);

  const dismissNotice = useCallback(() => {
    window.clearTimeout(noticeTimer.current);
    setNotice(null);
  }, []);

  const requestConfirm = useCallback((request: ConfirmRequest) => {
    setConfirmRequest(request);
  }, []);

  const saveProfile = useCallback(async () => {
    setProfileSaving(true);
    try {
      const updated = await Api.updateProfile(profileDraft);
      setBootstrap((current) =>
        current
          ? {
              ...current,
              profile: updated,
              settings: {
                ...current.settings,
                profile_name: updated.name,
                profile_email: updated.email,
                profile_age: updated.age
              }
            }
          : current
      );
      setProfileDraft(updated);
      showNotice("Profile saved.");
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Could not save profile.");
    } finally {
      setProfileSaving(false);
    }
  }, [profileDraft, showNotice]);

  const saveCardAlert = useCallback(
    async (percent: number) => {
      try {
        const settings = await Api.updateSettings({ cardUtilizationAlertPercent: percent });
        setBootstrap((current) => (current ? { ...current, settings } : current));
        showNotice("Card alert threshold saved.");
      } catch (err) {
        showNotice(err instanceof Error ? err.message : "Could not save the setting.");
      }
    },
    [showNotice]
  );

  const accounts = bootstrap?.accounts ?? [];
  const loans = bootstrap?.loans ?? [];
  const cardEmis = bootstrap?.cardEmis ?? [];
  const subscriptions = bootstrap?.subscriptions ?? [];
  const investments = bootstrap?.investments ?? [];
  const vacations = bootstrap?.vacations ?? [];
  const categoryTypes = bootstrap?.categoryTypes ?? [];
  const categories = flattenSubcategories(categoryTypes);
  const profile = bootstrap?.profile ?? emptyProfile;
  const holdingGrouping = (HOLDING_GROUPING_IDS.includes(bootstrap?.settings?.holding_grouping ?? "")
    ? bootstrap?.settings?.holding_grouping
    : DEFAULT_HOLDING_GROUPING) as HoldingGrouping;

  const saveHoldingGrouping = useCallback(
    async (next: HoldingGrouping) => {
      try {
        const settings = await Api.updateSettings({ holdingGrouping: next });
        setBootstrap((current) => (current ? { ...current, settings } : current));
        showNotice("Holdings grouping saved.");
      } catch (err) {
        showNotice(err instanceof Error ? err.message : "Could not save the setting.");
      }
    },
    [showNotice]
  );

  const simpleMode = simpleModeFromSettings(bootstrap?.settings);
  const navigationModel = navigationFor(simpleMode);

  /*
   * The sidebar's standing figure and the top bar's attention list both need the month as the
   * server sees it, and the shell outlives every page, so it holds that one payload itself
   * rather than each page handing it upward. It is refetched on the same key a page refetches
   * on, so recording something moves the figure above the fold at the same moment it moves the
   * page. A failure here leaves the figure absent rather than wrong: the sidebar shows nothing
   * where it would have been, and nothing else on screen depends on it.
   */
  const [shellOverview, setShellOverview] = useState<Overview | null>(null);
  useEffect(() => {
    /* `signedIn` is three-valued, and null is the ordinary case: it means nobody has been asked
       to sign in because a session was already there, which is every visit after the first. Only
       an explicit false is "not signed in" -- the shell itself renders on null too. Reading it as
       a boolean is why the first version of this never fetched anything at all. */
    if (signedIn === false) return;
    let cancelled = false;
    Api.overview()
      .then((next) => {
        if (!cancelled) setShellOverview(next);
      })
      .catch(() => {
        if (!cancelled) setShellOverview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn, refreshKey]);

  /* What each section is waiting on. Only counts the application can account for, and only
     where the count is not zero -- SidebarNav drops a falsy one rather than drawing a nought. */
  const sidebarBadges: Partial<Record<Page, number>> = shellOverview
    ? { transactions: shellOverview.summary.uncategorizedCount }
    : {};

  const [search, setSearch] = useState("");

  /* One way to turn the theme over, now that two places offer it: the switch on the profile page
     and the one in the top bar. Written here rather than twice, so they cannot drift over
     whether the choice is remembered. */
  const toggleTheme = useCallback(() => {
    setTheme((value) => {
      const next = value === "dark" ? "light" : "dark";
      try {
        window.localStorage.setItem(THEME_KEY, next);
      } catch {
        // Private windows can refuse storage; the choice still applies for this visit.
      }
      return next;
    });
  }, []);

  const canOpen = useCallback((page: Page) => pageAllowedIn(page, simpleMode), [simpleMode]);

  const saveSimpleMode = useCallback(
    async (next: boolean) => {
      try {
        const settings = await Api.updateSettings({ simpleMode: next });
        setBootstrap((current) => (current ? { ...current, settings } : current));
        showNotice(
          next
            ? "Simple mode on. Five sections, everywhere. Turn it off here to get the rest back."
            : "Simple mode off. Every section is back."
        );
      } catch (err) {
        showNotice(err instanceof Error ? err.message : "Could not save the setting.");
      }
    },
    [showNotice]
  );

  const cardAlertPercent = (() => {
    const parsed = Number(bootstrap?.settings?.card_utilization_alert_percent ?? "30");
    return Number.isFinite(parsed) && parsed >= 1 && parsed <= 100 ? Math.round(parsed) : 30;
  })();
  const activeAccounts = accounts.filter((account) => !account.isArchived);

  /* What needs attention, worked out from what the shell already holds. The list is the rule's
     output: nothing qualifying means an empty list, and the control says so rather than hiding. */
  const attention = attentionItems({
    accounts: activeAccounts,
    loans: [...loans, ...cardEmis],
    subscriptions,
    uncategorizedCount: shellOverview?.summary.uncategorizedCount ?? 0,
    cardAlertPercent,
    today: todayISO()
  });


  // A failed boot must not sit behind a film: if the app cannot load, show why at once.
  useEffect(() => {
    if (error) setIntroOpen(false);
  }, [error]);

  const closeIntro = useCallback(() => {
    setIntroOpen(false);
  }, []);

  const toggleIntroOnLaunch = useCallback(() => {
    setIntroOnLaunch((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(INTRO_ON_LAUNCH_KEY, next ? "1" : "0");
      } catch {
        // Nothing to remember it with; the preference lasts for this session only.
      }
      return next;
    });
  }, []);

  const selectedAccount = accounts.find((account) => account.id === selectedAccountId);
  const showAccountFilter =
    activePage !== "accounts" &&
    activePage !== "budgets" &&
    activePage !== "loans" &&
    activePage !== "investments" &&
    activePage !== "vacations" &&
    activePage !== "subscriptions" &&
    activePage !== "categories" &&
    activePage !== "whatsNew" &&
    activePage !== "faq" &&
    activePage !== "profile";

  /* Whether there is an entry on What's new that has not been read here. Kept per browser:
     "have I read this" is a question about this device, not about the account. */
  const [newsSeen, setNewsSeen] = useState<string | null>(() => storedNewsSeen());
  const newsUnread = hasUnreadNews(WHATS_NEW, newsSeen);
  const markNewsRead = useCallback(() => {
    const newest = newestNewsDate(WHATS_NEW);
    if (!newest) return;
    setNewsSeen(newest);
    try {
      window.localStorage.setItem(NEWS_SEEN_KEY, newest);
    } catch {
      // Nothing to do: the mark simply stays on in a browser that keeps nothing.
    }
  }, []);

  useEffect(() => {
    setProfileDraft(profile);
  }, [profile]);

  /* A bookmark, a shared link or the back button can land on a section simple mode hides. Rather
     than a title with no page under it, the app moves to Overview -- which the mode always has --
     and says what happened and how to undo it. Waits for the data: until then nothing is known
     about the mode, and redirecting on a guess would bounce the page people actually asked for. */
  useEffect(() => {
    if (!bootstrap || pageAllowedIn(activePage, simpleMode)) {
      return;
    }
    const name = navItems.find((item) => item.page === activePage)?.label ?? "That section";
    navigate("overview");
    showNotice(`${name} is hidden while simple mode is on. Turn it off in Profile to get it back.`);
  }, [activePage, bootstrap, navigate, showNotice, simpleMode]);

  useEffect(() => {
    if (selectedAccountId && !activeAccounts.some((account) => account.id === selectedAccountId)) {
      setSelectedAccountId("");
    }
  }, [activeAccounts, selectedAccountId]);

  // The film covers the boot, so the data loads behind it and there is nothing to wait for
  // when it ends. A spinner under the overlay would only be a flash on the handoff, so the
  // loading screen stands down while the intro is up.
  if (loading) {
    return (
      <>
        {introOpen && <IntroVideo onClose={closeIntro} />}
        {!introOpen && <FullScreenState icon={<Loader2 className="spin" />} title="Loading Financial Tracker" />}
      </>
    );
  }

  if (signedIn === false) {
    // No film in front of the sign-in. It is a tour of somebody's money, shown to whoever opens
    // the address; it belongs behind the password, not in front of it.
    return (
      <>
        <SignInScreen
          onSignedIn={() => {
            setSignedIn(true);
            setLoading(true);
            setRefreshKey((key) => key + 1);
          }}
        />
      </>
    );
  }

  if (error) {
    return (
      <>
        {introOpen && <IntroVideo onClose={closeIntro} />}
        <FullScreenState icon={<CircleAlert />} title="Could not load app" detail={error} />
      </>
    );
  }

  if (!bootstrap || activeAccounts.length === 0) {
    return (
      <>
        {introOpen && <IntroVideo onClose={closeIntro} />}
        <SetupPage
        categories={categories}
        onCreated={async () => {
          await refresh();
          navigate("overview");
          showNotice("First account added. Welcome in.");
        }}
        />
      </>
    );
  }

  /**
   * One page, by name.
   *
   * This was thirteen `activePage === x &&` branches. The report prints every page, which
   * means something has to be able to render a page that is not the one being looked at, and
   * a condition on the current page cannot do that. The bodies are unchanged.
   */
  const renderPage = (page: Page) => {
    switch (page) {
      case "overview":
        return (
        <OverviewPage
                      selectedAccountId={selectedAccountId}
                      selectedAccount={selectedAccount}
                      refreshKey={refreshKey}
                      onNavigate={navigate}
                      canOpen={canOpen}
                    />
        );
      case "transactions":
        return (
        <TransactionsPage
                      selectedAccountId={selectedAccountId}
                      accounts={activeAccounts}
                      loans={loans.filter((loan) => !loan.isArchived)}
                      cardEmis={cardEmis.filter((emi) => !emi.isArchived)}
                      subscriptions={subscriptions}
                      mutualFunds={investments.filter((investment) => investment.type === "mutual_funds")}
                      vacations={vacations.filter((vacation) => !vacation.isArchived)}
                      categoryTypes={categoryTypes}
                      refresh={refresh}
                      refreshKey={refreshKey}
                      showNotice={showNotice}
                      requestConfirm={requestConfirm}
                      onAccountSelect={setSelectedAccountId}
                    />
        );
      case "reports":
        return (
        <ReportsPage
                      selectedAccountId={selectedAccountId}
                      categoryTypes={categoryTypes}
                      refreshKey={refreshKey}
                      onNavigate={navigate}
                    />
        );
      case "budgets":
        return (
        <BudgetPlannerPage
                      refreshKey={refreshKey}
                      showNotice={showNotice}
                      requestConfirm={requestConfirm}
                    />
        );
      case "accounts":
        return (
        <AccountsPage
                      accounts={accounts}
                      cardAlertPercent={cardAlertPercent}
                      refresh={refresh}
                      showNotice={showNotice}
                      requestConfirm={requestConfirm}
                    />
        );
      case "loans":
        return (
        <LoansPage
                      loans={loans}
                      categoryTypes={categoryTypes}
                      refresh={refresh}
                      showNotice={showNotice}
                      requestConfirm={requestConfirm}
                    />
        );
      case "investments":
        return (
        <InvestmentsPage
                      investments={investments}
                      accounts={activeAccounts}
                      grouping={holdingGrouping}
                      refresh={refresh}
                      showNotice={showNotice}
                      requestConfirm={requestConfirm}
                    />
        );
      case "cardEmis":
        return (
          <LoansPage
            loans={cardEmis}
            categoryTypes={categoryTypes}
            cards={activeAccounts.filter((account) => account.type === "credit_card")}
            refresh={refresh}
            showNotice={showNotice}
            requestConfirm={requestConfirm}
          />
        );
      case "vacations":
        return (
        <VacationsPage
                      vacations={vacations}
                      refresh={refresh}
                      showNotice={showNotice}
                      requestConfirm={requestConfirm}
                    />
        );
      case "subscriptions":
        return (
        <SubscriptionsPage
                      subscriptions={subscriptions}
                      accounts={activeAccounts}
                      refresh={refresh}
                      showNotice={showNotice}
                      requestConfirm={requestConfirm}
                    />
        );
      case "categories":
        return (
        <CategoriesPage
                      categoryTypes={categoryTypes}
                      refresh={refresh}
                      showNotice={showNotice}
                      requestConfirm={requestConfirm}
                    />
        );
      case "whatsNew":
        return (
        <WhatsNewPage entries={WHATS_NEW} onRead={markNewsRead} />
        );
      case "faq":
        return (
        <FaqPage />
        );
      case "profile":
        return (
        <ProfilePage
                      onSignOut={() => {
                        void Api.signOut()
                          .catch(() => undefined)
                          .finally(() => {
                            setSignedIn(false);
                            setBootstrap(null);
                          });
                      }}
                      onPlayIntro={() => setIntroOpen(true)}
                      introOnLaunch={introOnLaunch}
                      onToggleIntroOnLaunch={toggleIntroOnLaunch}
                      profile={profileDraft}
                      savedProfile={bootstrap.profile}
                      settings={bootstrap.settings}
                      backupStatus={backupStatus}
                      isOwner={isOwner}
                      theme={theme}
                      saving={profileSaving}
                      cardAlertPercent={cardAlertPercent}
                      onProfileChange={setProfileDraft}
                      onSaveProfile={saveProfile}
                      onSaveCardAlert={saveCardAlert}
                      holdingGrouping={holdingGrouping}
                      simpleMode={simpleMode}
                      onSaveHoldingGrouping={saveHoldingGrouping}
                      onSaveSimpleMode={saveSimpleMode}
              onDownloadReport={() => setPrinting(true)}
              preparingReport={printing}
                      onThemeToggle={toggleTheme}
                    />
        );
      default:
        return null;
    }
  };

  return (
    <div className="app-shell">
      {introOpen && <IntroVideo onClose={closeIntro} />}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">₹</div>
          <div>
            <strong>Financial Tracker</strong>
            {/* The month this is all about, so the figure below the list has a period attached
                to it rather than floating free. */}
            <small>{formatMonth(shellOverview?.month ?? todayISO().slice(0, 7))}</small>
          </div>
        </div>

        <SidebarNav
          items={navigationModel.items}
          activePage={activePage}
          newsUnread={newsUnread}
          badges={sidebarBadges}
          person={{ name: profileDraft.name, email: profileDraft.email }}
          onNavigate={navigate}
        />
      </aside>

      <main className="main-shell">
        <header className="topbar" key={activePage}>
          <div>
            {!PAGES_WITH_OWN_HEADER.includes(activePage) && (
              <h1>{navItems.find((item) => item.page === activePage)?.label}</h1>
            )}
          </div>
          <div className="topbar-actions">
            {showAccountFilter && (
            <label className="control-field account-filter">
              <span className="control-label">Filter account/card</span>
              <select value={selectedAccountId} onChange={(event) => setSelectedAccountId(event.target.value)}>
                <option value="">All active accounts and cards</option>
                {activeAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {accountTypeLabel(account.type)}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} />
            </label>
            )}

            {/* Search goes to the ledger with what was typed, which is the only place in the
                application that can answer it. Not a box that filters whatever page you are on
                into something smaller. */}
            <form
              className="topbar-search"
              role="search"
              onSubmit={(event) => {
                event.preventDefault();
                const term = search.trim();
                if (!term) return;
                navigate("transactions", { search: term });
                setSearch("");
              }}
            >
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search transactions"
                aria-label="Search transactions"
              />
            </form>

            <AttentionMenu items={attention} onGo={(page) => navigate(page)} />

            <button
              type="button"
              className="icon-button topbar-theme"
              aria-label={theme === "dark" ? "Switch to the light theme" : "Switch to the dark theme"}
              onClick={toggleTheme}
            >
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>

            <button
              type="button"
              className="topbar-person"
              aria-label={`${profileDraft.name || profileDraft.email || "Your profile"} — open your profile`}
              onClick={() => navigate("profile")}
            >
              <span aria-hidden="true">{initialsOf(profileDraft.name, profileDraft.email)}</span>
            </button>
          </div>
        </header>

        <section className="content-area" ref={contentRef}>
          {renderPage(activePage)}
        </section>
      </main>

      {printing && (
        <div className="print-report">
          <header className="print-report-head">
            <h1>Financial Tracker</h1>
            <p>
              {profileDraft.name ? `${profileDraft.name} · ` : ""}
              {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          </header>
          {/* Derived from the navigation rather than a second list, so a page added to the app is
              in the report without anybody remembering to add it here.

              Deliberately the whole list, not the sections simple mode leaves. The report is a
              record of the money, not a view of the application: a PDF quietly missing your loans
              because a display setting was on is a worse thing than a report longer than the app. */}
          {navItems.map((item) => (
            <section key={item.page} className="print-page">
              <h2 className="print-page-title">{item.label}</h2>
              {renderPage(item.page)}
            </section>
          ))}
        </div>
      )}

      {moreOpen && navigationModel.more.length > 1 && (
        <MoreSheet
          pages={navigationModel.more}
          activePage={activePage}
          onNavigate={navigate}
          onClose={() => setMoreOpen(false)}
        />
      )}

      <MobileNav
        primary={navigationModel.primary}
        more={navigationModel.more}
        activePage={activePage}
        moreOpen={moreOpen}
        onToggleMore={() => setMoreOpen((open) => !open)}
        onNavigate={(page) => {
          setMoreOpen(false);
          navigate(page);
        }}
      />

      {notice && (
        <div className="toast" role="status" aria-live="polite">
          <span>{notice.message}</span>
          {notice.action && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                const action = notice.action;
                dismissNotice();
                action?.onClick();
              }}
            >
              {notice.action.label}
            </button>
          )}
        </div>
      )}
      {confirmRequest && (
        <ConfirmModal
          request={confirmRequest}
          onCancel={() => setConfirmRequest(null)}
          onDone={() => setConfirmRequest(null)}
        />
      )}
    </div>
  );
}

function SetupPage({
  categories,
  onCreated
}: {
  categories: Category[];
  onCreated: () => Promise<void>;
}) {
  return (
    <div className="setup-screen">
      <div className="setup-copy">
        <div className="brand setup-brand">
          <div className="brand-mark">₹</div>
          <div>
            <strong>Financial Tracker</strong>
            <span>Local SQLite database</span>
          </div>
        </div>
        <h1>Start with your first account.</h1>
        <p>
          Add one bank account, credit card, or food card. Balances will then come from the starting value plus
          transactions you enter.
        </p>
        <details className="category-cloud-disclosure">
          <summary>See the {categories.length} starter categories</summary>
          <div className="category-cloud">
            {categories.map((category) => (
              <CategoryBadge key={category.id} category={category} />
            ))}
          </div>
        </details>
      </div>
      <div className="panel setup-panel">
        <h2>Add account</h2>
        <AccountForm onCreated={onCreated} />
      </div>
    </div>
  );
}

function OverviewPage({
  selectedAccountId,
  selectedAccount,
  refreshKey,
  onNavigate,
  canOpen
}: {
  selectedAccountId: string;
  selectedAccount?: Account;
  refreshKey: number;
  onNavigate: Navigate;
  /* Whether a section can be opened at all. A page the mode keeps must not offer a door into one
     it hides: pressing it would bounce the reader straight back with an apology. */
  canOpen: (page: Page) => boolean;
}) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [budgetPlan, setBudgetPlan] = useState<BudgetPlan | null>(null);
  const [wealth, setWealth] = useState<WealthSummary | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingPayments | null>(null);

  useEffect(() => {
    setLoading(true);
    setLoadError("");
    Api.overview(selectedAccountId || undefined)
      .then(setOverview)
      .catch((err) => {
        setOverview(null);
        setLoadError(err instanceof Error ? err.message : "Could not load the overview.");
      })
      .finally(() => setLoading(false));
  }, [selectedAccountId, refreshKey]);

  useEffect(() => {
    let active = true;
    Api.budgetPlan()
      .then((plan) => {
        if (active) {
          setBudgetPlan(plan);
        }
      })
      .catch(() => {
        if (active) setBudgetPlan(null);
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  useEffect(() => {
    let active = true;
    Api.wealth()
      .then((next) => {
        if (active) setWealth(next);
      })
      .catch(() => {
        if (active) setWealth(null);
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  useEffect(() => {
    let active = true;
    Api.upcoming()
      .then((next) => {
        if (active) setUpcoming(next);
      })
      .catch(() => {
        if (active) setUpcoming(null);
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  if (loading) {
    return <PanelLoader label="Loading overview" />;
  }

  if (loadError || !overview) {
    return <EmptyState text={loadError || "Could not load the overview."} />;
  }

  // Drill from a spending figure into the transactions that make it up, for this month.
  function showMonthTransactions(subcategoryId: string | undefined) {
    if (!overview || !subcategoryId) return;
    const line = overview.categoryReport.find((category) => category.subcategoryId === subcategoryId);
    onNavigate("transactions", {
      typeId: line?.typeId,
      subcategoryId,
      from: `${overview.month}-01`,
      to: monthEndForInput(overview.month)
    });
  }

  /*
   * The ring divides every slice by `spendingPaise`, which the server sums with each category
   * floored at zero -- so a category left negative by refunds has to be floored here too, or the
   * slices would come to less than the whole and the track would show through behind them.
   */
  const spendingSegments = consolidateDonutSegments(
    overview.categoryReport
      .filter((category) => category.amountPaise > 0)
      .map((category) => ({
        id: category.subcategoryId ?? category.name,
        name: category.name,
        color: category.color,
        amountPaise: category.amountPaise
      }))
  );
  const allocationTotal = wealth ? wealth.allocation.reduce((sum, segment) => sum + segment.valuePaise, 0) : 0;
  const cardSegments = cardUtilisationSegments(overview.accounts);
  const cardOutstandingPaise = cardSegments.reduce((sum, segment) => sum + segment.amountPaise, 0);
  return (
    <div className="page-grid overview-page">
      {overview.summary.uncategorizedCount > 0 && (
        <div className="attention-banner" role="status">
          <CircleAlert size={18} />
          <span>
            <strong>
              {overview.summary.uncategorizedCount} transaction{overview.summary.uncategorizedCount === 1 ? "" : "s"}
            </strong>{" "}
            {overview.summary.uncategorizedCount === 1 ? "needs" : "need"} a category, so reports and budgets can
            count {overview.summary.uncategorizedCount === 1 ? "it" : "them"} properly.
          </span>
          <button type="button" onClick={() => onNavigate("transactions", { status: "uncategorized" })}>
            Review
          </button>
        </div>
      )}

      {/* The one raised surface on the page: what you can spend, then how the month is moving. */}
      <section className="overview-lead" aria-label="Headline figures">
        <div className="summary-grid overview-summary">
          <SummaryCard
            label={selectedAccount?.type === "credit_card" ? "Available card limit" : "Available cash"}
            value={
              selectedAccount?.type === "credit_card"
                ? formatINRWhole(selectedAccount.availableLimitPaise ?? 0)
                : formatINRWhole(overview.summary.availableCashPaise)
            }
            countPaise={
              selectedAccount?.type === "credit_card"
                ? selectedAccount.availableLimitPaise ?? 0
                : overview.summary.availableCashPaise
            }
            icon={<WalletCards />}
          />
          <SummaryCard
            label="Credit card outstanding"
            value={formatINRWhole(overview.summary.creditOutstandingPaise)}
            countPaise={overview.summary.creditOutstandingPaise}
            icon={<CreditCard />}
            tone="warning"
          />
          {/* What the cards were actually used for this month, which the outstanding beside it
              cannot say: that figure carries EMIs and whatever was left unpaid from before. */}
          <SummaryCard
            label="Credit card spends"
            value={formatINRWhole(overview.summary.cardSpendingPaise)}
            countPaise={overview.summary.cardSpendingPaise}
            icon={<CreditCard />}
          />
          <SummaryCard
            label="Outflow"
            value={formatINRWhole(overview.summary.totalOutflowPaise)}
            countPaise={overview.summary.totalOutflowPaise}
            icon={<BarChart3 />}
            note={
              <ChangeVsLastMonth
                current={overview.summary.totalOutflowPaise}
                previous={overview.comparison.outflowPaise}
                comparison={overview.comparison}
                higherIsGood={false}
              />
            }
          />
          <SummaryCard
            label="Inflow"
            value={formatINRWhole(overview.summary.totalInflowPaise)}
            countPaise={overview.summary.totalInflowPaise}
            icon={<TrendingUp />}
            note={
              <ChangeVsLastMonth
                current={overview.summary.totalInflowPaise}
                previous={overview.comparison.inflowPaise}
                comparison={overview.comparison}
                higherIsGood
              />
            }
          />
        </div>
      </section>

      <OverviewBand title="This month" detail={formatMonth(overview.month)}>
        <div className="two-column overview-band-pair">
          <Panel title="Spending mix" action={<button onClick={() => onNavigate("reports")}>Open reports</button>}>
            {spendingSegments.length === 0 || overview.summary.spendingPaise <= 0 ? (
              <EmptyState text="No category spending yet this month." />
            ) : (
              <DonutChart
                segments={spendingSegments}
                totalPaise={overview.summary.spendingPaise}
                ariaLabel="Spending by category"
                centerLabel="Spent"
                centerValue={formatINRWhole(overview.summary.spendingPaise)}
                centerCountPaise={overview.summary.spendingPaise}
                className="overview-donut-chart"
                onSegmentClick={(segment) => showMonthTransactions(segment.id)}
              />
            )}
          </Panel>
{canOpen("budgets") && (
                    <Panel title="Budget guardrails" action={<button onClick={() => onNavigate("budgets")}>Plan</button>}>
            <BudgetGuardrails
              plan={budgetPlan}
              uncategorizedCount={overview.summary.uncategorizedCount}
              onReviewUncategorized={() => onNavigate("transactions", { status: "uncategorized" })}
            />
          </Panel>
          )}
        </div>
        <Panel title="Cashflow">
          {wealth ? (
            <CashflowPanel wealth={wealth} investedPaise={overview.summary.investedPaise} />
          ) : (
            <EmptyState text="Cashflow is loading." />
          )}
        </Panel>
      </OverviewBand>

      <OverviewBand title="Activity & upcoming">
        <div className="two-column overview-band-pair">
          <Panel title="Recent activity" action={<button onClick={() => onNavigate("transactions")}>View all</button>}>
            <TransactionTable transactions={overview.recentTransactions} empty="No transactions yet." compact />
          </Panel>
          {/* No action here: the list already groups by AutoPay, loans and cards, and the
              sidebar is how you get to AutoPay itself. */}
          <Panel title={`Coming up in ${upcoming?.windowDays ?? 7} days`}>
            <UpcomingPaymentsList upcoming={upcoming} availableCashPaise={overview.summary.availableCashPaise} />
          </Panel>
        </div>
      </OverviewBand>

      <OverviewBand title="Wealth">
        <div className="two-column overview-band-pair">
          <Panel title="Net worth">
            {wealth ? <NetWorthPanel wealth={wealth} /> : <EmptyState text="Net worth is loading." />}
          </Panel>
          <Panel title="Asset allocation">
            {wealth && wealth.allocation.length > 0 ? (
              <DonutChart
                segments={wealth.allocation.map((segment) => ({
                  id: segment.key,
                  name: segment.label,
                  color: segment.color,
                  amountPaise: segment.valuePaise
                }))}
                totalPaise={allocationTotal}
                ariaLabel="Asset allocation"
                centerLabel="Assets"
                centerValue={formatINRWhole(allocationTotal)}
                centerCountPaise={allocationTotal}
                className="overview-donut-chart"
              />
            ) : (
              <EmptyState text="Add accounts or investments to see your allocation." />
            )}
          </Panel>
        </div>
        <Panel title="Card utilisation" action={<button onClick={() => onNavigate("accounts")}>Manage</button>}>
          <MixChart
            segments={cardSegments}
            totalPaise={cardOutstandingPaise}
            ariaLabel="Credit card utilisation"
            centerLabel="Card debt"
            centerValue={formatINRWhole(cardOutstandingPaise)}
            centerCountPaise={cardOutstandingPaise}
            className="overview-donut-chart"
            emptyText="No credit card owes anything right now."
          />
        </Panel>
      </OverviewBand>
    </div>
  );
}

/** A labelled band of the Overview: a quiet heading over the panels that answer one question. */
function OverviewBand({ title, detail, children }: { title: string; detail?: string; children: React.ReactNode }) {
  const headingId = `overview-band-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section className="overview-band" aria-labelledby={headingId}>
      <header className="overview-band-head">
        <h2 id={headingId}>{title}</h2>
        {detail && <span>{detail}</span>}
      </header>
      <div className="overview-band-body">{children}</div>
    </section>
  );
}

function NetWorthPanel({ wealth }: { wealth: WealthSummary }) {
  const { netWorth, history } = wealth;
  const points = history.map((row) => ({ label: formatMonth(row.month).slice(0, 3), amountPaise: row.netWorthPaise }));
  return (
    <div className="net-worth-panel">
      <div className="net-worth-headline">
        <span>Total net worth</span>
        <strong className={netWorth.netWorthPaise >= 0 ? "amount-in" : "amount-out"}>
          {formatINRWhole(netWorth.netWorthPaise)}
        </strong>
      </div>
      <div className="net-worth-breakdown">
        <div>
          <span>Liquid cash</span>
          <strong>{formatINRWhole(netWorth.liquidPaise)}</strong>
        </div>
        <div>
          <span>Investments</span>
          <strong>{formatINRWhole(netWorth.investmentsPaise)}</strong>
        </div>
        <div>
          <span>Liabilities</span>
          <strong className="amount-out">−{formatINRWhole(netWorth.liabilitiesPaise)}</strong>
        </div>
      </div>
      {points.length >= 2 ? (
        <TrendChart points={points} variant="line" color="#0284c7" />
      ) : (
        <p className="helper-text net-worth-hint">
          A month-by-month net-worth chart builds here as you keep using the app.
        </p>
      )}
    </div>
  );
}

function CashflowPanel({ wealth, investedPaise }: { wealth: WealthSummary; investedPaise: number }) {
  const { cashflow, runwayMonths } = wealth;
  return (
    <div className="cashflow-panel">
      <div className="cashflow-metrics">
        <div>
          <span>Inflow</span>
          <strong className="amount-in">{formatINR(cashflow.incomePaise)}</strong>
        </div>
        <div>
          <span>Outflow</span>
          <strong className="amount-out">{formatINR(cashflow.expensePaise)}</strong>
        </div>
        <div>
          <span>Saved</span>
          <strong className={cashflow.savedPaise >= 0 ? "amount-in" : "amount-out"}>
            {signedImpact(cashflow.savedPaise)}
          </strong>
        </div>
        <div>
          <span>Savings rate</span>
          <strong
            className={
              cashflow.savingsRatePercent === null
                ? ""
                : cashflow.savingsRatePercent >= 0
                  ? "amount-in"
                  : "amount-out"
            }
          >
            {cashflow.savingsRatePercent === null ? "Not enough data yet" : `${cashflow.savingsRatePercent}%`}
          </strong>
        </div>
      </div>
      {investedPaise > 0 && (
        <p className="cashflow-invested">
          Outflow includes <strong>{formatINR(investedPaise)}</strong> you invested. That money is still yours,
          just not as cash.
        </p>
      )}
      <div className="cashflow-runway">
        <span>Emergency-fund runway</span>
        <strong>{runwayMonths === null ? "Not enough data yet" : `${runwayMonths} months`}</strong>
        <small>How long your liquid cash covers your recent average monthly spending.</small>
      </div>
    </div>
  );
}

function BudgetGuardrails({
  plan,
  uncategorizedCount,
  onReviewUncategorized
}: {
  plan: BudgetPlan | null;
  uncategorizedCount: number;
  onReviewUncategorized: () => void;
}) {
  if (!plan || plan.lines.length === 0) {
    return <EmptyState text="Add budget lines to see month-to-date guardrails." />;
  }

  const usedPercent = boundedPercent(plan.totals.actualPaise, plan.totals.amountPaise);
  const paceDelta = Math.round(usedPercent - plan.elapsedPercent);
  const healthRows = [
    { label: "On track", value: plan.totals.safeCount, tone: "safe" },
    { label: "Watch", value: plan.totals.watchCount + plan.totals.criticalCount, tone: "watch" },
    { label: "Over", value: plan.totals.overCount, tone: "over" }
  ];

  return (
    <div className="budget-guardrails">
      <div className="budget-pace-meter">
        <div className="budget-pace-copy">
          <span>Budget used</span>
          <strong>{usedPercent}%</strong>
          <small>{paceDelta > 0 ? `${paceDelta}% ahead of today` : `${Math.abs(paceDelta)}% under today's pace`}</small>
        </div>
        <div className="budget-pace-track" aria-label="Budget used compared with month elapsed">
          <span className="expected" style={{ left: `${Math.min(plan.elapsedPercent, 100)}%` }} />
          <span className={usedPercent > 100 ? "over" : usedPercent >= 75 ? "watch" : "safe"} style={{ width: `${Math.min(usedPercent, 100)}%` }} />
        </div>
      </div>
      <div className="budget-health-grid">
        {healthRows.map((row) => (
          <div className={`budget-health ${row.tone}`} key={row.label}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>
      <div className="budget-signal-list">
        <Metric label="Unplanned spend" value={formatINR(plan.totals.unplannedActualPaise)} warning={plan.totals.unplannedActualPaise > 0} />
        {uncategorizedCount > 0 ? (
          <button type="button" className="metric-link" onClick={onReviewUncategorized}>
            <Metric label="Uncategorized" value={`${uncategorizedCount} item${uncategorizedCount === 1 ? "" : "s"} · Review`} warning />
          </button>
        ) : (
          <Metric label="Uncategorized" value="0 items" />
        )}
      </div>
    </div>
  );
}

/**
 * The one form that records a transaction, shown in a dialog from the Transactions page.
 *
 * It used to be the top half of a Weekly Entry page that also listed the week, totalled it, and
 * drew an account-impact panel beside it. The owner asked for that page gone and for recording
 * to happen from Transactions instead, so the form moved here whole -- every field, every
 * conditional branch, and the card-EMI settlement it carries -- and the page furniture around it
 * did not come with it. The Transactions page already lists and filters everything the week
 * panel used to show.
 *
 * `batchId` comes from the page rather than being fetched here: the import dialog needs the same
 * one, and two fetches of the same week's batch would be two round trips for one answer.
 */
function TransactionEntryForm({
  selectedAccountId,
  accounts,
  loans,
  cardEmis,
  subscriptions,
  mutualFunds,
  vacations,
  categoryTypes,
  batchId,
  refresh,
  showNotice,
  onDone,
  onCancel
}: {
  selectedAccountId: string;
  accounts: Account[];
  loans: Loan[];
  cardEmis: Loan[];
  subscriptions: AutopaySubscription[];
  mutualFunds: Investment[];
  vacations: Vacation[];
  categoryTypes: CategoryType[];
  batchId: string;
  refresh: () => Promise<void>;
  showNotice: (message: string) => void;
  /** Closes the dialog once the entry has landed. */
  onDone: () => void;
  /** Closes it without recording anything. Separate from onDone so the two read apart. */
  onCancel: () => void;
}) {
  const visibleAccounts = selectedAccountId
    ? accounts.filter((account) => account.id === selectedAccountId)
    : accounts;
  const firstAccount = visibleAccounts[0] ?? accounts[0];
  const defaultType = preferredType(categoryTypes, "expense") ?? categoryTypes[0];
  const [saving, setSaving] = useState(false);
  // Which EMIs on the card being paid this payment covers, and for how much each, keyed by EMI.
  // A key present means ticked, so unticking one forgets its amount rather than keeping a zero.
  const [cardEmiAmounts, setCardEmiAmounts] = useState<Record<string, string>>({});
  const [settleCardEmis, setSettleCardEmis] = useState(false);
  const [form, setForm] = useState({
    date: todayISO(),
    accountId: firstAccount?.id ?? "",
    method: firstAccount?.type === "credit_card" ? ("credit_card" as PaymentMethod) : ("upi" as PaymentMethod),
    merchant: "",
    note: "",
    typeId: defaultType?.id ?? "",
    subcategoryId: "",
    amount: "",
    transferAccountId: accounts.find((account) => account.type === "credit_card")?.id ?? "",
    loanId: "",
    loanPaymentType: "emi" as LoanPaymentType,
    subscriptionId: "",
    investmentId: "",
    vacationId: ""
  });

  useEffect(() => {
    if (firstAccount && !visibleAccounts.some((account) => account.id === form.accountId)) {
      setForm((current) => ({
        ...current,
        accountId: firstAccount.id,
        method: firstAccount.type === "credit_card" ? "credit_card" : "upi"
      }));
    }
  }, [firstAccount, form.accountId, visibleAccounts]);

  useEffect(() => {
    if (form.typeId && !categoryTypes.some((type) => type.id === form.typeId)) {
      setForm((current) => ({
        ...current,
        typeId: defaultType?.id ?? "",
        subcategoryId: ""
      }));
    }
  }, [categoryTypes, defaultType?.id, form.typeId]);

  // The tick describes one card's EMIs. Pointing the payment at another card, or at something
  // that is not a card payment at all, leaves it describing EMIs that are no longer on offer.
  useEffect(() => {
    setSettleCardEmis(false);
    setCardEmiAmounts({});
  }, [form.transferAccountId, form.typeId]);

  const selectedAccount = accounts.find((account) => account.id === form.accountId);
  const cardAccounts = accounts.filter((account) => account.type === "credit_card");
  const selectedType = categoryTypes.find((type) => type.id === form.typeId);
  const availableSubcategories = selectedType?.subcategories ?? [];
  const selectedBehavior = selectedType?.behavior ?? "expense";
  /*
   * Which EMIs this payment could be for. The EMI SubType offers everything still running --
   * a card's EMI and a loan's alike -- the way AutoPay offers every active subscription. The
   * five loan kinds beside it still offer only their own, because picking "Home" and being shown
   * a vehicle loan would be a worse list, not a longer one. Nothing paid off is offered: there
   * is nothing left to pay.
   */
  const isEmiSelected = form.subcategoryId === EMI_SUBCATEGORY_ID;
  const availableLoans = (isEmiSelected ? [...loans, ...cardEmis] : loans).filter((loan) =>
    isEmiSelected
      ? !loan.isArchived && loan.outstandingPaise > 0
      : loan.subcategoryId === form.subcategoryId
  );
  const isAutopaySelected = form.subcategoryId === AUTOPAY_SUBCATEGORY_ID;
  const isMutualFundsSelected = form.subcategoryId === MUTUAL_FUNDS_SUBCATEGORY_ID;
  const isSelfTransferSelected = form.subcategoryId === SELF_TRANSFER_SUBCATEGORY_ID;
  const isExpenseSelected = selectedBehavior === "expense";
  const selfTransferTargets = selfTransferTargetAccounts(accounts, form.accountId);
  // The EMIs running on the card this payment is for. A card EMI is never paid on its own: the
  // bank charges the month's installment to the card, so the bill settles it along with the
  // spending. One already paid off has nothing left to settle.
  const cardEmisForPayment =
    selectedBehavior === "card_payment" && form.transferAccountId
      ? cardEmis.filter((emi) => emi.accountId === form.transferAccountId && emi.outstandingPaise > 0)
      : [];
  const cardEmiAllocations = cardEmisForPayment
    .filter((emi) => cardEmiAmounts[emi.id] !== undefined)
    .map((emi) => ({ loanId: emi.id, amountPaise: parseAmountToPaise(cardEmiAmounts[emi.id] ?? "") }))
    .filter((allocation) => allocation.amountPaise > 0);
  const cardEmiTotalPaise = cardEmiAllocations.reduce((sum, allocation) => sum + allocation.amountPaise, 0);
  const paymentAmountPaise = parseAmountToPaise(form.amount);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);

    try {
      const behavior = selectedType?.behavior ?? "expense";
      const kind = kindForBehavior(behavior);
      const payload: CreateTransactionPayload = {
        batchId: batchId || undefined,
        date: form.date,
        accountId: form.accountId,
        method: selectedAccount?.type === "credit_card" ? "credit_card" : form.method,
        merchant: form.merchant || undefined,
        note: form.note || undefined,
        typeId: form.typeId || undefined,
        subcategoryId: behavior === "card_payment" ? undefined : form.subcategoryId || undefined,
        amountPaise: parseAmountToPaise(form.amount),
        direction: directionForBehavior(behavior),
        kind,
        transferAccountId:
          behavior === "card_payment" || isSelfTransferSelected ? form.transferAccountId : undefined,
        loanId: behavior === "loan" ? form.loanId || undefined : undefined,
        loanPaymentType: behavior === "loan" && form.loanId ? form.loanPaymentType : undefined,
        subscriptionId:
          form.subcategoryId === AUTOPAY_SUBCATEGORY_ID ? form.subscriptionId || undefined : undefined,
        investmentId:
          form.subcategoryId === MUTUAL_FUNDS_SUBCATEGORY_ID ? form.investmentId || undefined : undefined,
        vacationId: behavior === "expense" ? form.vacationId || undefined : undefined,
        cardEmiPayments:
          behavior === "card_payment" && settleCardEmis && cardEmiAllocations.length
            ? cardEmiAllocations
            : undefined
      };

      const result = await Api.createTransaction(payload);
      await refresh();
      showNotice(
        result.duplicateCandidates.length
          ? "Transaction saved. Possible duplicate found."
          : "Transaction added."
      );
      onDone();
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Could not save transaction.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="entry-form" onSubmit={submit}>
      <label>
        Date
        <input
          type="date"
          value={form.date}
          onChange={(event) => setForm({ ...form, date: event.target.value })}
          min={EARLIEST_DATE}
          /* A transaction records what happened, so the picker stops at today. */
          max={todayISO()}
          required
        />
      </label>
      <label>
        Account
        <select
          value={form.accountId}
          onChange={(event) => {
            const account = accounts.find((item) => item.id === event.target.value);
            setForm({
              ...form,
              accountId: event.target.value,
              method: account?.type === "credit_card" ? "credit_card" : form.method,
              transferAccountId:
                isSelfTransferSelected && form.transferAccountId === event.target.value
                  ? ""
                  : form.transferAccountId
            });
          }}
          required
        >
          {visibleAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Type
        <select
          value={form.typeId}
          onChange={(event) =>
            setForm({
              ...form,
              typeId: event.target.value,
              subcategoryId: "",
              transferAccountId: accounts.find((account) => account.type === "credit_card")?.id ?? "",
              loanId: "",
              loanPaymentType: "emi"
            })
          }
          required
        >
          {categoryTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Method
        <select
          value={selectedAccount?.type === "credit_card" ? "credit_card" : form.method}
          disabled={selectedAccount?.type === "credit_card"}
          onChange={(event) => setForm({ ...form, method: event.target.value as PaymentMethod })}
        >
          <option value="upi">UPI</option>
          <option value="credit_card">Credit card</option>
          <option value="bank_transfer">Bank transfer</option>
          <option value="cash">Cash</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label className="wide">
        Merchant / note
        <input
          value={form.merchant}
          onChange={(event) => setForm({ ...form, merchant: event.target.value })}
          placeholder="DMart, PVR, unknown..."
        />
      </label>
      <label>
        SubType
        {selectedBehavior === "card_payment" ? (
          <select
            value={form.transferAccountId}
            onChange={(event) => setForm({ ...form, transferAccountId: event.target.value })}
            required
          >
            <option value="">Choose card</option>
            {cardAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        ) : (
          <select
            value={form.subcategoryId}
            onChange={(event) =>
              setForm({
                ...form,
                subcategoryId: event.target.value,
                transferAccountId: "",
                loanId: "",
                subscriptionId: "",
                investmentId: ""
              })
            }
          >
            <option value="">Decide later</option>
            {availableSubcategories.map((subcategory) => (
              <option key={subcategory.id} value={subcategory.id}>
                {subcategory.name}
              </option>
            ))}
          </select>
        )}
      </label>
      {isSelfTransferSelected && (
        <label>
          Account
          <select
            value={form.transferAccountId}
            onChange={(event) => setForm({ ...form, transferAccountId: event.target.value })}
            required
          >
            <option value="">Choose account</option>
            {selfTransferTargets.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {isAutopaySelected && (
        <label>
          Subscription
          <select
            value={form.subscriptionId}
            onChange={(event) => setForm({ ...form, subscriptionId: event.target.value })}
          >
            <option value="">Not linked yet</option>
            {subscriptions
              .filter((subscription) => subscription.status === "active")
              .map((subscription) => (
                <option key={subscription.id} value={subscription.id}>
                  {subscription.name} · {formatINR(subscription.amountPaise)}
                </option>
              ))}
          </select>
        </label>
      )}
      {isMutualFundsSelected && (
        <label>
          Mutual fund
          <select
            value={form.investmentId}
            onChange={(event) => setForm({ ...form, investmentId: event.target.value })}
          >
            <option value="">Not linked yet</option>
            {mutualFunds.map((fund) => (
              <option key={fund.id} value={fund.id}>
                {fund.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {isExpenseSelected && vacations.length > 0 && (
        <label className="vacation-check">
          <input
            type="checkbox"
            checked={Boolean(form.vacationId)}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                vacationId: event.target.checked ? current.vacationId || vacations[0].id : ""
              }))
            }
          />
          <span>Part of a vacation?</span>
        </label>
      )}
      {isExpenseSelected && vacations.length > 0 && form.vacationId && (
        <label>
          Vacation
          <select
            value={form.vacationId}
            onChange={(event) => setForm({ ...form, vacationId: event.target.value })}
          >
            {vacations.map((vacation) => (
              <option key={vacation.id} value={vacation.id}>
                {vacation.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {selectedBehavior === "loan" && (
        <>
          <label>
            {isEmiSelected ? "Linked EMI" : "Linked loan"}
            <select
              value={form.loanId}
              onChange={(event) => setForm({ ...form, loanId: event.target.value })}
              disabled={!form.subcategoryId}
            >
              <option value="">Not linked yet</option>
              {availableLoans.map((loan) => (
                <option key={loan.id} value={loan.id}>
                  {loan.name} · {formatINR(loan.outstandingPaise)} outstanding
                </option>
              ))}
            </select>
          </label>
          <label>
            Payment type
            <select
              value={form.loanPaymentType}
              onChange={(event) =>
                setForm({ ...form, loanPaymentType: event.target.value as LoanPaymentType })
              }
              disabled={!form.loanId}
            >
              <option value="emi">EMI</option>
              <option value="prepayment">Prepayment</option>
            </select>
          </label>
        </>
      )}
      {/* A card EMI is part of the card's bill, not a payment of its own. So the bill asks
          which of the card's EMIs it covers, and each ticked one is then charged to the
          card and settled by this payment -- the card's outstanding and the EMI's balance
          both move, from the one entry. */}
      {selectedBehavior === "card_payment" && cardEmisForPayment.length > 0 && (
        <label className="vacation-check wide">
          <input
            type="checkbox"
            checked={settleCardEmis}
            onChange={(event) => {
              const on = event.target.checked;
              setSettleCardEmis(on);
              // Ticked, every EMI on the card starts at its monthly installment, which is
              // what a bill normally carries. Each one can then be unticked or changed.
              setCardEmiAmounts(
                on
                  ? Object.fromEntries(
                      cardEmisForPayment.map((emi) => [emi.id, (emi.monthlyEmiPaise / 100).toFixed(2)])
                    )
                  : {}
              );
            }}
          />
          <span>EMIs on this card part of this payment?</span>
        </label>
      )}
      {selectedBehavior === "card_payment" && settleCardEmis && cardEmisForPayment.length > 0 && (
        <div className="card-emi-settle wide">
          {cardEmisForPayment.map((emi) => {
            const picked = cardEmiAmounts[emi.id] !== undefined;
            return (
              <div className="card-emi-settle-row" key={emi.id}>
                <label className="card-emi-settle-pick">
                  <input
                    type="checkbox"
                    checked={picked}
                    onChange={(event) =>
                      setCardEmiAmounts((current) => {
                        const next = { ...current };
                        if (event.target.checked) {
                          next[emi.id] = (emi.monthlyEmiPaise / 100).toFixed(2);
                        } else {
                          delete next[emi.id];
                        }
                        return next;
                      })
                    }
                  />
                  <span>
                    <strong>{emi.name}</strong>
                    <small>
                      {formatINR(emi.monthlyEmiPaise)} a month · {formatINR(emi.outstandingPaise)} left
                    </small>
                  </span>
                </label>
                <input
                  className="card-emi-settle-amount"
                  value={cardEmiAmounts[emi.id] ?? ""}
                  onChange={(event) =>
                    setCardEmiAmounts((current) => ({ ...current, [emi.id]: event.target.value }))
                  }
                  placeholder="₹0"
                  inputMode="decimal"
                  disabled={!picked}
                  aria-label={`How much of this payment settles ${emi.name}`}
                />
              </div>
            );
          })}
          {/* The payment, read as its two parts. Shown against the amount entered so that
              an EMI part larger than the payment is visible here rather than only as a
              refusal on saving. */}
          <p className="card-emi-settle-total">
            {formatINR(cardEmiTotalPaise)} of EMIs
            {paymentAmountPaise > 0 &&
              (paymentAmountPaise >= cardEmiTotalPaise
                ? ` · ${formatINR(paymentAmountPaise - cardEmiTotalPaise)} towards this cycle's spending`
                : " · more than the payment itself")}
          </p>
        </div>
      )}
      <label>
        Amount
        <input
          value={form.amount}
          onChange={(event) => setForm({ ...form, amount: event.target.value })}
          placeholder="₹0"
          inputMode="decimal"
          required
        />
      </label>
      <div className="entry-form-actions">
        <button type="button" className="secondary-action" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button className="primary-action add-button" disabled={saving}>
          <Plus size={18} />
          Add transaction
        </button>
      </div>
    </form>
  );
}

type TransactionEditDraft = {
  id: string;
  date: string;
  accountId: string;
  kind: TransactionKind;
  method: PaymentMethod;
  merchant: string;
  note: string;
  typeId: string;
  subcategoryId: string;
  amount: string;
  transferAccountId: string;
  loanId: string;
  loanPaymentType: LoanPaymentType;
  subscriptionId: string;
  investmentId: string;
  vacationId: string;
  /** For a card payment: how much of it settled EMI installments running on that card. */
  cardEmiPaise: number;
};

function TransactionsPage({
  selectedAccountId,
  accounts,
  loans,
  cardEmis,
  subscriptions,
  mutualFunds,
  vacations,
  categoryTypes,
  refresh,
  refreshKey,
  showNotice,
  requestConfirm,
  onAccountSelect
}: {
  selectedAccountId: string;
  accounts: Account[];
  loans: Loan[];
  cardEmis: Loan[];
  subscriptions: AutopaySubscription[];
  mutualFunds: Investment[];
  vacations: Vacation[];
  categoryTypes: CategoryType[];
  refresh: () => Promise<void>;
  refreshKey: number;
  showNotice: (message: string, options?: NoticeOptions) => void;
  requestConfirm: (request: ConfirmRequest) => void;
  onAccountSelect: (accountId: string) => void;
}) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  // Recording and importing both happen from here now, each in its own dialog.
  const [adding, setAdding] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  /* Entries are grouped into the week they were recorded in. Both dialogs write into the same
     batch, so the page fetches it once rather than each of them asking for the same answer. */
  const week = useMemo(() => mondayWeekRange(), []);
  const [batchId, setBatchId] = useState("");
  useEffect(() => {
    let cancelled = false;
    Api.currentBatch(week.weekStart, week.weekEnd)
      .then((batch) => {
        if (!cancelled) setBatchId(batch.id);
      })
      .catch(() => {
        /* A batch that cannot be fetched must not stop a transaction being recorded: the id is
           optional on the way in, and an entry without one is still an entry. */
      });
    return () => {
      cancelled = true;
    };
  }, [week.weekEnd, week.weekStart]);
  // A drill-down (e.g. clicking "Groceries" in Reports) opens this page pre-filtered via the URL.
  const [initialFilters] = useState(() => new URLSearchParams(window.location.search));
  const [search, setSearch] = useState(() => initialFilters.get("search") ?? "");
  const [typeId, setTypeId] = useState(() => initialFilters.get("typeId") ?? "");
  const [subcategoryId, setSubcategoryId] = useState(() => initialFilters.get("subcategoryId") ?? "");
  const [from, setFrom] = useState(() => initialFilters.get("from") ?? "");
  const [to, setTo] = useState(() => initialFilters.get("to") ?? "");
  // Which rows are ticked for deleting together. Ids rather than indexes, so a reload or a filter
  // change cannot turn a tick into a different transaction.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deletingSelection, setDeletingSelection] = useState(false);
  const [statusFilter, setStatusFilter] = useState(() =>
    initialFilters.get("status") === "uncategorized" ? "uncategorized" : ""
  );
  // On phones the filters fold away behind one button so transactions show on the first screen.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [refundDraft, setRefundDraft] = useState<{ id: string; amount: string; date: string } | null>(null);
  const [savingRefund, setSavingRefund] = useState(false);
  // Deletes wait a few seconds before reaching the server so they can be undone.
  const pendingDeletes = useRef(new Map<string, { transaction: Transaction; timer: number }>());
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const rangeIsValid = !from || !to || from <= to;
  const [hasMoreTransactions, setHasMoreTransactions] = useState(false);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [loadingMoreTransactions, setLoadingMoreTransactions] = useState(false);
  const [editDraft, setEditDraft] = useState<TransactionEditDraft | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const categories = flattenSubcategories(categoryTypes);
  const selectedFilterType = categoryTypes.find((type) => type.id === typeId);
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId);

  const [transactionTotals, setTransactionTotals] = useState<{
    count: number;
    outflowPaise: number;
    inflowPaise: number;
  } | null>(null);

  const loadPage = useCallback(async (offset = 0, append = false) => {
    const pageSize = offset === 0 ? INITIAL_TRANSACTION_LIMIT : TRANSACTION_PAGE_SIZE;
    if (offset === 0) {
      setLoadingTransactions(true);
    } else {
      setLoadingMoreTransactions(true);
    }

    try {
      const filters = {
        accountId: selectedAccountId || undefined,
        search: search || undefined,
        typeId: typeId || undefined,
        subcategoryId: subcategoryId || undefined,
        status: statusFilter || undefined,
        from: rangeIsValid ? from || undefined : undefined,
        to: rangeIsValid ? to || undefined : undefined
      };
      // Totals cover every match, not just the rows loaded so far, so "More" never changes them.
      const [rows, totals] = await Promise.all([
        Api.transactions({ ...filters, limit: pageSize + 1, offset }),
        offset === 0 ? Api.transactionTotals(filters) : Promise.resolve(null)
      ]);
      if (totals) setTransactionTotals(totals);
      setHasMoreTransactions(rows.length > pageSize);
      setTransactions((current) => (append ? [...current, ...rows.slice(0, pageSize)] : rows.slice(0, pageSize)));
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Could not load transactions.");
    } finally {
      setLoadingTransactions(false);
      setLoadingMoreTransactions(false);
    }
  }, [from, rangeIsValid, search, selectedAccountId, showNotice, statusFilter, subcategoryId, to, typeId]);

  useEffect(() => {
    setEditDraft(null);
    loadPage();
  }, [loadPage, refreshKey]);

  async function loadMore() {
    await loadPage(transactions.length, true);
  }

  const cardAccounts = accounts.filter((account) => account.type === "credit_card");

  // Keep the latest loader in a ref: a delete committed seconds later must reload the
  // filters the user is looking at *then*, not the ones active when they pressed Delete.
  const loadPageRef = useRef(loadPage);
  loadPageRef.current = loadPage;

  const commitDelete = useCallback(
    async (id: string) => {
      const pending = pendingDeletes.current.get(id);
      if (!pending) return;
      window.clearTimeout(pending.timer);
      pendingDeletes.current.delete(id);
      try {
        await Api.deleteTransaction(id);
        await loadPageRef.current();
        await refresh();
      } catch (err) {
        showNotice(err instanceof Error ? err.message : "Could not delete transaction.");
      } finally {
        setPendingDeleteIds((ids) => ids.filter((pendingId) => pendingId !== id));
      }
    },
    [refresh, showNotice]
  );

  // Leaving the page or closing the tab must still carry out deletes the user didn't undo.
  useEffect(() => {
    const flushOnExit = () => {
      for (const id of pendingDeletes.current.keys()) {
        void fetch(`/api/transactions/${id}`, { method: "DELETE", keepalive: true });
      }
      pendingDeletes.current.clear();
    };
    window.addEventListener("pagehide", flushOnExit);
    return () => {
      window.removeEventListener("pagehide", flushOnExit);
      const ids = [...pendingDeletes.current.keys()];
      for (const pending of pendingDeletes.current.values()) window.clearTimeout(pending.timer);
      pendingDeletes.current.clear();
      if (ids.length) {
        void Promise.all(ids.map((id) => Api.deleteTransaction(id).catch(() => undefined))).then(() => refresh());
      }
    };
  }, [refresh]);

  function undoDelete(id: string) {
    const pending = pendingDeletes.current.get(id);
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingDeletes.current.delete(id);
    setPendingDeleteIds((ids) => ids.filter((pendingId) => pendingId !== id));
    showNotice("Transaction restored.");
  }

  const visibleSelectedIds = () =>
    selectedIds.filter((id) => visibleTransactions.some((transaction) => transaction.id === id));

  function toggleSelected(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  function deleteSelected() {
    const ids = visibleSelectedIds();
    if (!ids.length) return;
    requestConfirm({
      message: `Delete ${ids.length} transaction${ids.length === 1 ? "" : "s"}?`,
      detail:
        "They are removed for good, and the balances they moved go back to what they would have been. This one cannot be undone.",
      confirmLabel: `Delete ${ids.length}`,
      tone: "danger",
      onConfirm: async () => {
        setDeletingSelection(true);
        try {
          const result = await Api.deleteTransactions(ids);
          setSelectedIds([]);
          await loadPage();
          await refresh();
          // A transaction that refused says why -- an installment settled by a card payment is
          // the usual one -- rather than disappearing from the count without explanation.
          showNotice(
            result.kept.length
              ? `Deleted ${result.deleted}. ${result.kept.length} left: ${result.kept[0].reason}`
              : `Deleted ${result.deleted} transaction${result.deleted === 1 ? "" : "s"}.`
          );
        } catch (err) {
          showNotice(err instanceof Error ? err.message : "Could not delete those transactions.");
        } finally {
          setDeletingSelection(false);
        }
      }
    });
  }

  function remove(transaction: Transaction) {
    setEditDraft(null);
    const timer = window.setTimeout(() => void commitDelete(transaction.id), UNDO_WINDOW_MS);
    pendingDeletes.current.set(transaction.id, { transaction, timer });
    setPendingDeleteIds((ids) => [...ids, transaction.id]);
    showNotice(`Deleted ${transaction.merchant || transaction.note || "transaction"}.`, {
      durationMs: UNDO_WINDOW_MS,
      action: { label: "Undo", onClick: () => undoDelete(transaction.id) }
    });
  }

  async function addAgain(transaction: Transaction) {
    try {
      const result = await Api.createTransaction({
        date: todayISO(),
        accountId: transaction.accountId,
        method: transaction.method,
        merchant: transaction.merchant ?? undefined,
        note: transaction.note ?? undefined,
        typeId: transaction.typeId ?? undefined,
        subcategoryId: transaction.subcategoryId ?? undefined,
        amountPaise: transaction.amountPaise,
        direction: transaction.direction,
        kind: transaction.kind,
        transferAccountId: transaction.transferAccountId ?? undefined,
        loanId: transaction.loanId ?? undefined,
        loanPaymentType: transaction.loanPaymentType ?? undefined,
        subscriptionId: transaction.subscriptionId ?? undefined,
        investmentId: transaction.investmentId ?? undefined,
        vacationId: transaction.vacationId ?? undefined
      });
      await loadPage();
      await refresh();
      const newId = result.transaction.id;
      showNotice(
        `Added ${formatINR(transaction.amountPaise)} ${transaction.merchant || "transaction"} for today.`,
        {
          durationMs: UNDO_WINDOW_MS,
          action: {
            label: "Undo",
            onClick: () => {
              void Api.deleteTransaction(newId)
                .then(() => loadPageRef.current())
                .then(() => refresh())
                .then(() => showNotice("Removed the copy."))
                .catch((err) => showNotice(err instanceof Error ? err.message : "Could not undo."));
            }
          }
        }
      );
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Could not add it again.");
    }
  }

  const hasActiveFilters = Boolean(search || typeId || subcategoryId || from || to || statusFilter);
  const activeFilterCount = [typeId, subcategoryId, from, to, statusFilter].filter(Boolean).length;

  function clearFilters() {
    setStatusFilter("");
    setSearch("");
    setTypeId("");
    setSubcategoryId("");
    setFrom("");
    setTo("");
    if (window.location.search) window.history.replaceState({}, "", window.location.pathname);
  }

  // Rows waiting to be deleted are hidden immediately, and taken out of the totals too.
  const visibleTransactions = transactions.filter((transaction) => !pendingDeleteIds.includes(transaction.id));
  const hiddenRows = transactions.filter((transaction) => pendingDeleteIds.includes(transaction.id));
  const shownTotals = transactionTotals
    ? {
        count: transactionTotals.count - hiddenRows.length,
        outflowPaise:
          transactionTotals.outflowPaise -
          hiddenRows.filter((row) => row.direction === "outflow").reduce((sum, row) => sum + row.amountPaise, 0),
        inflowPaise:
          transactionTotals.inflowPaise -
          hiddenRows.filter((row) => row.direction === "inflow").reduce((sum, row) => sum + row.amountPaise, 0)
      }
    : null;
  const exportParams = new URLSearchParams(
    Object.entries({
      accountId: selectedAccountId,
      search,
      typeId,
      subcategoryId,
      status: statusFilter,
      from: rangeIsValid ? from : "",
      to: rangeIsValid ? to : ""
    }).filter(([, value]) => Boolean(value))
  ).toString();

  function startRefund(transaction: Transaction) {
    setEditDraft(null);
    setRefundDraft({
      id: transaction.id,
      amount: amountInputFromPaise(transaction.amountPaise - transaction.refundedPaise),
      date: todayISO()
    });
  }

  // A refund is tied to its purchase, so it nets out of that purchase's SubType (and lowers a
  // card's outstanding) instead of showing up as income.
  async function saveRefund(transaction: Transaction) {
    if (!refundDraft) return;
    const amountPaise = parseAmountToPaise(refundDraft.amount);
    if (amountPaise <= 0) {
      showNotice("Enter the amount you got back.");
      return;
    }
    setSavingRefund(true);
    try {
      await Api.createTransaction({
        date: refundDraft.date,
        accountId: transaction.accountId,
        method: transaction.method,
        merchant: `Refund: ${transaction.merchant || transaction.note || "purchase"}`.slice(0, 160),
        typeId: REFUND_TYPE_ID,
        amountPaise,
        direction: "inflow",
        kind: "refund",
        linkedTransactionId: transaction.id
      });
      setRefundDraft(null);
      await loadPage();
      await refresh();
      showNotice(
        `Recorded a ${formatINR(amountPaise)} refund. ${transaction.subcategoryName ?? "The purchase's category"} spending is reduced by the same amount.`
      );
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Could not record the refund.");
    } finally {
      setSavingRefund(false);
    }
  }

  async function saveEdit() {
    if (!editDraft) return;
    const account = accounts.find((item) => item.id === editDraft.accountId);
    const amountPaise = parseAmountToPaise(editDraft.amount);

    if (!account || amountPaise <= 0) {
      showNotice("Choose an account and enter an amount greater than zero.");
      return;
    }

    setSavingEdit(true);
    try {
      const selectedType = categoryTypes.find((type) => type.id === editDraft.typeId);
      const behavior = selectedType?.behavior ?? behaviorForKind(editDraft.kind);
      const kind = kindForBehavior(behavior);
      await Api.updateTransaction(editDraft.id, {
        date: editDraft.date,
        accountId: editDraft.accountId,
        method: account.type === "credit_card" ? "credit_card" : editDraft.method,
        merchant: editDraft.merchant,
        note: editDraft.note,
        typeId: editDraft.typeId,
        subcategoryId: behavior === "card_payment" ? "" : editDraft.subcategoryId,
        amountPaise,
        direction: directionForBehavior(behavior),
        kind,
        transferAccountId:
          behavior === "card_payment" || editDraft.subcategoryId === SELF_TRANSFER_SUBCATEGORY_ID
            ? editDraft.transferAccountId
            : "",
        loanId: behavior === "loan" ? editDraft.loanId : "",
        loanPaymentType: behavior === "loan" && editDraft.loanId ? editDraft.loanPaymentType : undefined,
        subscriptionId:
          editDraft.subcategoryId === AUTOPAY_SUBCATEGORY_ID ? editDraft.subscriptionId : "",
        investmentId:
          editDraft.subcategoryId === MUTUAL_FUNDS_SUBCATEGORY_ID ? editDraft.investmentId : "",
        vacationId: behavior === "expense" ? editDraft.vacationId : ""
      });
      setEditDraft(null);
      await loadPage();
      await refresh();
      showNotice("Transaction updated.");
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Could not update transaction.");
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="page-grid transactions-page">
      <PageHeader
        title="Transactions"
        actions={
          <>
            <button type="button" className="secondary-action" onClick={() => setImportOpen(true)}>
              <FileSpreadsheet size={17} />
              Import transactions
            </button>
            <button type="button" className="primary-action" onClick={() => setAdding(true)}>
              <Plus size={17} />
              Add transaction
            </button>
          </>
        }
      />

      {adding && (
        <FormDialog title="Add transaction" wide onClose={() => setAdding(false)}>
          <TransactionEntryForm
            selectedAccountId={selectedAccountId}
            accounts={accounts}
            loans={loans}
            cardEmis={cardEmis}
            subscriptions={subscriptions}
            mutualFunds={mutualFunds}
            vacations={vacations}
            categoryTypes={categoryTypes}
            batchId={batchId}
            refresh={refresh}
            showNotice={showNotice}
            onDone={() => setAdding(false)}
            onCancel={() => setAdding(false)}
          />
        </FormDialog>
      )}

      {importOpen && (
        <ImportTransactionsModal
          batchId={batchId}
          onClose={() => setImportOpen(false)}
          onImported={async (count, details) => {
            setImportOpen(false);
            await refresh();
            const createdCount =
              (details?.createdAccounts?.length ?? 0) +
              (details?.createdTypes?.length ?? 0) +
              (details?.createdSubcategories?.length ?? 0);
            const limitWarning = details?.warnings?.some((warning) => warning.includes("credit limit"));
            const skippedDuplicateCount = details?.skippedDuplicateCount ?? 0;
            const affectedAccounts = details?.affectedAccounts ?? [];
            if (affectedAccounts.length === 1) {
              onAccountSelect(affectedAccounts[0].id);
            }
            showNotice(
              `Imported ${count} transaction${count === 1 ? "" : "s"}.` +
                (skippedDuplicateCount
                  ? ` Skipped ${skippedDuplicateCount} duplicate row${skippedDuplicateCount === 1 ? "" : "s"}.`
                  : "") +
                (createdCount ? ` Created ${createdCount} lookup item${createdCount === 1 ? "" : "s"}.` : "") +
                (limitWarning ? " Update new card limits in Accounts." : "")
            );
          }}
        />
      )}

      <div className="panel">
      <div className="panel-header toolbar-header">
        <div className="transactions-title">
          <h2>All transactions</h2>
        </div>
        <div className="toolbar filter-toolbar">
          <label className="search-box">
            <Search size={17} />
            <input
              placeholder="Search merchant or amount"
              aria-label="Search merchant, note, SubType or amount"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="secondary-action filters-toggle"
            aria-expanded={filtersOpen}
            aria-controls="transaction-filters"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <SlidersHorizontal size={16} />
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </button>
          <div id="transaction-filters" className={`filter-extra${filtersOpen ? " open" : ""}`}>
          <label className="control-field toolbar-control">
            <span className="control-label">Type</span>
            <select
              value={typeId}
              onChange={(event) => {
                setTypeId(event.target.value);
                setSubcategoryId("");
              }}
            >
              <option value="">All types</option>
              {categoryTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>
          <label className="control-field toolbar-control">
            <span className="control-label">SubType</span>
            <select
              value={subcategoryId}
              onChange={(event) => setSubcategoryId(event.target.value)}
              disabled={!selectedFilterType}
            >
              <option value="">All SubTypes</option>
              {(selectedFilterType?.subcategories ?? categories).map((subcategory) => (
                <option key={subcategory.id} value={subcategory.id}>
                  {subcategory.name}
                </option>
              ))}
            </select>
          </label>
          <label className="control-field toolbar-control">
            <span className="control-label">From</span>
            <input type="date" min={EARLIEST_DATE} max={LATEST_DATE} value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label className="control-field toolbar-control">
            <span className="control-label">To</span>
            <input type="date" min={EARLIEST_DATE} max={LATEST_DATE} value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
          <button
            onClick={() => {
              if (!rangeIsValid) {
                showNotice("Choose a valid date range.");
                return;
              }
              loadPage();
              setFiltersOpen(false);
            }}
          >
            Apply
          </button>
          </div>
          {hasActiveFilters && (
            <button type="button" className="secondary-action" onClick={clearFilters}>
              <RotateCcw size={16} />
              Clear filters
            </button>
          )}
        </div>
      </div>

      {statusFilter === "uncategorized" && (
        <div className="filter-chips">
          <button
            type="button"
            className="filter-chip"
            onClick={() => setStatusFilter("")}
            aria-label="Stop showing only uncategorized transactions"
          >
            Only uncategorized
            <X size={14} />
          </button>
          <span className="helper-text">Edit a row to give it a Type and SubType.</span>
        </div>
      )}

      <div className="ledger-result-summary">
        <span>
          Showing {visibleTransactions.length}
          {shownTotals && shownTotals.count > visibleTransactions.length ? ` of ${shownTotals.count}` : ""}{" "}
          transaction{(shownTotals?.count ?? visibleTransactions.length) === 1 ? "" : "s"}
          {selectedAccount ? ` for ${selectedAccount.name}` : ""}
        </span>
        {hasMoreTransactions && <small>More history available</small>}
      </div>

      {shownTotals && shownTotals.count > 0 && (
        <div className="ledger-totals" aria-live="polite">
          <span className="ledger-totals-label">
            {search.trim()
              ? `Total for “${search.trim()}”`
              : typeId || subcategoryId || from || to || selectedAccountId || statusFilter
                ? "Total for these filters"
                : "Total of all transactions"}
          </span>
          <span className="ledger-total">
            Money out <strong className="amount-out">{formatINR(shownTotals.outflowPaise)}</strong>
          </span>
          {shownTotals.inflowPaise > 0 && (
            <span className="ledger-total">
              Money in <strong className="amount-in">{formatINR(shownTotals.inflowPaise)}</strong>
            </span>
          )}
          {shownTotals.inflowPaise > 0 && shownTotals.outflowPaise > 0 && (
            <span className="ledger-total">
              Net{" "}
              <strong
                className={
                  shownTotals.inflowPaise - shownTotals.outflowPaise >= 0 ? "amount-in" : "amount-out"
                }
              >
                {signedImpact(shownTotals.inflowPaise - shownTotals.outflowPaise)}
              </strong>
            </span>
          )}
          <a
            className="secondary-action ledger-export"
            href={`/api/export/transactions.csv${exportParams ? `?${exportParams}` : ""}`}
            download
          >
            <Download size={16} />
            Export CSV
          </a>
        </div>
      )}

      {/* Only once something is ticked: an empty bar would be a permanent invitation to delete. */}
      {visibleSelectedIds().length > 0 && (
        <div className="selection-bar" role="region" aria-label="Selected transactions">
          <label className="transaction-select">
            <input
              type="checkbox"
              checked={visibleSelectedIds().length === visibleTransactions.length}
              onChange={(event) =>
                setSelectedIds(event.target.checked ? visibleTransactions.map((item) => item.id) : [])
              }
              aria-label="Select every transaction shown"
            />
          </label>
          <strong>
            {visibleSelectedIds().length} selected
            {visibleSelectedIds().length === visibleTransactions.length ? " (all shown)" : ""}
          </strong>
          <button type="button" className="secondary-action" onClick={() => setSelectedIds([])}>
            Clear
          </button>
          <button
            type="button"
            className="secondary-action danger-action"
            onClick={deleteSelected}
            disabled={deletingSelection}
          >
            <Trash2 size={16} />
            {deletingSelection ? "Deleting…" : "Delete selected"}
          </button>
        </div>
      )}

      <div className="ledger-list">
        {loadingTransactions && visibleTransactions.length === 0 ? (
          <PanelLoader label="Loading transactions" />
        ) : visibleTransactions.length === 0 ? (
          <EmptyState text="No matching transactions." />
        ) : (
          groupTransactionsByDay(visibleTransactions).map((day) => (
            <section className="ledger-day" key={day.date}>
              {/* One heading a day, carrying what the rows below it add up to. The rows no
                  longer each repeat the date. */}
              <h3 className="ledger-day-heading">
                <span className="ledger-day-date">{formatDayHeading(day.date)}</span>
                <span className="ledger-day-count">
                  {day.items.length} {day.items.length === 1 ? "transaction" : "transactions"}
                </span>
                <strong className={`ledger-day-net ${day.netPaise < 0 ? "amount-out" : "amount-in"}`}>
                  {signedAmount(Math.abs(day.netPaise), day.netPaise < 0 ? "outflow" : "inflow")}
                </strong>
              </h3>
              {day.items.map((transaction) => {
            const typeCategory = typeCategoryFromTransaction(transaction);
            const subTypeCategory = categoryFromTransaction(transaction);
            return (
              <div className="ledger-item" key={transaction.id}>
                {editDraft?.id === transaction.id ? (
                  <TransactionEditRow
                    draft={editDraft}
                    vacations={vacations}
                    accounts={accounts}
                    loans={loans}
                    subscriptions={subscriptions}
                    mutualFunds={mutualFunds}
                    categoryTypes={categoryTypes}
                    cardAccounts={cardAccounts}
                    saving={savingEdit}
                    onChange={setEditDraft}
                    onCancel={() => setEditDraft(null)}
                    onSave={saveEdit}
                    onDelete={() => remove(transaction)}
                  />
                ) : (
                  <LedgerRow
                    transaction={transaction}
                    subTypeCategory={subTypeCategory}
                    typeCategory={typeCategory}
                    selected={selectedIds.includes(transaction.id)}
                    onToggleSelected={() => toggleSelected(transaction.id)}
                    onRefund={canRefund(transaction) ? () => startRefund(transaction) : undefined}
                    onAddAgain={canAddAgain(transaction) ? () => void addAgain(transaction) : undefined}
                    onEdit={() => setEditDraft(draftFromTransaction(transaction, categoryTypes, accounts))}
                  />
                )}
                {refundDraft?.id === transaction.id && (
                  <form
                    className="refund-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void saveRefund(transaction);
                    }}
                  >
                    <strong>Refund for {transaction.merchant || "this purchase"}</strong>
                    <label className="control-field">
                      <span className="control-label">Amount back</span>
                      <input
                        inputMode="decimal"
                        value={refundDraft.amount}
                        onChange={(event) => setRefundDraft({ ...refundDraft, amount: event.target.value })}
                        autoFocus
                      />
                    </label>
                    <label className="control-field">
                      <span className="control-label">Date</span>
                      <input
                        type="date"
                        value={refundDraft.date}
                        onChange={(event) => setRefundDraft({ ...refundDraft, date: event.target.value })}
                        min={EARLIEST_DATE}
                        max={todayISO()}
                      />
                    </label>
                    <div className="refund-form-actions">
                      <button type="submit" className="primary-action" disabled={savingRefund}>
                        {savingRefund ? "Saving..." : "Save refund"}
                      </button>
                      <button type="button" className="secondary-action" onClick={() => setRefundDraft(null)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            );
              })}
            </section>
          ))
        )}
      </div>
      {visibleTransactions.length > 0 && (
        <div className="ledger-pagination">
          <span>
            {hasMoreTransactions
              ? `Showing latest ${visibleTransactions.length}. Use More to load older transactions.`
              : visibleTransactions.length === 1
                ? "That's the only matching transaction."
                : `Showing all ${visibleTransactions.length} matching transactions.`}
          </span>
          {hasMoreTransactions && (
            <button className="secondary-action" onClick={loadMore} disabled={loadingMoreTransactions}>
              {loadingMoreTransactions ? "Loading..." : "More"}
            </button>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

/* One line of the ledger. Its five parts -- the tick, the item, its tags, the amount and the
   actions -- each get a track of their own, so none of them is pushed onto a second row. */
function LedgerRow({
  transaction,
  subTypeCategory,
  typeCategory,
  selected,
  onToggleSelected,
  onRefund,
  onAddAgain,
  onEdit
}: {
  transaction: Transaction;
  subTypeCategory: Category;
  typeCategory: Category;
  selected: boolean;
  onToggleSelected: () => void;
  onRefund?: () => void;
  onAddAgain?: () => void;
  onEdit: () => void;
}) {
  return (
    <div className={`ledger-row transaction-row-card${selected ? " selected" : ""}`}>
      <label className="transaction-select">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelected}
          aria-label={`Select ${transaction.merchant || transaction.note || "transaction"} of ${formatINR(transaction.amountPaise)} on ${formatShortDate(transaction.date)}`}
        />
      </label>
      <div className="transaction-primary-cell">
        <strong>{transaction.merchant || transaction.note || "Untitled transaction"}</strong>
        {/* The date is on the day's heading above; repeating it on every row said the same
            thing a dozen times down a page. What is left is how the money moved. */}
        <span>{methodLabel(transaction.method)}</span>
      </div>
      <div className="transaction-tag-strip" aria-label="Transaction tags">
        <TransactionTag
          tone="account"
          icon={accountIconForType(transaction.accountType, 13)}
          label={transaction.accountName}
        />
        <TransactionTag
          tone="subtype"
          icon={<IconGlyph name={subTypeCategory.icon} size={13} />}
          label={subTypeCategory.name}
          title={`${typeCategory.name}: ${subTypeCategory.name}`}
          color={subTypeCategory.color}
        />
      </div>
      <strong className={`transaction-amount-cell ${transaction.direction === "inflow" ? "amount-in" : "amount-out"}`}>
        {signedAmount(transaction.amountPaise, transaction.direction)}
        {transaction.refundedPaise > 0 && (
          <small className="refunded-note">
            {transaction.refundedPaise >= transaction.amountPaise
              ? "Fully refunded"
              : `${formatINR(transaction.refundedPaise)} refunded`}
          </small>
        )}
      </strong>
      <div className="row-actions">
        {onRefund && (
          <button
            type="button"
            className="secondary-action row-icon-action"
            onClick={onRefund}
            title="Refund: record money you got back for this"
            aria-label={`Record a refund for ${transaction.merchant || "this transaction"}`}
          >
            <RotateCcw size={16} />
          </button>
        )}
        {onAddAgain && (
          <button
            type="button"
            className="secondary-action row-icon-action"
            onClick={onAddAgain}
            title="Add again with today's date"
            aria-label={`Add ${transaction.merchant || "this transaction"} again with today's date`}
          >
            <Plus size={16} />
          </button>
        )}
        <button className="secondary-action row-edit-action" onClick={onEdit}>
          <Pencil size={16} />
          Edit
        </button>
      </div>
    </div>
  );
}

function TransactionEditRow({
  draft,
  accounts,
  loans,
  subscriptions,
  mutualFunds,
  vacations,
  categoryTypes,
  cardAccounts,
  saving,
  onChange,
  onCancel,
  onSave,
  onDelete
}: {
  draft: TransactionEditDraft;
  accounts: Account[];
  loans: Loan[];
  subscriptions: AutopaySubscription[];
  mutualFunds: Investment[];
  vacations: Vacation[];
  categoryTypes: CategoryType[];
  cardAccounts: Account[];
  saving: boolean;
  onChange: (draft: TransactionEditDraft) => void;
  onCancel: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const selectedAccount = accounts.find((account) => account.id === draft.accountId);
  const selectedType = categoryTypes.find((type) => type.id === draft.typeId);
  const behavior = selectedType?.behavior ?? behaviorForKind(draft.kind);
  const availableSubcategories = selectedType?.subcategories ?? [];
  const availableLoans = loans.filter((loan) => loan.subcategoryId === draft.subcategoryId);
  const isAutopaySelected = draft.subcategoryId === AUTOPAY_SUBCATEGORY_ID;
  const isMutualFundsSelected = draft.subcategoryId === MUTUAL_FUNDS_SUBCATEGORY_ID;
  const isExpenseSelected = behavior === "expense";
  const isSelfTransferSelected = draft.subcategoryId === SELF_TRANSFER_SUBCATEGORY_ID;
  const selfTransferTargets = selfTransferTargetAccounts(accounts, draft.accountId);
  const availableSubscriptions = subscriptions.filter(
    (subscription) => subscription.status === "active" || subscription.id === draft.subscriptionId
  );

  return (
    <div className="transaction-edit-row">
      <div className="transaction-edit-grid">
        <label>
          Date
          <input
            type="date" min={EARLIEST_DATE} max={todayISO()}
            value={draft.date}
            onChange={(event) => onChange({ ...draft, date: event.target.value })}
          />
        </label>
        <label>
          Account
          <select
            value={draft.accountId}
            onChange={(event) => {
              const nextAccount = accounts.find((account) => account.id === event.target.value);
              onChange({
                ...draft,
                accountId: event.target.value,
                method: nextAccount?.type === "credit_card" ? "credit_card" : draft.method,
                transferAccountId:
                  isSelfTransferSelected && draft.transferAccountId === event.target.value
                    ? ""
                    : draft.transferAccountId
              });
            }}
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Type
          <select
            value={draft.typeId}
            onChange={(event) => {
              onChange({
                ...draft,
                typeId: event.target.value,
                subcategoryId: "",
                transferAccountId: cardAccounts[0]?.id ?? "",
                loanId: "",
                loanPaymentType: "emi",
                subscriptionId: "",
                investmentId: "",
                vacationId: ""
              });
            }}
          >
            <option value="">No Type</option>
            {categoryTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Method
          <select
            value={selectedAccount?.type === "credit_card" ? "credit_card" : draft.method}
            disabled={selectedAccount?.type === "credit_card"}
            onChange={(event) => onChange({ ...draft, method: event.target.value as PaymentMethod })}
          >
            <option value="upi">UPI</option>
            <option value="credit_card">Credit card</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="cash">Cash</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          Merchant
          <input
            value={draft.merchant}
            onChange={(event) => onChange({ ...draft, merchant: event.target.value })}
            placeholder="Merchant"
          />
        </label>
        <label>
          Note
          <input
            value={draft.note}
            onChange={(event) => onChange({ ...draft, note: event.target.value })}
            placeholder="Optional note"
          />
        </label>
        <label>
          SubType
          {behavior === "card_payment" ? (
            <select
              value={draft.transferAccountId}
              onChange={(event) => onChange({ ...draft, transferAccountId: event.target.value })}
            >
              <option value="">Choose card</option>
              {cardAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          ) : (
            <select
              value={draft.subcategoryId}
              onChange={(event) =>
                onChange({
                  ...draft,
                  subcategoryId: event.target.value,
                  transferAccountId: "",
                  loanId: "",
                  subscriptionId: "",
                  investmentId: ""
                })
              }
              disabled={!selectedType}
            >
              <option value="">Decide later</option>
              {availableSubcategories.map((subcategory) => (
                <option key={subcategory.id} value={subcategory.id}>
                  {subcategory.name}
                </option>
              ))}
            </select>
          )}
        </label>
        {behavior === "card_payment" && draft.cardEmiPaise > 0 && (
          /* An edit must not silently drop what this payment settled, so the installments under it
             are left alone and only stated here. Changing which EMIs a payment covered means
             recording the payment again -- the one case where that is simpler than an edit. */
          <p className="card-emi-settle-note">
            Settles {formatINR(draft.cardEmiPaise)} of EMIs on this card. Delete and re-add the payment to
            change which EMIs it covers.
          </p>
        )}
        {isSelfTransferSelected && (
          <label>
            Account
            <select
              value={draft.transferAccountId}
              onChange={(event) => onChange({ ...draft, transferAccountId: event.target.value })}
            >
              <option value="">Choose account</option>
              {selfTransferTargets.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {isAutopaySelected && (
          <label>
            Subscription
            <select
              value={draft.subscriptionId}
              onChange={(event) => onChange({ ...draft, subscriptionId: event.target.value })}
            >
              <option value="">Not linked yet</option>
              {availableSubscriptions.map((subscription) => (
                <option key={subscription.id} value={subscription.id}>
                  {subscription.name} · {formatINR(subscription.amountPaise)}
                </option>
              ))}
            </select>
          </label>
        )}
        {isMutualFundsSelected && (
          <label>
            Mutual fund
            <select
              value={draft.investmentId}
              onChange={(event) => onChange({ ...draft, investmentId: event.target.value })}
            >
              <option value="">Not linked yet</option>
              {mutualFunds.map((fund) => (
                <option key={fund.id} value={fund.id}>
                  {fund.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {isExpenseSelected && vacations.length > 0 && (
          <label className="vacation-check">
            <input
              type="checkbox"
              checked={Boolean(draft.vacationId)}
              onChange={(event) =>
                onChange({ ...draft, vacationId: event.target.checked ? draft.vacationId || vacations[0].id : "" })
              }
            />
            <span>Part of a vacation?</span>
          </label>
        )}
        {isExpenseSelected && vacations.length > 0 && draft.vacationId && (
          <label>
            Vacation
            <select
              value={draft.vacationId}
              onChange={(event) => onChange({ ...draft, vacationId: event.target.value })}
            >
              {vacations.map((vacation) => (
                <option key={vacation.id} value={vacation.id}>
                  {vacation.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {behavior === "loan" && (
          <>
            <label>
              Linked loan
              <select
                value={draft.loanId}
                onChange={(event) => onChange({ ...draft, loanId: event.target.value })}
                disabled={!draft.subcategoryId}
              >
                <option value="">Not linked yet</option>
                {availableLoans.map((loan) => (
                  <option key={loan.id} value={loan.id}>
                    {loan.name} · {formatINR(loan.outstandingPaise)} outstanding
                  </option>
                ))}
              </select>
            </label>
            <label>
              Payment type
              <select
                value={draft.loanPaymentType}
                onChange={(event) => onChange({ ...draft, loanPaymentType: event.target.value as LoanPaymentType })}
                disabled={!draft.loanId}
              >
                <option value="emi">EMI</option>
                <option value="prepayment">Prepayment</option>
              </select>
            </label>
          </>
        )}
        <label>
          Amount
          <input
            value={draft.amount}
            onChange={(event) => onChange({ ...draft, amount: event.target.value })}
            inputMode="decimal"
            placeholder="₹0"
          />
        </label>
      </div>
      <div className="transaction-edit-actions">
        <button className="secondary-action danger-action" onClick={onDelete}>
          <Trash2 size={16} />
          Delete
        </button>
        <span />
        <button className="secondary-action" onClick={onCancel}>
          Cancel
        </button>
        <button className="primary-action" onClick={onSave} disabled={saving}>
          <Check size={16} />
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}

function ImportTransactionsModal({
  batchId,
  onClose,
  onImported
}: {
  batchId: string;
  onClose: () => void;
  onImported: (
    count: number,
    details?: {
      createdAccounts?: string[];
      createdTypes?: string[];
      createdSubcategories?: string[];
      affectedAccounts?: Array<{ id: string; name: string }>;
      skippedDuplicateCount?: number;
      warnings?: string[];
    }
  ) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [working, setWorking] = useState(false);
  const [errors, setErrors] = useState<Array<{ row: number; message: string }>>([]);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      setMessage("Choose an Excel .xlsx file first.");
      return;
    }

    setWorking(true);
    setErrors([]);
    setMessage("");
    try {
      const result = await Api.importTransactions(file, batchId);
      if (result.errors.length > 0) {
        setErrors(result.errors);
        setMessage("Fix the rows below and upload again. No transactions were imported.");
        return;
      }
      await onImported(result.insertedCount, {
        createdAccounts: result.createdAccounts,
        createdTypes: result.createdTypes,
        createdSubcategories: result.createdSubcategories,
        affectedAccounts: result.affectedAccounts,
        skippedDuplicateCount: result.skippedDuplicateCount,
        warnings: result.warnings
      });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not import transactions.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="import-modal" onSubmit={submit} role="dialog" aria-modal="true">
        <div className="modal-title-row">
          <div>
            <h2>Import transactions</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} title="Close">
            X
          </button>
        </div>

        <a className="secondary-action import-template-link" href={Api.importTemplateUrl()}>
          <Download size={17} />
          Download sample Excel template
        </a>

        <label className="file-upload">
          <Upload size={20} />
          <span>{file ? file.name : "Choose filled .xlsx file"}</span>
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>

        {message && <p className={errors.length > 0 ? "form-error" : "helper-text"}>{message}</p>}
        {errors.length > 0 && (
          <div className="import-errors">
            {errors.slice(0, 8).map((error) => (
              <div key={`${error.row}-${error.message}`}>
                <strong>Row {error.row}</strong>
                <span>{error.message}</span>
              </div>
            ))}
            {errors.length > 8 && <p className="helper-text">{errors.length - 8} more row errors.</p>}
          </div>
        )}

        <div className="confirm-actions">
          <button type="button" className="secondary-action" onClick={onClose} disabled={working}>
            Cancel
          </button>
          <button className="primary-action" disabled={working}>
            <Upload size={16} />
            {working ? "Importing..." : "Import"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ReportsPage({
  selectedAccountId,
  categoryTypes,
  refreshKey,
  onNavigate
}: {
  selectedAccountId: string;
  categoryTypes: CategoryType[];
  refreshKey: number;
  onNavigate: Navigate;
}) {
  const initialMonth = currentMonth();
  const [from, setFrom] = useState(`${initialMonth}-01`);
  const [to, setTo] = useState(monthEndForInput(initialMonth));
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [reportError, setReportError] = useState("");
  const [reportRetryKey, setReportRetryKey] = useState(0);
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const rangeIsValid = from <= to;
  const trendTypes = categoryTypes.filter((type) => type.behavior !== "card_payment");
  const [trendMode, setTrendMode] = useState<TrendMode>("month");
  const [trendMonth, setTrendMonth] = useState(initialMonth);
  const [trendStyle, setTrendStyle] = useState<"bar" | "line">("bar");
  const trendMonthOptions = useMemo(() => recentMonthOptions(initialMonth, 12), [initialMonth]);
  const [trendTypeId, setTrendTypeId] = useState(
    () => trendTypes.find((type) => type.behavior === "expense")?.id ?? trendTypes[0]?.id ?? ""
  );
  const [trend, setTrend] = useState<TrendReport | null>(null);
  const [trendError, setTrendError] = useState("");

  const budgetSubcategories = useMemo(
    () =>
      categoryTypes
        .filter((type) => type.behavior === "expense")
        .flatMap((type) =>
          type.subcategories.map((subcategory) => ({
            id: subcategory.id,
            label: subcategory.name
          }))
        ),
    [categoryTypes]
  );
  const [budgetMode, setBudgetMode] = useState<TrendMode>("month");
  const [budgetMonth, setBudgetMonth] = useState(initialMonth);
  const [budgetStyle, setBudgetStyle] = useState<"bar" | "line">("bar");
  const [budgetSubId, setBudgetSubId] = useState(
    () =>
      budgetSubcategories.find((item) => /grocer/i.test(item.label))?.id ??
      budgetSubcategories[0]?.id ??
      ""
  );
  const [budgetTrend, setBudgetTrend] = useState<BudgetTrendReport | null>(null);
  const [budgetTrendError, setBudgetTrendError] = useState("");

  useEffect(() => {
    if (trendTypeId && trendTypes.some((type) => type.id === trendTypeId)) return;
    setTrendTypeId(trendTypes[0]?.id ?? "");
  }, [trendTypes, trendTypeId]);

  useEffect(() => {
    if (budgetSubId && budgetSubcategories.some((item) => item.id === budgetSubId)) return;
    setBudgetSubId(budgetSubcategories[0]?.id ?? "");
  }, [budgetSubcategories, budgetSubId]);

  useEffect(() => {
    if (!budgetSubId) {
      setBudgetTrend(null);
      return;
    }
    let active = true;
    setBudgetTrend(null);
    setBudgetTrendError("");
    Api.budgetTrend(budgetSubId, budgetMode, selectedAccountId || undefined, budgetMonth)
      .then((next) => {
        if (active) setBudgetTrend(next);
      })
      .catch((error: unknown) => {
        if (active) setBudgetTrendError(error instanceof Error ? error.message : "Could not load the budget trend.");
      });
    return () => {
      active = false;
    };
  }, [budgetSubId, budgetMode, budgetMonth, selectedAccountId, refreshKey]);

  useEffect(() => {
    if (!trendTypeId) {
      setTrend(null);
      return;
    }
    let active = true;
    setTrend(null);
    setTrendError("");
    Api.trendReport(trendTypeId, trendMode, selectedAccountId || undefined, trendMonth)
      .then((next) => {
        if (active) setTrend(next);
      })
      .catch((error: unknown) => {
        if (active) setTrendError(error instanceof Error ? error.message : "Could not load the trend.");
      });
    return () => {
      active = false;
    };
  }, [trendTypeId, trendMode, trendMonth, selectedAccountId, refreshKey]);

  useEffect(() => {
    if (!rangeIsValid) {
      setReport(null);
      setReportError("");
      return;
    }

    let active = true;
    setReport(null);
    setReportError("");
    Api.monthlyReport(selectedAccountId || undefined, from.slice(0, 7), from, to)
      .then((nextReport) => {
        if (active) setReport(nextReport);
      })
      .catch((error: unknown) => {
        if (active) {
          setReportError(error instanceof Error ? error.message : "Could not load this report.");
        }
      });

    return () => {
      active = false;
    };
  }, [from, rangeIsValid, reportRetryKey, selectedAccountId, refreshKey, to]);

  useEffect(() => {
    if (!report?.types.length) {
      setSelectedTypeId("");
      return;
    }
    if (!selectedTypeId || !report.types.some((type) => type.typeId === selectedTypeId)) {
      setSelectedTypeId(report.types[0].typeId);
    }
  }, [report, selectedTypeId]);

  const selectedType = report?.types.find((type) => type.typeId === selectedTypeId) ?? report?.types[0];
  const trendModeLabels: Record<TrendMode, string> = {
    week: "Week on week",
    month: "Month on month",
    year: "Year on year"
  };

  return (
    <div className="page-grid">
      <Panel
        title="Category Report"
        action={
          <div className="report-filters">
            <label>
              From
              <input type="date" min={EARLIEST_DATE} max={LATEST_DATE} value={from} onChange={(event) => setFrom(event.target.value)} />
            </label>
            <label>
              To
              <input type="date" min={EARLIEST_DATE} max={LATEST_DATE} value={to} onChange={(event) => setTo(event.target.value)} />
            </label>
          </div>
        }
      >
        <ReportPeriodBar
          from={from}
          to={to}
          onChange={(nextFrom, nextTo) => {
            setFrom(nextFrom);
            setTo(nextTo);
          }}
        />
        {!rangeIsValid ? (
          <EmptyState text="Choose a valid date range." />
        ) : reportError ? (
          <div className="stacked-empty-state">
            <EmptyState text={reportError} />
            <button type="button" className="secondary-action" onClick={() => setReportRetryKey((key) => key + 1)}>
              <RotateCcw size={17} />
              Retry
            </button>
          </div>
        ) : !report ? (
          <PanelLoader label="Loading report" />
        ) : (
          <>
            <p className="helper-text report-range">
              {formatShortDate(report.start)} to {formatShortDate(report.end)}
            </p>
            <CashflowSummary types={report.types} />
            <div className="report-chart-grid">
              <OutflowMixChart
                types={report.types}
                onTypeClick={(typeId) => onNavigate("transactions", { typeId, from: report.start, to: report.end })}
              />
              <ReportTypeAnalytics
                types={report.types}
                selectedTypeId={selectedType?.typeId ?? ""}
                onSelect={setSelectedTypeId}
                onSubTypeClick={(typeId, subcategoryId) =>
                  onNavigate("transactions", { typeId, subcategoryId, from: report.start, to: report.end })
                }
              />
            </div>
          </>
        )}
      </Panel>

      <div className="report-panel-pair">
      <Panel title="Trends">
        <div className="trend-controls">
          <label className="control-field toolbar-control trend-mode-control">
            <span className="control-label">Period</span>
            <select value={trendMode} onChange={(event) => setTrendMode(event.target.value as TrendMode)}>
              {(["week", "month", "year"] as TrendMode[]).map((mode) => (
                <option key={mode} value={mode}>
                  {trendModeLabels[mode]}
                </option>
              ))}
            </select>
          </label>
          {trendMode === "week" && (
            <label className="control-field toolbar-control trend-month-control">
              <span className="control-label">Month</span>
              <select value={trendMonth} onChange={(event) => setTrendMonth(event.target.value)}>
                {trendMonthOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="control-field toolbar-control trend-style-control">
            <span className="control-label">Chart</span>
            <select value={trendStyle} onChange={(event) => setTrendStyle(event.target.value as "bar" | "line")}>
              <option value="bar">Bar</option>
              <option value="line">Line</option>
            </select>
          </label>
          <label className="control-field toolbar-control trend-type-control">
            <span className="control-label">Type</span>
            <select value={trendTypeId} onChange={(event) => setTrendTypeId(event.target.value)}>
              {trendTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {trendError ? (
          <EmptyState text={trendError} />
        ) : !trendTypeId ? (
          <EmptyState text="Add a Type in Categories to see trends." />
        ) : !trend ? (
          <PanelLoader label="Loading trend" />
        ) : trend.points.every((point) => point.amountPaise === 0) ? (
          <EmptyState
            text={
              trendMode === "week"
                ? `No ${trend.typeName} recorded in ${formatMonth(trendMonth)}.`
                : `No ${trend.typeName} recorded ${trendMode === "month" ? "this year" : "yet"}.`
            }
          />
        ) : (
          <>
            <p className="helper-text trend-caption">
              {trend.typeName} ·{" "}
              {trendMode === "week"
                ? `${formatMonth(trendMonth)}, by week`
                : trendMode === "month"
                  ? `${new Date().getFullYear()}, January to date`
                  : "by year"}
            </p>
            {/* Budget vs actual carries a legend here; this holds the same row open so the
                two charts start on the same line. */}
            <div className="trend-legend-slot" aria-hidden="true" />
            <TrendChart points={trend.points} variant={trendStyle} color={trend.color} />
          </>
        )}
      </Panel>

      <Panel title="Budget vs actual">
        <div className="trend-controls">
          <label className="control-field toolbar-control trend-mode-control">
            <span className="control-label">Period</span>
            <select value={budgetMode} onChange={(event) => setBudgetMode(event.target.value as TrendMode)}>
              {(["week", "month", "year"] as TrendMode[]).map((mode) => (
                <option key={mode} value={mode}>
                  {trendModeLabels[mode]}
                </option>
              ))}
            </select>
          </label>
          {budgetMode === "week" && (
            <label className="control-field toolbar-control trend-month-control">
              <span className="control-label">Month</span>
              <select value={budgetMonth} onChange={(event) => setBudgetMonth(event.target.value)}>
                {trendMonthOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="control-field toolbar-control trend-style-control">
            <span className="control-label">Chart</span>
            <select value={budgetStyle} onChange={(event) => setBudgetStyle(event.target.value as "bar" | "line")}>
              <option value="bar">Bar</option>
              <option value="line">Line</option>
            </select>
          </label>
          <label className="control-field toolbar-control trend-type-control">
            <span className="control-label">SubType</span>
            <select value={budgetSubId} onChange={(event) => setBudgetSubId(event.target.value)}>
              {budgetSubcategories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {budgetTrendError ? (
          <EmptyState text={budgetTrendError} />
        ) : budgetSubcategories.length === 0 ? (
          <EmptyState text="Add a budgetable SubType in Categories to compare against budgets." />
        ) : !budgetSubId ? (
          <EmptyState text="Choose a SubType to compare against its budget." />
        ) : !budgetTrend ? (
          <PanelLoader label="Loading budget trend" />
        ) : budgetTrend.points.every((point) => point.actualPaise === 0 && (point.budgetPaise ?? 0) === 0) ? (
          <EmptyState
            text={
              budgetMode === "week"
                ? `No ${budgetTrend.name} activity or budget in ${formatMonth(budgetMonth)}.`
                : `No ${budgetTrend.name} activity or budget recorded yet.`
            }
          />
        ) : (
          <>
            <p className="helper-text trend-caption">
              {budgetTrend.name} ·{" "}
              {budgetMode === "week"
                ? `${formatMonth(budgetMonth)}, by week`
                : budgetMode === "month"
                  ? `${new Date().getFullYear()}, January to date`
                  : "by year"}
            </p>
            <BudgetTrendLegend />
            <BudgetTrendChart points={budgetTrend.points} variant={budgetStyle} />
          </>
        )}
      </Panel>
      </div>
    </div>
  );
}

function BudgetTrendLegend() {
  return (
    <div className="budget-trend-legend">
      <span className="budget-trend-legend-item">
        <span className="budget-trend-swatch within" />
        Within budget
      </span>
      <span className="budget-trend-legend-item">
        <span className="budget-trend-swatch over" />
        Over budget
      </span>
      <span className="budget-trend-legend-item">
        <span className="budget-trend-swatch budget-line" />
        Budget
      </span>
    </div>
  );
}

function BudgetTrendChart({
  points,
  variant
}: {
  points: BudgetTrendPoint[];
  variant: "bar" | "line";
}) {
  // Uniform: green when within budget, red when over. No per-subtype colours.
  const withinColor = "#16a34a";
  const overColor = "#dc2626";
  const width = 760;
  const height = 360;
  const pad = { top: 30, right: 14, bottom: 32, left: 52 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const max = Math.max(
    ...points.map((point) => point.actualPaise),
    ...points.map((point) => point.budgetPaise ?? 0),
    1
  );
  const step = innerWidth / points.length;
  const baseline = pad.top + innerHeight;
  const yFor = (value: number) => baseline - (value / max) * innerHeight;
  // Distinct budget levels, shown as amber value ticks on the Y axis.
  const budgetLevels = [...new Set(points.map((point) => point.budgetPaise).filter((value): value is number => value !== null && value > 0))];

  const centers = points.map((point, index) => {
    const over = point.budgetPaise !== null && point.actualPaise > point.budgetPaise;
    return {
      ...point,
      over,
      x: pad.left + step * index + step / 2,
      y: yFor(point.actualPaise),
      budgetY: point.budgetPaise === null ? null : yFor(point.budgetPaise)
    };
  });

  // Budget threshold as a continuous stepped line spanning the whole timeline: a flat
  // dashed line while the budget is stable, stepping up/down at the boundary wherever
  // the monthly budget changes. Runs break around periods with no budget set.
  const budgetPaths: string[] = [];
  let run: Array<[number, number]> = [];
  const flushRun = () => {
    if (run.length) budgetPaths.push(run.map(([x, y]) => `${x},${y}`).join(" "));
    run = [];
  };
  centers.forEach((point, index) => {
    if (point.budgetY === null) {
      flushRun();
      return;
    }
    const left = pad.left + step * index;
    const right = pad.left + step * (index + 1);
    if (run.length === 0) {
      run.push([left, point.budgetY]);
    } else if (run[run.length - 1][1] !== point.budgetY) {
      run.push([left, point.budgetY]); // vertical step at the period boundary
    }
    run.push([right, point.budgetY]);
  });
  flushRun();

  return (
    <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Budget versus actual chart">
      {[0.25, 0.5, 0.75].map((fraction) => (
        <line
          key={fraction}
          className="trend-gridline"
          x1={pad.left}
          x2={width - pad.right}
          y1={baseline - innerHeight * fraction}
          y2={baseline - innerHeight * fraction}
        />
      ))}
      <line className="trend-axis" x1={pad.left} x2={width - pad.right} y1={baseline} y2={baseline} />

      <text className="trend-axis-zero" x={pad.left - 7} y={baseline + 4} textAnchor="end">
        ₹0
      </text>
      {budgetLevels.map((value) => (
        <g key={`y-budget-${value}`}>
          <line className="budget-axis-tick" x1={pad.left - 4} x2={pad.left} y1={yFor(value)} y2={yFor(value)} />
          <text className="budget-axis-label" x={pad.left - 7} y={yFor(value) + 4} textAnchor="end">
            {compactINR(value)}
          </text>
        </g>
      ))}

      {variant === "bar" ? (
        centers.map((point) => {
          const barWidth = Math.min(step * 0.55, 52);
          const barHeight = Math.max(baseline - point.y, point.actualPaise > 0 ? 2 : 0);
          return (
            <g key={point.label}>
              <title>{`${point.label}: ${formatINR(point.actualPaise)}${
                point.budgetPaise !== null ? ` of ${formatINR(point.budgetPaise)} budget` : ""
              }`}</title>
              <rect
                x={point.x - barWidth / 2}
                y={baseline - barHeight}
                width={barWidth}
                height={barHeight}
                rx={5}
                fill={point.over ? overColor : withinColor}
              />
            </g>
          );
        })
      ) : (
        <>
          <polyline
            className="trend-line"
            stroke={withinColor}
            points={centers.map((point) => `${point.x},${point.y}`).join(" ")}
          />
          {centers.map((point) => (
            <g key={point.label}>
              <title>{`${point.label}: ${formatINR(point.actualPaise)}${
                point.budgetPaise !== null ? ` of ${formatINR(point.budgetPaise)} budget` : ""
              }`}</title>
              <circle cx={point.x} cy={point.y} r={4.5} fill={point.over ? overColor : withinColor} />
            </g>
          ))}
        </>
      )}

      {budgetPaths.map((pointList, index) => (
        <polyline key={`budget-${index}`} className="budget-threshold-line" points={pointList} />
      ))}

      {centers.map((point) => (
        <g key={`labels-${point.label}`}>
          {point.actualPaise > 0 && (
            <text
              className={`trend-value ${point.over ? "over" : ""}`}
              x={point.x}
              y={point.y - 9}
              textAnchor="middle"
            >
              {compactINR(point.actualPaise)}
            </text>
          )}
          <text className="trend-label" x={point.x} y={height - 10} textAnchor="middle">
            {point.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function compactINR(paise: number) {
  const rupees = paise / 100;
  if (rupees >= 10000000) return `₹${(rupees / 10000000).toFixed(1).replace(/\.0$/, "")}Cr`;
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(1).replace(/\.0$/, "")}L`;
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `₹${Math.round(rupees)}`;
}

function boundedPercent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

function TrendChart({
  points,
  variant,
  color
}: {
  points: TrendPoint[];
  variant: "bar" | "line";
  color: string;
}) {
  const width = 760;
  const height = 360;
  const pad = { top: 30, right: 14, bottom: 32, left: 14 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const max = Math.max(...points.map((point) => point.amountPaise), 1);
  const step = innerWidth / points.length;
  const baseline = pad.top + innerHeight;

  const centers = points.map((point, index) => ({
    ...point,
    x: pad.left + step * index + step / 2,
    y: baseline - (point.amountPaise / max) * innerHeight
  }));

  return (
    <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Trend chart">
      {[0.25, 0.5, 0.75].map((fraction) => (
        <line
          key={fraction}
          className="trend-gridline"
          x1={pad.left}
          x2={width - pad.right}
          y1={baseline - innerHeight * fraction}
          y2={baseline - innerHeight * fraction}
        />
      ))}
      <line className="trend-axis" x1={pad.left} x2={width - pad.right} y1={baseline} y2={baseline} />

      {variant === "bar" ? (
        centers.map((point) => {
          const barWidth = Math.min(step * 0.55, 52);
          const barHeight = Math.max(baseline - point.y, point.amountPaise > 0 ? 2 : 0);
          return (
            <g key={point.label}>
              <title>{`${point.label}: ${formatINR(point.amountPaise)}`}</title>
              <rect
                x={point.x - barWidth / 2}
                y={baseline - barHeight}
                width={barWidth}
                height={barHeight}
                rx={5}
                fill={color}
              />
            </g>
          );
        })
      ) : (
        <>
          <polyline
            className="trend-line"
            stroke={color}
            points={centers.map((point) => `${point.x},${point.y}`).join(" ")}
          />
          {centers.map((point) => (
            <g key={point.label}>
              <title>{`${point.label}: ${formatINR(point.amountPaise)}`}</title>
              <circle cx={point.x} cy={point.y} r={4.5} fill={color} />
            </g>
          ))}
        </>
      )}

      {centers.map((point) => (
        <g key={`labels-${point.label}`}>
          {point.amountPaise > 0 && (
            <text className="trend-value" x={point.x} y={point.y - 9} textAnchor="middle">
              {compactINR(point.amountPaise)}
            </text>
          )}
          <text className="trend-label" x={point.x} y={height - 10} textAnchor="middle">
            {point.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

const PAYMENT_HISTORY_MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC"
];

function PaymentHistoryGrid({
  source,
  id
}: {
  source: "loan" | "autopay" | "mutual_fund";
  id: string;
}) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [months, setMonths] = useState<boolean[]>(() => Array.from({ length: 12 }, () => false));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Api.paymentHistory(source, id, year)
      .then((history: PaymentHistory) => {
        if (!active) return;
        const next = Array.from({ length: 12 }, (_, index) => Boolean(history.months?.[index]));
        setMonths(next);
      })
      .catch(() => {
        if (active) setMonths(Array.from({ length: 12 }, () => false));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [source, id, year]);

  return (
    <div className="payment-history">
      <div className="payment-history-header">
        <span className="payment-history-title">Payment history</span>
        <div className="payment-history-stepper">
          <button
            type="button"
            aria-label="Previous year"
            onClick={() => setYear((value) => value - 1)}
          >
            <ChevronLeft size={16} />
          </button>
          <span className="payment-history-year">{year}</span>
          <button
            type="button"
            aria-label="Next year"
            onClick={() => setYear((value) => value + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="payment-history-grid" aria-busy={loading}>
        {PAYMENT_HISTORY_MONTHS.map((label, index) => {
          const paid = months[index];
          return (
            <div className="payment-history-cell" key={label}>
              <span
                className={`payment-history-circle${paid ? " is-paid" : ""}`}
                aria-label={`${label} ${paid ? "paid" : "not paid"}`}
              >
                {paid ? <Check size={18} strokeWidth={3} /> : null}
              </span>
              <span className="payment-history-month">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * What an amount looks like in a budget input: whole rupees when it is whole rupees, because
 * "25000" is what someone would have typed and "25000.00" is what a machine would have.
 */
export function budgetAmountInput(paise: number) {
  return paise % 100 === 0 ? String(Math.round(paise / 100)) : (paise / 100).toFixed(2);
}

/**
 * Last month, offered rather than recounted.
 *
 * Shown on every month, not only an empty one: the common case is a month part-planned, where
 * the rest of last month's plan is exactly what is missing. The button states the count and the
 * month so pressing it holds no surprise, and when there is nothing to copy it says so instead
 * of disappearing -- a control that vanishes teaches nothing about why.
 */
export function CopyLastMonthRow({
  previousPlan,
  busy,
  onCopy
}: {
  previousPlan: BudgetPlan["previousPlan"];
  busy: boolean;
  onCopy: () => void;
}) {
  // Last month had no plan either, so there is nothing to offer and nothing to explain.
  if (previousPlan.lineCount === 0) {
    return null;
  }
  const { missingCount, lineCount, missingAmountPaise, month } = previousPlan;
  const settled = missingCount === 0;
  return (
    <div className={`budget-copy-row ${settled ? "is-settled" : ""}`}>
      <div className="budget-copy-copy">
        <strong>Same as last month</strong>
        <span>
          {settled
            ? `This month already carries every line ${formatMonth(month)} had.`
            : `${missingCount} of ${formatMonth(month)}'s ${lineCount} line${lineCount === 1 ? "" : "s"} ${
                missingCount === 1 ? "is" : "are"
              } not set here yet, worth ${formatINR(missingAmountPaise)}.`}
        </span>
      </div>
      <button
        type="button"
        className="secondary-action budget-copy-button"
        onClick={onCopy}
        disabled={busy || settled}
      >
        <RotateCcw size={17} />
        {settled ? "Nothing to copy" : `Copy ${missingCount} line${missingCount === 1 ? "" : "s"}`}
      </button>
    </div>
  );
}

/**
 * The two figures that answer "how much?" without arithmetic: what this category was budgeted
 * last month, and what it actually cost. Each is a button that fills the amount in, so the
 * common answer -- the same as last time -- costs one press.
 */
export function PreviousMonthHints({
  month,
  budgetPaise,
  actualPaise,
  onUse
}: {
  month: string;
  budgetPaise: number;
  actualPaise: number;
  onUse: (paise: number) => void;
}) {
  const label = formatMonth(month);
  if (budgetPaise <= 0 && actualPaise <= 0) {
    return <p className="budget-last-month">Nothing budgeted or spent here in {label}.</p>;
  }
  return (
    <p className="budget-last-month">
      <span className="budget-last-month-label">{label}</span>
      {budgetPaise > 0 ? (
        <button
          type="button"
          className="budget-hint-chip"
          aria-label={`Use the ${formatINR(budgetPaise)} budgeted in ${label}`}
          onClick={() => onUse(budgetPaise)}
        >
          <span>Budgeted</span>
          <strong>{formatINR(budgetPaise)}</strong>
        </button>
      ) : (
        <span className="budget-hint-chip is-empty">
          <span>Budgeted</span>
          <strong>Nothing</strong>
        </span>
      )}
      {actualPaise > 0 ? (
        <button
          type="button"
          className="budget-hint-chip"
          aria-label={`Use the ${formatINR(actualPaise)} spent in ${label}`}
          onClick={() => onUse(actualPaise)}
        >
          <span>Spent</span>
          <strong>{formatINR(actualPaise)}</strong>
        </button>
      ) : (
        <span className="budget-hint-chip is-empty">
          <span>Spent</span>
          <strong>Nothing</strong>
        </span>
      )}
    </p>
  );
}

/**
 * Everything the planner shows once the plan has arrived.
 *
 * Split out from the page so it can be rendered against a plan rather than against a server: the
 * question "is the copy action offered on a month that already has lines" is answered by handing
 * this a plan that has lines, which is not a question the fetching page can be asked.
 */
/**
 * A page's own header: what it is, how it is going, and what can be done here.
 *
 * The shell prints the page's name in the top bar for every other page; a page that renders this
 * is named once, in its own body, the way the reference has it.
 */
export function PageHeader({
  title,
  actions
}: {
  title: string;
  actions?: ReactNode;
}) {
  /*
   * Title on the left, the way to add on the right, and nothing in between. There was a line of
   * prose under the title -- how far into the month, what was over, what nothing-yet looked like
   * -- and the owner asked for it gone: the tiles under it already carry those readings as
   * figures, so the sentence was saying a second time what the page was about to show.
   */
  return (
    <header className="page-header">
      <div className="page-header-copy">
        <h1>{title}</h1>
      </div>
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </header>
  );
}

/**
 * Days of the planned month still to spend in, counting today.
 *
 * `dayOfMonth` is 0 for a month that has not started and pins to the last day for one already
 * finished, so the month's own end date is what separates "the last day" from "long over".
 */
export function budgetDaysLeft(plan: BudgetPlan): number {
  if (plan.asOfDate > plan.end) {
    return 0;
  }
  if (plan.dayOfMonth === 0) {
    return plan.daysInMonth;
  }
  return plan.daysInMonth - plan.dayOfMonth + 1;
}

/** What is left, spread over the days left -- zero when there is nothing left or nowhere to put it. */
export function budgetPerDayPaise(plan: BudgetPlan): number {
  const days = budgetDaysLeft(plan);
  if (days <= 0 || plan.totals.remainingPaise <= 0) {
    return 0;
  }
  return Math.round(plan.totals.remainingPaise / days);
}


/** The note under each of the four tiles, worked out from the plan rather than written in. */
export function budgetTileNotes(plan: BudgetPlan) {
  const daysLeft = budgetDaysLeft(plan);
  const ofPlan =
    plan.totals.amountPaise > 0
      ? Math.round((plan.totals.actualPaise / plan.totals.amountPaise) * 100)
      : 0;
  return {
    budgeted: plan.lines.length === 1 ? "1 category" : `${plan.lines.length} categories`,
    spent:
      plan.totals.amountPaise > 0
        ? `${ofPlan}% of the plan, ${plan.elapsedPercent}% of the month`
        : `${plan.elapsedPercent}% of the month`,
    left: daysLeft === 0 ? "the month is done" : daysLeft === 1 ? "for 1 day" : `for ${daysLeft} days`,
    perDay:
      plan.totals.remainingPaise <= 0
        ? "already past the plan"
        : daysLeft === 0
          ? "the month is done"
          : "to land on plan"
  };
}

/**
 * The word on the pill. The application keeps four statuses and the reference's pill has three
 * colours, so the two middle ones share a word -- the longer label stays as the title, for
 * anyone who wants to know which of the two it is.
 */
export function budgetPillWord(status: BudgetLine["status"]): string {
  return status === "over" ? "Over" : status === "safe" ? "On track" : "Close";
}

/**
 * The name on a card's face: the SubType alone.
 *
 * A line's full name is "Expense / Groceries", and at a quarter of the page width the Type in
 * front of it wraps every card onto two lines for a word that is "Expense" on all of them. The
 * full name stays on the card's own label and on the dialog that edits it.
 */
export function budgetCardName(line: BudgetLine): string {
  if (line.scopeType !== "subcategory") {
    return line.name;
  }
  const cut = line.name.lastIndexOf(" / ");
  return cut === -1 ? line.name : line.name.slice(cut + 3);
}

/** What one line leaves to spend a day, or the plain fact that it leaves nothing. */
export function budgetCardRate(line: BudgetLine, daysLeft: number): string {
  if (line.remainingPaise <= 0) {
    return "Nothing left this month";
  }
  if (daysLeft <= 0) {
    return "The month is done";
  }
  /* Whole rupees. A rate is an answer to "roughly how much a day", and ₹1,947.37 answers a
     question nobody asked. */
  return `${formatINRWhole(Math.round(line.remainingPaise / daysLeft))} a day`;
}

export function BudgetPlanBody({
  plan,
  saving,
  subScopes,
  subKey,
  selectedScope,
  amount,
  adding,
  onSubKeyChange,
  onAmountChange,
  onAddingChange,
  onAdd,
  onCopyPreviousMonth,
  onStartEdit
}: {
  plan: BudgetPlan;
  saving: boolean;
  subScopes: BudgetScope[];
  subKey: string;
  selectedScope: BudgetScope | null;
  amount: string;
  adding: boolean;
  onSubKeyChange: (key: string) => void;
  onAmountChange: (amount: string) => void;
  onAddingChange: (open: boolean) => void;
  onAdd: (event: FormEvent) => void;
  onCopyPreviousMonth: () => void;
  onStartEdit: (line: BudgetLine) => void;
}) {
  const notes = budgetTileNotes(plan);
  const daysLeft = budgetDaysLeft(plan);
  return (
    <>
      <div className="summary-grid budget-tiles">
        <SummaryCard
          label="Budgeted"
          value={formatINRWhole(plan.totals.amountPaise)}
          countPaise={plan.totals.amountPaise}
          icon={<PiggyBank />}
          note={<small>{notes.budgeted}</small>}
        />
        <SummaryCard
          label="Spent"
          value={formatINRWhole(plan.totals.actualPaise)}
          countPaise={plan.totals.actualPaise}
          icon={<BarChart3 />}
          tone={budgetSummaryTone(plan)}
          note={<small>{notes.spent}</small>}
        />
        <SummaryCard
          label="Left"
          value={formatINRWhole(plan.totals.remainingPaise)}
          countPaise={plan.totals.remainingPaise}
          icon={<WalletCards />}
          tone={plan.totals.remainingPaise < 0 ? "warning" : "good"}
          note={<small>{notes.left}</small>}
        />
        <SummaryCard
          label="Per day"
          value={formatINRWhole(budgetPerDayPaise(plan))}
          countPaise={budgetPerDayPaise(plan)}
          icon={<TrendingUp />}
          note={<small>{notes.perDay}</small>}
        />
      </div>

      <CopyLastMonthRow previousPlan={plan.previousPlan} busy={saving} onCopy={onCopyPreviousMonth} />

      {/* The budgets, and the way to start another one, in one grid -- the reference puts its
          dashed card after the last budget rather than in a section of its own. */}
      <div className="budget-grid">
        {plan.lines.map((line) => (
          <BudgetLineCard
            key={line.id}
            line={line}
            elapsedPercent={plan.elapsedPercent}
            daysLeft={daysLeft}
            onStartEdit={() => onStartEdit(line)}
          />
        ))}
        <button type="button" className="budget-add-card" onClick={() => onAddingChange(true)}>
          <Plus size={20} />
          <strong>Add a budget</strong>
          <span>Groceries, rent, anything</span>
        </button>
      </div>

      {adding && (
        <FormDialog title="New budget" onClose={() => onAddingChange(false)}>
          {/* stack-form alone: budget-add-form is the three-column row this used to be laid out
              as inline, and inside a dialog it put the fields shoulder to shoulder. */}
          <form className="stack-form" onSubmit={onAdd}>
            <label>
              SubType
              <select
                autoFocus
                value={subKey}
                onChange={(event) => onSubKeyChange(event.target.value)}
                disabled={!subScopes.length}
              >
                {subScopes.length === 0 && <option value="">No SubTypes available</option>}
                {subScopes.map((scope) => (
                  <option key={budgetScopeKey(scope)} value={budgetScopeKey(scope)}>
                    {budgetSubLabel(scope)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Amount for {formatMonth(plan.month)}
              <input
                inputMode="decimal"
                value={amount}
                onChange={(event) => onAmountChange(event.target.value)}
                placeholder="25000"
              />
            </label>
            {selectedScope && (
              <PreviousMonthHints
                month={plan.previousMonth}
                budgetPaise={selectedScope.previousBudgetPaise}
                actualPaise={selectedScope.previousActualPaise}
                onUse={(paise) => onAmountChange(budgetAmountInput(paise))}
              />
            )}
            <div className="loan-form-actions">
              <button
                type="button"
                className="secondary-action"
                onClick={() => onAddingChange(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <button className="primary-action" type="submit" disabled={saving || !subScopes.length}>
                <Plus size={17} />
                Add budget
              </button>
            </div>
          </form>
        </FormDialog>
      )}
    </>
  );
}

function BudgetPlannerPage({
  refreshKey,
  showNotice,
  requestConfirm
}: {
  refreshKey: number;
  showNotice: (message: string) => void;
  requestConfirm: (request: ConfirmRequest) => void;
}) {
  const [month, setMonth] = useState(currentMonth());
  const [plan, setPlan] = useState<BudgetPlan | null>(null);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [subKey, setSubKey] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [adding, setAdding] = useState(false);
  const [editAmount, setEditAmount] = useState("");

  // Budgets are planned per Expense SubType only (no whole-Type budgets).
  const selectedScope = useMemo(
    () => (plan?.availableScopes ?? []).find((scope) => budgetScopeKey(scope) === subKey) ?? null,
    [plan, subKey]
  );
  const subScopes = useMemo(
    () =>
      (plan?.availableScopes ?? []).filter(
        (scope) => scope.scopeType === "subcategory" && scope.behavior === "expense"
      ),
    [plan]
  );

  const loadPlan = useCallback(async () => {
    setPlan(null);
    setError("");
    try {
      setPlan(await Api.budgetPlan(month));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load budget plan.");
    }
  }, [month]);

  useEffect(() => {
    void loadPlan();
  }, [loadPlan, retryKey, refreshKey]);

  useEffect(() => {
    if (!subScopes.length) {
      setSubKey("");
      return;
    }
    if (!subScopes.some((scope) => budgetScopeKey(scope) === subKey)) {
      setSubKey(budgetScopeKey(subScopes[0]));
    }
  }, [subScopes, subKey]);

  async function addBudget(event: FormEvent) {
    event.preventDefault();
    const scope = subScopes.find((item) => budgetScopeKey(item) === subKey);
    if (!scope) {
      showNotice("Choose a budget line.");
      return;
    }
    const amountPaise = parseAmountToPaise(amount);
    if (amountPaise <= 0) {
      showNotice("Enter a budget amount.");
      return;
    }
    setSaving(true);
    try {
      await Api.createBudgetLine({ month, scopeType: scope.scopeType, scopeId: scope.scopeId, amountPaise });
      setAmount("");
      setAdding(false);
      await loadPlan();
      showNotice("Budget added.");
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Could not add budget.");
    } finally {
      setSaving(false);
    }
  }

  /* Takes whatever of last month's plan this month does not have. Additive and line-by-line
     reversible, so it asks nothing first; the button already said what it would do, and the
     notice says what it did. */
  async function copyPreviousMonth() {
    setSaving(true);
    try {
      const result = await Api.copyPreviousBudget(month);
      await loadPlan();
      showNotice(
        result.copiedCount === 0
          ? `${formatMonth(result.fromMonth)} has nothing left to copy.`
          : `Copied ${result.copiedCount} budget line${result.copiedCount === 1 ? "" : "s"} from ${formatMonth(result.fromMonth)}. Adjust any amounts below.`
      );
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Could not copy last month's budget.");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(line: BudgetLine) {
    const amountPaise = parseAmountToPaise(editAmount);
    if (amountPaise <= 0) {
      showNotice("Enter a budget amount.");
      return;
    }
    setSaving(true);
    try {
      await Api.updateBudgetLine(line.id, { amountPaise });
      setEditingId("");
      setEditAmount("");
      await loadPlan();
      showNotice("Budget updated.");
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Could not update budget.");
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    setEditingId("");
    setEditAmount("");
  }

  /* The line being edited, read back out of the freshly loaded plan so the dialog shows what the
     server has rather than what was on screen when Edit was pressed. */
  const editingLine = plan?.lines.find((line) => line.id === editingId) ?? null;

  function remove(line: BudgetLine) {
    requestConfirm({
      message: "Remove this budget line?",
      detail: `${line.name} will be removed from ${formatMonth(line.month)}. Transactions and reports stay unchanged.`,
      confirmLabel: "Remove",
      tone: "danger",
      onConfirm: async () => {
        try {
          await Api.deleteBudgetLine(line.id);
          await loadPlan();
          showNotice("Budget removed.");
        } catch (err) {
          showNotice(err instanceof Error ? err.message : "Could not remove budget.");
        }
      }
    });
  }

  return (
    <div className="page-grid budget-page">
      <PageHeader
        title="Budget Planner"
        actions={
          <>
            <div className="budget-month-picker">
              <label className="control-field budget-month-control">
                <span className="control-label">Month</span>
                <select
                  value={splitMonth(month).month}
                  onChange={(event) => setMonth(monthValue(splitMonth(month).year, Number(event.target.value)))}
                >
                  {MONTH_CHOICES.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="control-field budget-year-control">
                <span className="control-label">Year</span>
                <select
                  value={splitMonth(month).year}
                  onChange={(event) => setMonth(monthValue(Number(event.target.value), splitMonth(month).month))}
                >
                  {yearChoices(splitMonth(month).year).map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              className="primary-action"
              onClick={() => setAdding(true)}
              disabled={!plan || !subScopes.length}
            >
              <Plus size={17} />
              New budget
            </button>
          </>
        }
      />

      {error ? (
        <div className="stacked-empty-state">
          <EmptyState text={error} />
          <button type="button" className="secondary-action" onClick={() => setRetryKey((key) => key + 1)}>
            <RotateCcw size={17} />
            Retry
          </button>
        </div>
      ) : !plan ? (
        <PanelLoader label="Loading budget" />
      ) : (
        <BudgetPlanBody
          plan={plan}
          saving={saving}
          subScopes={subScopes}
          subKey={subKey}
          selectedScope={selectedScope}
          amount={amount}
          adding={adding}
          onSubKeyChange={setSubKey}
          onAmountChange={setAmount}
          onAddingChange={setAdding}
          onAdd={addBudget}
          onCopyPreviousMonth={() => void copyPreviousMonth()}
          onStartEdit={(line) => {
            setEditingId(line.id);
            setEditAmount(budgetAmountInput(line.amountPaise));
          }}
        />
      )}

      {editingLine && (
        <BudgetEditDialog
          line={editingLine}
          amount={editAmount}
          saving={saving}
          onAmountChange={setEditAmount}
          onSave={() => void saveEdit(editingLine)}
          /* The editor closes before the question is asked. Stacked on top of the dialog the
             confirmation could be seen but not pressed -- its button took a mousedown, the
             dialog's focus trap pulled focus back, and no click ever landed. Driving it is what
             found that; one modal at a time is the fix and the better thing besides. */
          onDelete={() => {
            const target = editingLine;
            cancelEdit();
            remove(target);
          }}
          onClose={cancelEdit}
        />
      )}
    </div>
  );
}

/**
 * One budget, as the reference draws it: everything on the face, nothing behind a disclosure.
 *
 * The bar carries two things -- how much of the budget has gone, and how much of the month has.
 * A fill short of the marker is a line running under; a fill past it is one running ahead.
 */
export function BudgetLineCard({
  line,
  elapsedPercent,
  daysLeft,
  onStartEdit
}: {
  line: BudgetLine;
  elapsedPercent: number;
  daysLeft: number;
  onStartEdit: () => void;
}) {
  const filled = Math.min(Math.max(line.usedPercent, 0), 100);
  const over = line.remainingPaise < 0;
  return (
    <article className={`budget-card ${line.status}`}>
      <div className="budget-card-head">
        <span className="budget-card-icon" style={{ background: `${line.color}22`, color: line.color }}>
          <IconGlyph name={line.icon} size={19} />
        </span>
        <div className="budget-card-name">
          <strong title={line.name}>{budgetCardName(line)}</strong>
          <span>{formatINR(line.amountPaise)} a month</span>
        </div>
        <span className={`status-pill ${line.status}`} title={line.statusLabel}>
          <i aria-hidden="true" />
          {budgetPillWord(line.status)}
        </span>
      </div>

      <p className="budget-card-figure">
        <strong>{formatINRWhole(Math.abs(line.remainingPaise))}</strong>
        <span>{over ? "over" : "left"}</span>
      </p>

      <div
        className="budget-bar"
        role="img"
        aria-label={`${line.name}: ${formatINR(line.actualPaise)} of ${formatINR(line.amountPaise)} spent, ${elapsedPercent}% of the month gone`}
      >
        <span className={`budget-bar-fill ${line.status}`} style={{ width: `${filled}%` }} />
        {/* Where the month has got to. A month that has not started has nothing to mark. */}
        {elapsedPercent > 0 && (
          <span className="budget-bar-marker" style={{ left: `${Math.min(elapsedPercent, 100)}%` }} />
        )}
      </div>

      <div className="budget-card-foot">
        <span>{formatINR(line.actualPaise)} spent</span>
        <span>{budgetCardRate(line, daysLeft)}</span>
      </div>

      <button type="button" className="budget-card-edit" onClick={onStartEdit}>
        <Pencil size={15} />
        Edit
      </button>
    </article>
  );
}

/**
 * Editing one budget, and the only place it can be removed from.
 *
 * Remove used to sit on the card beside Edit. The reference's card carries one action, so it
 * moved in here -- where the amount it would throw away is on screen, which is a better place to
 * ask the question from than a row of cards.
 */
export function BudgetEditDialog({
  line,
  amount,
  saving,
  onAmountChange,
  onSave,
  onDelete,
  onClose
}: {
  line: BudgetLine;
  amount: string;
  saving: boolean;
  onAmountChange: (value: string) => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <FormDialog title={`Edit ${line.name} budget`} onClose={onClose}>
      <form
        className="stack-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <label>
          Budget for {formatMonth(line.month)}
          <input
            autoFocus
            aria-label={`Budget amount for ${line.name}`}
            inputMode="decimal"
            value={amount}
            onChange={(event) => onAmountChange(event.target.value)}
          />
        </label>
        <PreviousMonthHints
          month={previousMonthOf(line.month)}
          budgetPaise={line.previousBudgetPaise}
          actualPaise={line.previousActualPaise}
          onUse={(paise) => onAmountChange(budgetAmountInput(paise))}
        />
        <div className="budget-dialog-actions">
          <button type="button" className="secondary-action danger-action" onClick={onDelete} disabled={saving}>
            <Trash2 size={16} />
            Remove
          </button>
          <div className="budget-dialog-close">
            <button type="button" className="secondary-action" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="primary-action" disabled={saving}>
              <Check size={16} />
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </form>
    </FormDialog>
  );
}

function budgetScopeKey(scope: BudgetScope) {
  return `${scope.scopeType}:${scope.scopeId}`;
}


function budgetSubLabel(scope: BudgetScope) {
  // The Budget Planner only offers Expense SubType scopes, so the label is just the
  // SubType name (its "Expense / " prefix stripped).
  const prefix = `${scope.typeName} / `;
  return scope.name.startsWith(prefix) ? scope.name.slice(prefix.length) : scope.name;
}

function budgetSummaryTone(plan: BudgetPlan): "neutral" | "warning" | "good" {
  if (plan.totals.overCount > 0 || plan.totals.criticalCount > 0 || plan.totals.watchCount > 0) {
    return "warning";
  }
  return plan.lines.length > 0 ? "good" : "neutral";
}

/**
 * One account, on the budget card's pattern: everything on the face, nothing behind a disclosure.
 *
 * The bar belongs to a credit card alone. Its utilisation has a natural nought-to-a-hundred and
 * the owner's own alert to mark on it, the way a budget's bar marks how far through the month it
 * is. A bank balance has no such scale, and drawing one would be a picture rather than a reading.
 */
export function AccountCard({
  account,
  alertPercent,
  onStartEdit
}: {
  account: Account;
  alertPercent: number;
  onStartEdit: () => void;
}) {
  const isCard = account.type === "credit_card";
  const standing = accountStanding(account, alertPercent);
  const limit = account.creditLimitPaise ?? 0;
  const usage = cardUsagePercent(account);
  const available = account.availableLimitPaise ?? Math.max(limit - account.outstandingPaise, 0);
  const minimum = account.minimumBalancePaise ?? 0;
  const split = outstandingSplit(account.spendOutstandingPaise, account.emiOutstandingPaise);

  const headline = isCard ? Math.max(account.outstandingPaise, 0) : account.balancePaise;
  const headlineWord = isCard ? "owed" : "available";
  const under = isCard
    ? limit > 0
      ? `${formatINR(limit)} limit${account.paymentDueDay ? ` · due on the ${account.paymentDueDay}th` : ""}`
      : accountTypeLabel(account.type)
    : accountTypeLabel(account.type);

  return (
    <article className={`budget-card account-card-v2 ${standing?.tone ?? "plain"}`}>
      <div className="budget-card-head">
        <span className={`budget-card-icon account-icon ${accountIconTone(account.type)}`}>
          {accountIconForType(account.type, 19)}
        </span>
        <div className="budget-card-name">
          <strong title={account.name}>{account.name}</strong>
          <span>{under}</span>
        </div>
        {standing && (
          <span className={`status-pill ${standing.tone === "over" ? "over" : standing.tone}`} title={standing.detail}>
            <i aria-hidden="true" />
            {standing.word}
          </span>
        )}
      </div>

      <p className="budget-card-figure">
        <strong>{formatINRWhole(headline)}</strong>
        <span>{headlineWord}</span>
      </p>

      {isCard && limit > 0 && (
        <div
          className="budget-bar"
          role="img"
          aria-label={`${account.name}: ${usage}% of its ${formatINR(limit)} limit used, your alert is at ${alertPercent}%`}
        >
          <span
            className={`budget-bar-fill ${standing?.tone === "over" ? "over" : standing?.tone === "watch" ? "watch" : "safe"}`}
            style={{ width: `${Math.min(usage, 100)}%` }}
          />
          {/* Where the owner asked to be warned, not a figure chosen here. */}
          <span className="budget-bar-marker" style={{ left: `${Math.min(alertPercent, 100)}%` }} />
        </div>
      )}

      {/*
        * What the bar above just said, in words, directly under it -- the owner drew this: the
        * percentage and what is left belong to the utilisation bar, so they sit against it
        * rather than below a second bar that is about something else entirely.
        */}
      <div className="budget-card-foot">
        {isCard ? (
          <>
            <span>{limit > 0 ? `${usage}% of ${formatINRWhole(limit)}` : "No limit set"}</span>
            <span>{limit > 0 ? `${formatINRWhole(available)} left` : "Set one to see utilisation"}</span>
          </>
        ) : (
          <>
            <span>Opened at {formatINRWhole(account.startingBalancePaise)}</span>
            <span>{minimum > 0 ? `${formatINRWhole(minimum)} minimum` : "No minimum set"}</span>
          </>
        )}
      </div>

      {/* The second reading the owner asked for: what is owed, cut into this cycle's own
          spending and the EMIs still running. accounts-30 put this in the edit dialog; it
          belongs on the card, where the first reading already is. */}
      {isCard && split.show && (
        <>
          <div
            className="budget-bar outstanding-bar"
            role="img"
            aria-label={`${account.name}: of ${formatINR(split.totalPaise)} owed, ${split.spendPercent}% is this cycle's spending and ${split.emiPercent}% is EMIs`}
          >
            <span className="outstanding-bar-spend" style={{ width: `${split.spendPercent}%` }} />
            <span className="outstanding-bar-emi" style={{ width: `${split.emiPercent}%` }} />
          </div>
          <p className="outstanding-split-legend">
            <span className="spend">
              <i aria-hidden="true" />
              Monthly spends {split.spendPercent}% · {formatINRWhole(split.spendPaise)}
            </span>
            <span className="emi">
              <i aria-hidden="true" />
              EMIs {split.emiPercent}% · {formatINRWhole(split.emiPaise)}
            </span>
          </p>
        </>
      )}

      <button type="button" className="budget-card-edit" onClick={onStartEdit}>
        <Pencil size={15} />
        Edit
      </button>
    </article>
  );
}

/**
 * The accounts, in the two groups the owner asked for.
 *
 * A heading with nothing under it is a heading about nothing, so a group with no accounts is not
 * returned at all. Every live account belongs to exactly one of the two: a credit card is a card,
 * and everything else -- a bank, a food card -- is held rather than borrowed.
 */
export function accountGroups(accounts: Account[]): Array<{ key: "bank" | "card"; title: string; accounts: Account[] }> {
  const live = liveAccounts(accounts);
  const groups: Array<{ key: "bank" | "card"; title: string; accounts: Account[] }> = [
    { key: "bank", title: "Bank accounts", accounts: live.filter((account) => account.type !== "credit_card") },
    { key: "card", title: "Cards", accounts: live.filter((account) => account.type === "credit_card") }
  ];
  return groups.filter((group) => group.accounts.length > 0);
}

/** The accounts that count: archived ones are out of the tracker and out of every figure here. */
export function liveAccounts(accounts: Account[]): Account[] {
  return accounts.filter((account) => !account.isArchived);
}

/**
 * The four figures the page opens with.
 *
 * `cardDebtPaise` takes `max(outstanding, 0)` for each card: a card carrying a credit balance
 * owes nothing, and counting it as a negative debt would quietly add that credit to what you are
 * worth. That is the rule fixes-23 established against the real database.
 */
export function accountTotals(accounts: Account[]) {
  const live = liveAccounts(accounts);
  const cards = live.filter((account) => account.type === "credit_card");
  const cashPaise = live
    .filter((account) => account.type === "bank" || account.type === "food_card")
    .reduce((sum, account) => sum + account.balancePaise, 0);
  const cardDebtPaise = cards.reduce((sum, account) => sum + Math.max(account.outstandingPaise, 0), 0);
  const limitPaise = cards.reduce((sum, account) => sum + (account.creditLimitPaise ?? 0), 0);
  const availableCreditPaise = cards.reduce(
    (sum, account) => sum + (account.availableLimitPaise ?? Math.max((account.creditLimitPaise ?? 0) - account.outstandingPaise, 0)),
    0
  );
  return {
    cashPaise,
    cardDebtPaise,
    limitPaise,
    availableCreditPaise,
    netPaise: cashPaise - cardDebtPaise,
    cashCount: live.filter((account) => account.type === "bank" || account.type === "food_card").length,
    cardCount: cards.length
  };
}

/** How much of its limit a card is using, as a whole percent. A card with no limit uses none. */
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
  uncategorizedCount,
  cardAlertPercent,
  today
}: {
  accounts: Account[];
  loans: Loan[];
  subscriptions: AutopaySubscription[];
  uncategorizedCount: number;
  cardAlertPercent: number;
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

  for (const subscription of subscriptions) {
    if (subscription.isArchived || subscription.status !== "active") continue;
    const debitDay = Number(subscription.startDate.slice(8, 10));
    if (!soon(debitDay)) continue;
    const away = daysAway(debitDay);
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

export function cardUsagePercent(account: Account): number {
  const limit = account.creditLimitPaise ?? 0;
  if (limit <= 0) {
    return 0;
  }
  return Math.round((Math.max(account.outstandingPaise, 0) / limit) * 100);
}

/**
 * Where an account stands, or null when it stands against nothing.
 *
 * A card is measured against the alert the owner set in Profile; a bank against the minimum
 * balance they set on it. An account with neither has no status, and gets no pill -- a badge
 * that reads "Healthy" whatever the figures is decoration.
 */
export function accountStanding(
  account: Account,
  alertPercent: number
): { tone: "safe" | "watch" | "over"; word: string; detail: string } | null {
  if (account.type === "credit_card") {
    const limit = account.creditLimitPaise ?? 0;
    if (limit <= 0) {
      return null;
    }
    const usage = cardUsagePercent(account);
    if (usage > alertPercent) {
      return { tone: "over", word: "Over alert", detail: `${usage}% of the limit, past your ${alertPercent}%` };
    }
    if (usage >= alertPercent - 10) {
      return { tone: "watch", word: "Close", detail: `${usage}% of the limit, near your ${alertPercent}%` };
    }
    return { tone: "safe", word: "Healthy", detail: `${usage}% of the limit` };
  }
  const minimum = account.minimumBalancePaise ?? 0;
  if (minimum <= 0) {
    return null;
  }
  if (account.balancePaise < minimum) {
    return { tone: "over", word: "Below minimum", detail: `under the ${formatINR(minimum)} you set` };
  }
  if (account.balancePaise < Math.round(minimum * 1.1)) {
    return { tone: "watch", word: "Close", detail: `near the ${formatINR(minimum)} you set` };
  }
  return { tone: "safe", word: "Healthy", detail: `above the ${formatINR(minimum)} you set` };
}

/** The note under each of the four tiles, worked out from the accounts rather than written in. */
export function accountTileNotes(accounts: Account[], alertPercent: number) {
  const totals = accountTotals(accounts);
  const usedPercent = totals.limitPaise > 0 ? Math.round((totals.cardDebtPaise / totals.limitPaise) * 100) : 0;
  const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  return {
    cash: totals.cashCount === 0 ? "no accounts yet" : `across ${plural(totals.cashCount, "account", "accounts")}`,
    cardDebt:
      totals.cardCount === 0
        ? "no cards yet"
        : totals.limitPaise > 0
          ? `${usedPercent}% of your ${formatINRWhole(totals.limitPaise)} limit`
          : `on ${plural(totals.cardCount, "card", "cards")}, no limit set`,
    availableCredit:
      totals.cardCount === 0 ? "no cards yet" : `left of ${formatINRWhole(totals.limitPaise)}`,
    net: totals.cardDebtPaise === 0 ? "nothing owed on cards" : "cash less what the cards owe"
  };
}


function AccountsPage({
  accounts,
  cardAlertPercent,
  refresh,
  showNotice,
  requestConfirm
}: {
  accounts: Account[];
  cardAlertPercent: number;
  refresh: () => Promise<void>;
  showNotice: (message: string) => void;
  requestConfirm: (request: ConfirmRequest) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState("");
  const activeAccounts = liveAccounts(accounts);
  const editingAccount = activeAccounts.find((account) => account.id === editingId) ?? null;
  const cardSegments = cardUtilisationSegments(activeAccounts);
  const cardOutstandingPaise = cardSegments.reduce((sum, segment) => sum + segment.amountPaise, 0);
  const groups = accountGroups(accounts);
  const addCard = (
    <button type="button" className="budget-add-card" onClick={() => setAdding(true)}>
      <Plus size={20} />
      <strong>Add an account</strong>
      <span>A bank, a card, a food card</span>
    </button>
  );
  const notes = accountTileNotes(accounts, cardAlertPercent);
  const totals = accountTotals(accounts);

  function remove(account: Account) {
    requestConfirm({
      message: "Are you sure you want to delete this?",
      detail: `${account.name} will disappear from the app. Existing transaction history is preserved when history is linked to this account.`,
      confirmLabel: "Delete",
      tone: "danger",
      onConfirm: async () => {
        try {
          const result = await Api.deleteAccount(account.id);
          await refresh();
          showNotice(result.mode === "hidden" ? "Account hidden. Existing history is preserved." : "Account deleted.");
        } catch (err) {
          showNotice(err instanceof Error ? err.message : "Could not remove account.");
        }
      }
    });
  }

  return (
    <div className="page-grid accounts-page">
      <PageHeader
        title="Accounts"
        actions={
          <button type="button" className="primary-action" onClick={() => setAdding(true)}>
            <Plus size={17} />
            New account
          </button>
        }
      />

      <div className="summary-grid budget-tiles">
        <SummaryCard
          label="Cash"
          value={formatINRWhole(totals.cashPaise)}
          countPaise={totals.cashPaise}
          icon={<Landmark />}
          note={<small>{notes.cash}</small>}
        />
        <SummaryCard
          label="Card debt"
          value={formatINRWhole(totals.cardDebtPaise)}
          countPaise={totals.cardDebtPaise}
          icon={<CreditCard />}
          tone={totals.cardDebtPaise > 0 ? "warning" : "neutral"}
          note={<small>{notes.cardDebt}</small>}
        />
        <SummaryCard
          label="Available credit"
          value={formatINRWhole(totals.availableCreditPaise)}
          countPaise={totals.availableCreditPaise}
          icon={<WalletCards />}
          tone="good"
          note={<small>{notes.availableCredit}</small>}
        />
        <SummaryCard
          label="Net"
          value={formatINRWhole(totals.netPaise)}
          countPaise={totals.netPaise}
          icon={<TrendingUp />}
          tone={totals.netPaise < 0 ? "warning" : "neutral"}
          note={<small>{notes.net}</small>}
        />
      </div>




      <div className="accounts-split">
        <div className="accounts-split-main">
        {/* Grouped, and three across rather than the budget page's four -- an account's card
            carries two bars and a legend where a budget's carries one bar. */}
        {groups.map((group, index) => (
          <section className="account-group" key={group.key}>
            <h2 className="account-group-title">{group.title}</h2>
            <div className="budget-grid accounts-grid">
              {group.accounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  alertPercent={cardAlertPercent}
                  onStartEdit={() => setEditingId(account.id)}
                />
              ))}
              {/* The way to add goes in the last group's own grid. On its own it took a whole row
                  for one cell and pushed everything under it -- the card utilisation among them --
                  off the first screen. */}
              {index === groups.length - 1 && addCard}
            </div>
          </section>
        ))}

          {groups.length === 0 && <div className="budget-grid accounts-grid">{addCard}</div>}
        </div>

        <aside className="accounts-split-side">
        {/* Beside the accounts rather than over them, which is what the owner asked for: full
            width this was a very wide panel holding one small ring, and it pushed the cards down
            the page. In a column of its own it stands next to what it describes. */}
        {cardOutstandingPaise > 0 && (
          <Panel title="Card utilisation">
            <MixChart
              segments={cardSegments}
              totalPaise={cardOutstandingPaise}
              ariaLabel="Credit card utilisation"
              centerLabel="Card debt"
              centerValue={formatINRWhole(cardOutstandingPaise)}
              className="overview-donut-chart"
              emptyText="No credit card owes anything right now."
            />
          </Panel>
        )}
        </aside>
      </div>

      {adding && (
        <FormDialog title="New account" onClose={() => setAdding(false)}>
          <AccountForm
            onCancel={() => setAdding(false)}
            onCreated={async () => {
              setAdding(false);
              await refresh();
              showNotice("Account added.");
            }}
          />
        </FormDialog>
      )}

      {editingAccount && (
        <AccountEditDialog
          account={editingAccount}
          onClose={() => setEditingId("")}
          onSaved={async (message) => {
            setEditingId("");
            await refresh();
            showNotice(message);
          }}
          onError={showNotice}
          /* The editor closes before the question is asked. Stacked on the dialog a confirmation
             can be seen and not pressed -- the dialog's focus trap eats the click, which
             budgets-29 found by driving it. One modal at a time. */
          onDelete={() => {
            const target = editingAccount;
            setEditingId("");
            remove(target);
          }}
        />
      )}
    </div>
  );
}

function LoansPage({
  loans,
  categoryTypes,
  cards,
  refresh,
  showNotice,
  requestConfirm
}: {
  loans: Loan[];
  categoryTypes: CategoryType[];
  /** Present on the EMI page only. Its presence is what makes this the EMI page. */
  cards?: Account[];
  refresh: () => Promise<void>;
  showNotice: (message: string) => void;
  requestConfirm: (request: ConfirmRequest) => void;
}) {
  const isCardEmi = Array.isArray(cards);
  const noun = isCardEmi ? "EMI" : "loan";
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [adding, setAdding] = useState(false);
  const activeLoans = loans.filter((loan) => !loan.isArchived);
  const archivedLoans = loans.filter((loan) => loan.isArchived);
  const loanType = categoryTypes.find((type) => type.behavior === "loan");
  const activeOutstanding = activeLoans.reduce((sum, loan) => sum + loan.outstandingPaise, 0);
  const monthlyEmiTotal = activeLoans.reduce((sum, loan) => sum + loan.monthlyEmiPaise, 0);
  const paidInterest = activeLoans.reduce((sum, loan) => sum + loanInterestPaidValue(loan), 0);

  function archive(loan: Loan) {
    requestConfirm({
      message: "Are you sure you want to archive this loan?",
      detail:
        loan.outstandingPaise > 0
          ? `${loan.name} will move out of active tracking. It still has ${formatINR(loan.outstandingPaise)} outstanding, which keeps counting in your net worth until it's paid.`
          : `${loan.name} will move out of active tracking. Existing transactions and reports stay preserved.`,
      confirmLabel: "Archive",
      tone: "danger",
      onConfirm: async () => {
        try {
          await Api.archiveLoan(loan.id);
          if (editingLoan?.id === loan.id) setEditingLoan(null);
          await refresh();
          showNotice("Loan archived.");
        } catch (err) {
          showNotice(err instanceof Error ? err.message : "Could not archive loan.");
        }
      }
    });
  }

  // Biggest first, so the ring and the bars read in the same order.
  const loanSegments = activeLoans
    .filter((loan) => loan.outstandingPaise > 0)
    .map((loan) => ({
      id: loan.id,
      name: loan.name,
      color: loan.subcategoryColor,
      amountPaise: loan.outstandingPaise
    }))
    .sort((a, b) => b.amountPaise - a.amountPaise);

  async function restore(loan: Loan) {
    try {
      await Api.updateLoan(loan.id, { isArchived: false });
      await refresh();
      showNotice("Loan restored.");
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Could not restore loan.");
    }
  }

  return (
    <div className="page-grid loans-page">
      <PageHeader
        title={isCardEmi ? "EMI" : "Loans"}
        actions={
          <button type="button" className="primary-action" onClick={() => setAdding(true)}>
            <Plus size={17} />
            Add {noun}
          </button>
        }
      />
      <section className="summary-grid mini loan-summary-grid">
        <SummaryCard label="Active outstanding" value={formatINRWhole(activeOutstanding)} countPaise={activeOutstanding} icon={<Landmark />} tone="warning" />
        <SummaryCard label="Monthly EMI total" value={formatINRWhole(monthlyEmiTotal)} countPaise={monthlyEmiTotal} icon={<CalendarDays />} />
        <SummaryCard
          label="Interest paid"
          value={formatINRWhole(paidInterest)} countPaise={paidInterest}
          icon={<BarChart3 />}
          note={
            activeLoans.some((loan) => loan.estimatedHistoricalInterestPaidPaise > 0) ? (
              <span className="summary-hint">Includes an estimate for months before you started tracking</span>
            ) : undefined
          }
        />
      </section>

      <div className="two-column loans-layout">
        <Panel title={isCardEmi ? "EMI tracker" : "Loan tracker"}>
          {activeLoans.length === 0 ? (
            <EmptyState text="No active loans yet." />
          ) : (
            <div className="loan-card-grid">
              {activeLoans.map((loan) => (
                <LoanCard
                  key={loan.id}
                  loan={loan}
                  onEdit={setEditingLoan}
                  onArchive={archive}
                />
              ))}
            </div>
          )}

          {archivedLoans.length > 0 && (
            <>
              <h3 className="section-subtitle">Archived loans</h3>
              <div className="loan-card-grid archived-loans">
                {archivedLoans.map((loan) => (
                  <LoanCard
                    key={loan.id}
                    loan={loan}
                    onEdit={setEditingLoan}
                    onRestore={restore}
                  />
                ))}
              </div>
            </>
          )}
        </Panel>

        <Panel title={`Outstanding by ${noun}`}>
          <MixChart
            segments={loanSegments}
            totalPaise={activeOutstanding}
            ariaLabel={`Outstanding by ${noun}`}
            centerLabel="Outstanding"
            centerValue={formatINRWhole(activeOutstanding)}
            centerCountPaise={activeOutstanding}
            className="overview-donut-chart"
            emptyText={`Nothing outstanding yet. Add ${isCardEmi ? "an EMI" : "a loan"} to see the split.`}
          />
        </Panel>
      </div>

      {adding && (
        <FormDialog title={`Add ${noun}`} onClose={() => setAdding(false)}>
        {loanType ? (
          <LoanForm
            loan={null}
            loanType={loanType}
            cards={cards}
            onCancel={() => setAdding(false)}
            onSaved={async (message) => {
              setAdding(false);
              await refresh();
              showNotice(message);
            }}
          />
        ) : (
          <EmptyState text={`${isCardEmi ? "EMI" : "Loan"} needs a Type with Loan behavior. Add one in Categories first.`} />
        )}
      </FormDialog>
      )}

      {editingLoan && (
        <FormDialog title={`Edit ${noun}`} onClose={() => setEditingLoan(null)}>
          {loanType ? (
            <LoanForm
              key={editingLoan.id}
              loan={editingLoan}
              loanType={loanType}
              cards={cards}
              onCancel={() => setEditingLoan(null)}
              onSaved={async (message) => {
                setEditingLoan(null);
                await refresh();
                showNotice(message);
              }}
            />
          ) : (
            <EmptyState text={`${isCardEmi ? "EMI" : "Loan"} needs a Type with Loan behavior. Add one in Categories first.`} />
          )}
        </FormDialog>
      )}


    </div>
  );
}

function LoanForm({
  loan,
  loanType,
  cards,
  onSaved,
  onCancel
}: {
  loan: Loan | null;
  loanType: CategoryType;
  /** Present on the EMI page: the credit cards an EMI may sit on. Absent on the Loans page. */
  cards?: Account[];
  onSaved: (message: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const isCardEmi = Array.isArray(cards);
  const [accountId, setAccountId] = useState(loan?.accountId ?? cards?.[0]?.id ?? "");
  const defaultSubcategoryId = loan?.subcategoryId ?? loanType.subcategories[0]?.id ?? "__custom__";
  const [subcategoryChoice, setSubcategoryChoice] = useState(defaultSubcategoryId);
  const [customSubType, setCustomSubType] = useState("");
  const [name, setName] = useState(loan?.name ?? "");
  const [principal, setPrincipal] = useState(loan ? amountInputFromPaise(loan.principalAmountPaise) : "");
  const [outstanding, setOutstanding] = useState(loan ? amountInputFromPaise(loan.startingOutstandingPaise) : "");
  const [startMonth, setStartMonth] = useState(loan?.startMonth ?? currentMonth());
  const [interestRate, setInterestRate] = useState(loan ? rateInputFromBps(loan.annualInterestRateBps) : "");
  const [tenureMonths, setTenureMonths] = useState(loan ? String(loan.tenureMonths) : "");
  const [monthlyEmi, setMonthlyEmi] = useState(loan ? amountInputFromPaise(loan.monthlyEmiPaise) : "");
  const [emiDueDay, setEmiDueDay] = useState(loan?.emiDueDay ? String(loan.emiDueDay) : "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Your bank's EMI is the source of truth; this is the textbook figure for the terms entered.
  const suggestedEmiPaise = (() => {
    try {
      return calculateEmiPaise(
        parseAmountToPaise(principal || "0"),
        interestRate.trim() ? parseRateToBps(interestRate) : -1,
        Number.parseInt(tenureMonths, 10)
      );
    } catch {
      return 0;
    }
  })();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      let subcategoryId = subcategoryChoice;
      if (subcategoryChoice === "__custom__") {
        if (!customSubType.trim()) {
          throw new Error("Enter the custom loan type name.");
        }
        const created = await Api.createSubcategory({
          typeId: loanType.id,
          name: customSubType.trim(),
          icon: "calendar-clock",
          color: "#be123c"
        });
        subcategoryId = created.id;
      }

      const payload = {
        name,
        subcategoryId,
        principalAmountPaise: parseAmountToPaise(principal),
        startingOutstandingPaise: parseAmountToPaise(outstanding),
        startMonth,
        annualInterestRateBps: parseRateToBps(interestRate),
        tenureMonths: Number.parseInt(tenureMonths, 10),
        monthlyEmiPaise: parseAmountToPaise(monthlyEmi),
        // Left blank means no reminder; clearing it on an existing loan turns the reminder off.
        emiDueDay: emiDueDay.trim() ? Number.parseInt(emiDueDay, 10) : null,
        // Only the EMI form sends a card. The Loans form omits it entirely, which is what keeps
        // an ordinary loan out of the EMI list.
        // An EMI's card: sent as null when the dropdown is empty, which detaches it.
        ...(isCardEmi ? { accountId: accountId || (loan ? null : undefined) } : {})
      };

      if (loan) {
        await Api.updateLoan(loan.id, payload);
        await onSaved(isCardEmi ? "EMI updated." : "Loan updated.");
      } else {
        await Api.createLoan(payload);
        setSubcategoryChoice(loanType.subcategories[0]?.id ?? "__custom__");
        setCustomSubType("");
        setName("");
        setPrincipal("");
        setOutstanding("");
        setStartMonth(currentMonth());
        setInterestRate("");
        setTenureMonths("");
        setMonthlyEmi("");
        setEmiDueDay("");
        await onSaved(isCardEmi ? "EMI added." : "Loan added.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save loan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="stack-form loan-form" onSubmit={submit}>
      <div className="form-pair form-pair-tight">
      <label>
        Loan name
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="HDFC home loan" required />
      </label>
      <label>
        Type of loan
        <select value={subcategoryChoice} onChange={(event) => setSubcategoryChoice(event.target.value)} required>
          {loanType.subcategories.map((subcategory) => (
            <option key={subcategory.id} value={subcategory.id}>
              {subcategory.name}
            </option>
          ))}
          <option value="__custom__">Add custom loan type</option>
        </select>
      </label>
      </div>
      {subcategoryChoice === "__custom__" && (
        <label>
          Custom loan type
          <input
            value={customSubType}
            onChange={(event) => setCustomSubType(event.target.value)}
            placeholder="Education, Business..."
            required
          />
        </label>
      )}
      {/* Paired so the whole form fits on one screen: the due day used to sit far below the fold. */}
      <div className="form-pair form-pair-tight">
        <label>
          Principal amount
          <input value={principal} onChange={(event) => setPrincipal(event.target.value)} placeholder="₹0" inputMode="decimal" required />
        </label>
        <label>
          Current outstanding
          <input value={outstanding} onChange={(event) => setOutstanding(event.target.value)} placeholder="₹0" inputMode="decimal" required />
        </label>
      </div>
      <small className="field-hint">Planning to add past EMIs too? Enter the outstanding before the earliest one.</small>
      <div className="form-pair form-pair-tight">
        <label>
          Month and year taken
          <input type="month" value={startMonth} onChange={(event) => setStartMonth(event.target.value)} required />
        </label>
        <label>
          Interest rate
          <input value={interestRate} onChange={(event) => setInterestRate(event.target.value)} placeholder="8.5%" inputMode="decimal" required />
        </label>
      </div>
      <div className="form-pair form-pair-tight">
        <label>
          Tenure in months
          <input value={tenureMonths} onChange={(event) => setTenureMonths(event.target.value)} placeholder="240" inputMode="numeric" required />
        </label>
        <label>
          EMI due day
          <input
            value={emiDueDay}
            onChange={(event) => setEmiDueDay(event.target.value)}
            placeholder="5"
            inputMode="numeric"
            min={1}
            max={31}
            type="number"
          />
        </label>
      </div>
      {isCardEmi && (
        <>
          <label>
            Credit card
            <select value={accountId} onChange={(event) => setAccountId(event.target.value)} required>
              {(cards ?? []).length === 0 && <option value="">No credit cards yet</option>}
              {(cards ?? []).map((card) => (
                <option key={card.id} value={card.id}>
                  {card.name}
                </option>
              ))}
            </select>
          </label>
          <small className="field-hint">
            This EMI's unpaid balance is added to that card's outstanding. Do not also enter the
            original purchase as a transaction on the card, or it will be counted twice.
          </small>
        </>
      )}
      <small className="field-hint">
        The EMI due day is the day of the month it leaves your account. Set it and the Overview reminds you before it is due.
      </small>
      <label>
        Monthly EMI
        <input value={monthlyEmi} onChange={(event) => setMonthlyEmi(event.target.value)} placeholder="₹0" inputMode="decimal" required />
        {suggestedEmiPaise > 0 && (
          <span className="field-suggestion">
            <span>
              A {tenureMonths}-month loan of {formatINR(parseAmountToPaise(principal))} at {interestRate.replace("%", "")}% works out
              to <strong>{formatINR(suggestedEmiPaise)}</strong> a month.
            </span>
            {parseAmountToPaise(monthlyEmi || "0") !== suggestedEmiPaise && (
              <button type="button" className="text-action" onClick={() => setMonthlyEmi(amountInputFromPaise(suggestedEmiPaise))}>
                Use this
              </button>
            )}
          </span>
        )}
      </label>
      {error && <p className="form-error">{error}</p>}
      <div className="loan-form-actions">
        {onCancel && (
          <button type="button" className="secondary-action" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        )}
        <button className="primary-action" disabled={saving}>
          <Plus size={18} />
          {saving ? "Saving..." : loan ? "Save loan" : "Add loan"}
        </button>
      </div>
    </form>
  );
}

function LoanCard({
  loan,
  onEdit,
  onArchive,
  onRestore
}: {
  loan: Loan;
  onEdit: (loan: Loan) => void;
  onArchive?: (loan: Loan) => void;
  onRestore?: (loan: Loan) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const progress = loanProgressPercent(loan);
  const closed = loan.outstandingPaise <= 0;
  const monthsLeftLabel =
    closed ? "Paid off" : loan.monthsLeft === null ? "Not enough EMI data" : `${loan.monthsLeft} month${loan.monthsLeft === 1 ? "" : "s"} left`;

  return (
    <article className={`loan-card ${loan.isArchived ? "archived" : ""}`}>
      <div className="loan-card-header">
        <div className="loan-title">
          <span className="loan-icon" style={{ color: loan.subcategoryColor, background: `${loan.subcategoryColor}14` }}>
            <IconGlyph name={loan.subcategoryIcon} size={18} />
          </span>
          <div>
            <strong>{loan.name}</strong>
            <span>{loan.subcategoryName}</span>
          </div>
        </div>
        <div className="loan-header-actions">
          {/* The card an EMI runs on, as a chip beside the status and in its shape: that is the
              one thing telling two EMIs of the same kind apart, and it reads as a fact about the
              EMI rather than as part of its type. An ordinary loan has no card and shows none. */}
          {loan.accountName && <span className="loan-bank">{loan.accountName}</span>}
          <span className={`loan-status ${closed ? "closed" : loan.isArchived ? "archived" : ""}`}>
            {loan.isArchived ? "Archived" : closed ? "Paid off" : "Active"}
          </span>
          <button
            type="button"
            className={`icon-button disclosure-toggle ${expanded ? "expanded" : ""}`}
            aria-label={expanded ? `Collapse ${loan.name}` : `Expand ${loan.name}`}
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            <ChevronDown size={18} />
          </button>
        </div>
      </div>

      <div className="loan-card-quick">
        <span>Current outstanding</span>
        <strong>{formatINR(loanOutstandingValue(loan))}</strong>
        <small>{monthsLeftLabel}</small>
      </div>

      {expanded && <>
      <div className="loan-progress">
        <div>
          <span>Principal repaid</span>
          <strong>{Math.round(progress)}%</strong>
        </div>
        <div className="loan-progress-bar">
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="loan-metrics">
        <Metric label="Principal amount paid" value={formatINR(loanPrincipalPaidValue(loan))} />
        <Metric
          label={loan.estimatedHistoricalInterestPaidPaise > 0 ? "Interest paid (incl. estimate)" : "Interest paid"}
          value={formatINR(loanInterestPaidValue(loan))}
        />
        <Metric label="Months left" value={monthsLeftLabel} warning={!closed && loan.monthsLeft !== null && loan.monthsLeft <= 6} />
      </div>

      <div className="loan-detail-grid">
        <div>
          <span>Principal</span>
          <strong>{formatINR(loan.principalAmountPaise)}</strong>
        </div>
        <div>
          <span>EMI</span>
          <strong>{formatINR(loan.monthlyEmiPaise)}</strong>
        </div>
        <div>
          <span>Interest</span>
          <strong>{formatRateFromBps(loan.annualInterestRateBps)}</strong>
        </div>
        <div>
          <span>Started</span>
          <strong>{formatMonth(loan.startMonth)}</strong>
        </div>
        <div>
          <span>Tenure</span>
          <strong>{loan.tenureMonths} months</strong>
        </div>
        <div>
          <span>Est. closure</span>
          <strong>{closed ? "Paid off" : loan.closureMonth ? formatMonth(loan.closureMonth) : "Review EMI"}</strong>
        </div>
      </div>

      <div className="loan-actions">
        <button className="secondary-action" onClick={() => onEdit(loan)}>
          <Pencil size={16} />
          Edit
        </button>
        {loan.isArchived ? (
          <button className="secondary-action" onClick={() => onRestore?.(loan)}>
            <RotateCcw size={16} />
            Restore
          </button>
        ) : (
          <button className="secondary-action danger-action" onClick={() => onArchive?.(loan)}>
            <Archive size={16} />
            Archive
          </button>
        )}
      </div>

      <PaymentHistoryGrid source="loan" id={loan.id} />
      </>}
    </article>
  );
}

function InvestmentsPage({
  investments,
  accounts,
  grouping,
  refresh,
  showNotice,
  requestConfirm
}: {
  investments: Investment[];
  accounts: Account[];
  grouping: HoldingGrouping;
  refresh: () => Promise<void>;
  showNotice: (message: string) => void;
  requestConfirm: (request: ConfirmRequest) => void;
}) {
  const bankAccounts = accounts.filter((account) => account.type === "bank");
  const [editing, setEditing] = useState<Investment | null>(null);
  const [adding, setAdding] = useState(false);
  const [chartTypeId, setChartTypeId] = useState<string>("all");
  const totalInvested = investments.reduce((sum, item) => sum + item.investedPaise, 0);
  const totalCurrent = investments.reduce((sum, item) => sum + item.currentValuePaise, 0);
  const totalGain = totalCurrent - totalInvested;
  const returnPercent = totalInvested > 0 ? Math.round((totalGain / totalInvested) * 100) : 0;
  const groups = INVESTMENT_TYPES.map((type) => ({
    type,
    items: investments.filter((item) => item.type === type.id)
  })).filter((group) => group.items.length > 0);

  // Grouped by type by default; picking one type opens up its own holdings.
  const chartType = INVESTMENT_TYPES.find((type) => type.id === chartTypeId) ?? null;
  const chartSegments = chartType ? holdingSegments(investments, chartType.id) : investmentTypeSegments(investments);
  const chartTotalPaise = chartSegments.reduce((sum, segment) => sum + segment.amountPaise, 0);

  function remove(investment: Investment) {
    requestConfirm({
      message: "Remove this investment?",
      detail: `${investment.name} will be removed from your portfolio.`,
      confirmLabel: "Remove",
      tone: "danger",
      onConfirm: async () => {
        try {
          await Api.deleteInvestment(investment.id);
          if (editing?.id === investment.id) setEditing(null);
          await refresh();
          showNotice("Investment removed.");
        } catch (err) {
          showNotice(err instanceof Error ? err.message : "Could not remove investment.");
        }
      }
    });
  }

  return (
    <div className="page-grid loans-page">
      <PageHeader
        title="Investments"
        actions={
          <button type="button" className="primary-action" onClick={() => setAdding(true)}>
            <Plus size={17} />
            Add investment
          </button>
        }
      />
      <section className="summary-grid report-summary">
        <SummaryCard label="Invested" value={formatINRWhole(totalInvested)} countPaise={totalInvested} icon={<WalletCards />} />
        <SummaryCard label="Current value" value={formatINRWhole(totalCurrent)} countPaise={totalCurrent} icon={<BarChart3 />} />
        <SummaryCard
          label="Total gain"
          value={signedImpact(totalGain)}
          icon={<TrendingUp />}
          valueClassName={gainToneClass(totalGain)}
        />
        <SummaryCard
          label="Return"
          value={`${returnPercent > 0 ? "+" : ""}${returnPercent}%`}
          icon={<ArrowDownUp />}
          valueClassName={gainToneClass(totalGain)}
        />
      </section>

      <div className="two-column loans-layout">
        <Panel title="Portfolio">
          {groups.length === 0 ? (
            <EmptyState text="No investments yet. Add your first holding below." />
          ) : (
            <div className="investment-groups">
              {groups.map((group) => (
                <InvestmentGroup
                  key={group.type.id}
                  type={group.type}
                  items={group.items}
                  grouping={grouping}
                  onEdit={setEditing}
                  onDelete={remove}
                />
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title={chartType ? `${chartType.label} holdings` : "Current value by type"}
          action={
            <label className="chart-scope">
              <span className="visually-hidden">Show</span>
              <select value={chartTypeId} onChange={(event) => setChartTypeId(event.target.value)}>
                <option value="all">All types</option>
                {INVESTMENT_TYPES.filter((type) => investments.some((item) => item.type === type.id)).map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>
          }
        >
          <MixChart
            segments={chartSegments}
            totalPaise={chartTotalPaise}
            ariaLabel={chartType ? `${chartType.label} holdings` : "Current value by type"}
            centerLabel={chartType ? chartType.label : "Portfolio"}
            centerValue={formatINRWhole(chartTotalPaise)}
            centerCountPaise={chartTotalPaise}
            className="overview-donut-chart"
            emptyText={chartType ? `Nothing held in ${chartType.label} yet.` : "Add a holding to see how your portfolio is split."}
            onSegmentClick={chartType ? undefined : (segment) => setChartTypeId(segment.id)}
          />
        </Panel>
      </div>

      {adding && (
        <FormDialog title="Add investment" onClose={() => setAdding(false)}>
        <InvestmentForm
          investment={null}
          bankAccounts={bankAccounts}
          onCancel={() => setAdding(false)}
          onSaved={async (message) => {
            setAdding(false);
            await refresh();
            showNotice(message);
          }}
        />
      </FormDialog>
      )}

      {editing && (
        <FormDialog title="Edit investment" onClose={() => setEditing(null)}>
          <InvestmentForm
            key={editing.id}
            investment={editing}
            bankAccounts={bankAccounts}
            onCancel={() => setEditing(null)}
            onSaved={async (message) => {
              setEditing(null);
              await refresh();
              showNotice(message);
            }}
          />
        </FormDialog>
      )}


    </div>
  );
}

function InvestmentCard({
  investment,
  onEdit,
  onDelete
}: {
  investment: Investment;
  onEdit: (investment: Investment) => void;
  onDelete: (investment: Investment) => void;
}) {
  const tone = gainToneClass(investment.gainPaise);
  const positive = investment.gainPaise > 0;
  const pays = isPayoutInvestmentType(investment.type);
  return (
    <article className="loan-card investment-card">
      <div className="loan-card-header">
        <div className="loan-title">
          <span className="loan-icon" style={{ color: investment.color, background: `${investment.color}18` }}>
            <IconGlyph name={investment.icon} size={18} />
          </span>
          <div>
            <strong>{investment.name}</strong>
            <span>
              {investment.typeLabel}
              {investment.type === "stocks" && investment.shares != null
                ? ` · ${investment.shares} shares`
                : ""}
            </span>
          </div>
        </div>
        {/* A scheme that pays its interest out has no gain to show: the money invested is still
            the money invested. What it has paid is reported below, as interest earned. */}
        {!pays && (
          <span className={`investment-gain-badge ${tone}`}>
            {positive ? "+" : ""}
            {investment.gainPercent}%
          </span>
        )}
      </div>

      <div className="investment-values">
        <div>
          <span>Invested</span>
          <strong>{formatINR(investment.investedPaise)}</strong>
        </div>
        <div>
          <span>Current</span>
          <strong>{formatINR(investment.currentValuePaise)}</strong>
        </div>
        <div>
          <span>{pays ? "Interest earned" : "Gain / loss"}</span>
          <strong className={pays ? gainToneClass(investment.payoutCreditedPaise) : tone}>
            {pays ? formatINR(investment.payoutCreditedPaise) : signedImpact(investment.gainPaise)}
          </strong>
        </div>
      </div>

      {investment.payoutCreditCount > 0 && (
        /* What this holding has actually paid back, and where it went. The gain above is exactly
           this figure, so the two read as one statement rather than two. */
        <p className="investment-sip-note">
          Credited {formatINR(investment.payoutCreditedPaise)} to {investment.payoutAccountName ?? "your bank"} over{" "}
          {investment.payoutCreditCount} payment{investment.payoutCreditCount === 1 ? "" : "s"}.
        </p>
      )}

      {investment.payoutAmountPaise != null && investment.nextPayoutDate && (
        <p className="investment-note">
          Next {formatINR(investment.payoutAmountPaise)} on {formatDateWithYear(investment.nextPayoutDate)}
          {investment.payoutDay ? ` · ${ordinalDay(investment.payoutDay)} of the month` : ""}
        </p>
      )}

      {investment.sipAmountPaise != null && (
        <p className="investment-note">
          SIP of {formatINR(investment.sipAmountPaise)} from {investment.sipAccountName ?? "your bank"}
          {investment.sipDay ? ` · ${ordinalDay(investment.sipDay)} of the month` : ""}
          {investment.nextSipDate ? ` · next ${formatDateWithYear(investment.nextSipDate)}` : ""}
        </p>
      )}

      {pays && investment.payoutEndDate && (
        <p className="investment-note">
          {investment.nextPayoutDate ? "Pays until" : "Stopped paying on"}{" "}
          {formatDateWithYear(investment.payoutEndDate)}
        </p>
      )}

      {investment.sipsSinceCount > 0 && (
        <p className="investment-sip-note">
          Includes {formatINR(investment.sipsSincePaise)} from {investment.sipsSinceCount} SIP
          {investment.sipsSinceCount === 1 ? "" : "s"} logged since {formatDateWithYear(investment.investedAsOf)}.
        </p>
      )}

      {investment.purchaseDate && (
        <p className="investment-note">Invested on {formatDateWithYear(investment.purchaseDate)}</p>
      )}

      {investment.note && <p className="investment-note">{investment.note}</p>}

      <div className="loan-actions">
        <button type="button" className="secondary-action" onClick={() => onEdit(investment)}>
          <Pencil size={16} />
          Edit
        </button>
        <button type="button" className="secondary-action danger-action" onClick={() => onDelete(investment)}>
          <Trash2 size={16} />
          Remove
        </button>
      </div>

      {investment.type === "mutual_funds" && <PaymentHistoryGrid source="mutual_fund" id={investment.id} />}
    </article>
  );
}

function InvestmentGroup({
  type,
  items,
  grouping,
  onEdit,
  onDelete
}: {
  type: { id: string; label: string; icon: string; color: string };
  items: Investment[];
  grouping: HoldingGrouping;
  onEdit: (investment: Investment) => void;
  onDelete: (investment: Investment) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const invested = items.reduce((sum, item) => sum + item.investedPaise, 0);
  const current = items.reduce((sum, item) => sum + item.currentValuePaise, 0);
  const gain = current - invested;
  const gainPercent = invested > 0 ? Math.round((gain / invested) * 100) : 0;
  const tone = gainToneClass(gain);
  // These never gain: they are worth what went into them and pay the interest out instead. A
  // "Net gain 0%" beside them would be true and useless; what has been earned is the figure.
  const pays = isPayoutInvestmentType(type.id);
  const interestEarned = items.reduce((sum, item) => sum + item.payoutCreditedPaise, 0);

  return (
    <div className={`investment-group ${expanded ? "expanded" : ""}`}>
      <button
        type="button"
        className="investment-group-head"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="investment-group-name" style={{ color: type.color }}>
          <IconGlyph name={type.icon} size={16} />
          {type.label}
          <span className="investment-group-count">{items.length}</span>
        </span>
        <div className="investment-group-metrics">
          <div>
            <span>Invested</span>
            <strong>{formatINR(invested)}</strong>
          </div>
          <div>
            <span>Current</span>
            <strong>{formatINR(current)}</strong>
          </div>
          <div>
            <span>{pays ? "Interest earned" : `Net ${gain < 0 ? "loss" : "gain"}`}</span>
            <strong className={pays ? gainToneClass(interestEarned) : tone}>
              {pays ? formatINR(interestEarned) : `${signedImpact(gain)} (${gainPercent > 0 ? "+" : ""}${gainPercent}%)`}
            </strong>
          </div>
        </div>
        <ChevronDown className={`investment-group-chevron ${expanded ? "expanded" : ""}`} size={20} />
      </button>

      {expanded &&
        groupHoldingsByPeriod(items, grouping).map((period) => (
          <div className="investment-period" key={period.key}>
            {period.label && (
              <h4 className="investment-period-head">
                {period.label}
                <span className="investment-group-count">{period.items.length}</span>
              </h4>
            )}
            <div className="loan-card-grid">
              {period.items.map((investment) => (
                <InvestmentCard key={investment.id} investment={investment} onEdit={onEdit} onDelete={onDelete} />
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}

function InvestmentForm({
  investment,
  bankAccounts,
  onSaved,
  onCancel
}: {
  investment: Investment | null;
  bankAccounts: Account[];
  onSaved: (message: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [type, setType] = useState<InvestmentType>(investment?.type ?? "stocks");
  const [name, setName] = useState(investment?.name ?? "");
  const [invested, setInvested] = useState(investment ? amountInputFromPaise(investment.investedPaise) : "");
  const [currentValue, setCurrentValue] = useState(
    investment ? amountInputFromPaise(investment.currentValuePaise) : ""
  );
  const [sharesInput, setSharesInput] = useState(
    investment?.shares != null ? String(investment.shares) : ""
  );
  const [purchaseDate, setPurchaseDate] = useState(investment?.purchaseDate ?? todayISO());
  const [payoutFrequency, setPayoutFrequency] = useState<PayoutFrequency>(
    investment?.payoutFrequency ?? "monthly"
  );
  const [payoutAmount, setPayoutAmount] = useState(
    investment?.payoutAmountPaise != null ? amountInputFromPaise(investment.payoutAmountPaise) : ""
  );
  const [payoutDay, setPayoutDay] = useState(String(investment?.payoutDay ?? 1));
  const [payoutAccountId, setPayoutAccountId] = useState(
    investment?.payoutAccountId ?? bankAccounts[0]?.id ?? ""
  );
  const [payoutEndDate, setPayoutEndDate] = useState(investment?.payoutEndDate ?? "");
  const [sipMode, setSipMode] = useState(investment?.sipAmountPaise != null ? "sip" : "lumpsum");
  const [sipAmount, setSipAmount] = useState(
    investment?.sipAmountPaise != null ? amountInputFromPaise(investment.sipAmountPaise) : ""
  );
  const [sipDay, setSipDay] = useState(String(investment?.sipDay ?? 1));
  const [sipAccountId, setSipAccountId] = useState(investment?.sipAccountId ?? bankAccounts[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // A post office scheme, a fixed deposit and a bond all keep the money where it is and pay the
  // interest into a bank, so each is described by a schedule rather than by a current value
  // anyone has to keep up to date.
  const pays = isPayoutInvestmentType(type);
  // A fund can be bought in one go or a little each month. Only the second needs a schedule.
  const isSip = type === "mutual_funds" && sipMode === "sip";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Enter a name for this investment.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const shares =
        type === "stocks" && sharesInput.trim() !== "" ? Number(sharesInput) : undefined;
      if (pays && !payoutAccountId) {
        setError("Choose the bank this is credited to.");
        setSaving(false);
        return;
      }
      if (pays && !payoutEndDate) {
        setError("Enter the last day this pays interest.");
        setSaving(false);
        return;
      }
      if (isSip && !sipAccountId) {
        setError("Choose the bank the SIP comes from.");
        setSaving(false);
        return;
      }
      /* On an edit, a section that is switched off is sent as null rather than left out: a
         field the request does not carry cannot be told apart from a field nobody touched, and
         that is why a fund moved back from SIP to lump sum used to keep its schedule. On a new
         holding there is nothing to clear, so the keys are simply omitted. */
      // Null is this section being switched off; a create drops those keys instead.
      const off = null;
      const payload = {
        type,
        name: name.trim(),
        investedPaise: parseAmountToPaise(invested),
        // A paying holding's current value is its principal plus what it has credited, which the
        // server works out from the credits themselves; sending a figure would only fight it.
        currentValuePaise: pays ? undefined : parseAmountToPaise(currentValue),
        shares: shares ?? off,
        purchaseDate: purchaseDate || off,
        payoutFrequency: pays ? payoutFrequency : off,
        payoutAmountPaise: pays ? parseAmountToPaise(payoutAmount) : off,
        payoutDay: pays ? Number(payoutDay) : off,
        payoutAccountId: pays ? payoutAccountId : off,
        payoutEndDate: pays ? payoutEndDate : off,
        sipAmountPaise: isSip ? parseAmountToPaise(sipAmount) : off,
        sipDay: isSip ? Number(sipDay) : off,
        sipAccountId: isSip ? sipAccountId : off
      };
      if (investment) {
        // A note saved before this field was removed is left as it is.
        await Api.updateInvestment(investment.id, payload);
        await onSaved("Investment updated.");
      } else {
        await Api.createInvestment(withoutCleared(payload));
        setName("");
        setInvested("");
        setCurrentValue("");
        setSharesInput("");
        setPurchaseDate(todayISO());
        setPayoutAmount("");
        await onSaved("Investment added.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save investment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="stack-form loan-form" onSubmit={submit}>
      <label>
        Type
        <select value={type} onChange={(event) => setType(event.target.value as InvestmentType)}>
          {INVESTMENT_TYPES.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Reliance, HDFC Flexicap, Plot in Mysore..." required />
      </label>
      <label>
        Amount invested
        <input value={invested} onChange={(event) => setInvested(event.target.value)} placeholder="₹0" inputMode="decimal" required />
      </label>
      {!pays && (
        <label>
          Current value
          <input value={currentValue} onChange={(event) => setCurrentValue(event.target.value)} placeholder="₹0" inputMode="decimal" required />
        </label>
      )}
      {pays && (
        <>
          <label>
            Money credited
            <select
              value={payoutFrequency}
              onChange={(event) => setPayoutFrequency(event.target.value as PayoutFrequency)}
            >
              {PAYOUT_FREQUENCIES.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Interest amount
            <input
              value={payoutAmount}
              onChange={(event) => setPayoutAmount(event.target.value)}
              placeholder="₹0"
              inputMode="decimal"
              required
            />
          </label>
          <label>
            Day it is credited
            <select value={payoutDay} onChange={(event) => setPayoutDay(event.target.value)}>
              {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                <option key={day} value={String(day)}>
                  {ordinalDay(day)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Credited to
            <select value={payoutAccountId} onChange={(event) => setPayoutAccountId(event.target.value)} required>
              <option value="">Choose bank</option>
              {bankAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          {/* The two ends of the holding's life, in the order they happen. */}
          <label>
            Date invested
            <input
              type="date"
              value={purchaseDate}
              onChange={(event) => setPurchaseDate(event.target.value)}
              min={EARLIEST_DATE}
              max={LATEST_DATE}
            />
          </label>
          <label>
            Last day it pays
            <input
              type="date"
              value={payoutEndDate}
              onChange={(event) => setPayoutEndDate(event.target.value)}
              min={EARLIEST_DATE}
              max={LATEST_DATE}
              required
            />
          </label>
          <p className="field-hint investment-form-hint">
            Each credit is added to that bank on its day, from the date invested until the day it
            stops paying. The holding stays worth what you put in; what it pays is interest earned.
          </p>
        </>
      )}
      {type === "mutual_funds" && (
        <>
          <label>
            How do you invest?
            <select value={sipMode} onChange={(event) => setSipMode(event.target.value)}>
              <option value="lumpsum">Lump sum</option>
              <option value="sip">SIP</option>
            </select>
          </label>
          {isSip && (
            <>
              <label>
                Monthly investment
                <input
                  value={sipAmount}
                  onChange={(event) => setSipAmount(event.target.value)}
                  placeholder="₹0"
                  inputMode="decimal"
                  required
                />
              </label>
              <label>
                SIP date
                <select value={sipDay} onChange={(event) => setSipDay(event.target.value)}>
                  {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                    <option key={day} value={String(day)}>
                      {ordinalDay(day)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Paid from
                <select value={sipAccountId} onChange={(event) => setSipAccountId(event.target.value)} required>
                  <option value="">Choose bank</option>
                  {bankAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <p className="field-hint investment-form-hint">
            {isSip
              ? "Each instalment is taken from that account on its day, from today onwards, but only when the balance covers it — and it raises what this fund has invested."
              : investment
                ? "These include SIPs you've logged. Change a figure only to match your statement; SIPs logged after today are added on top."
                : "SIPs you log against this fund after today are added to both figures automatically."}
          </p>
        </>
      )}
      {type === "stocks" && (
        <label>
          Number of shares (optional)
          <input
            value={sharesInput}
            onChange={(event) => setSharesInput(event.target.value)}
            placeholder="e.g. 10.5"
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
          />
        </label>
      )}
      {!pays && (
        <label>
          Date invested
          <input
            type="date"
            value={purchaseDate}
            onChange={(event) => setPurchaseDate(event.target.value)}
            min={EARLIEST_DATE}
            max={LATEST_DATE}
          />
        </label>
      )}
      {error && <p className="form-error">{error}</p>}
      <div className="loan-form-actions">
        {onCancel && (
          <button type="button" className="secondary-action" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        )}
        <button className="primary-action" disabled={saving}>
          <Plus size={18} />
          {saving ? "Saving..." : investment ? "Save investment" : "Add investment"}
        </button>
      </div>
    </form>
  );
}

function formatDateWithYear(dateLike: string) {
  const date = new Date(`${dateLike}T00:00:00`);
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function VacationsPage({
  vacations,
  refresh,
  showNotice,
  requestConfirm
}: {
  vacations: Vacation[];
  refresh: () => Promise<void>;
  showNotice: (message: string) => void;
  requestConfirm: (request: ConfirmRequest) => void;
}) {
  const [editing, setEditing] = useState<Vacation | null>(null);
  const [adding, setAdding] = useState(false);
  const totalSpent = vacations.reduce((sum, item) => sum + item.totalSpentPaise, 0);
  const totalBudget = vacations.reduce((sum, item) => sum + (item.budgetPaise ?? 0), 0);

  function remove(vacation: Vacation) {
    requestConfirm({
      message: "Remove this vacation?",
      detail: `${vacation.name} will be removed. The tagged expenses stay in your normal expenses. Only the trip grouping is deleted.`,
      confirmLabel: "Remove",
      tone: "danger",
      onConfirm: async () => {
        try {
          await Api.deleteVacation(vacation.id);
          if (editing?.id === vacation.id) setEditing(null);
          await refresh();
          showNotice("Vacation removed.");
        } catch (err) {
          showNotice(err instanceof Error ? err.message : "Could not remove vacation.");
        }
      }
    });
  }

  return (
    <div className="page-grid loans-page">
      <PageHeader
        title="Vacations"
        actions={
          <button type="button" className="primary-action" onClick={() => setAdding(true)}>
            <Plus size={17} />
            Add vacation
          </button>
        }
      />
      <section className="summary-grid report-summary">
        <SummaryCard label="Trips" value={String(vacations.length)} icon={<Plane />} />
        <SummaryCard label="Total spent" value={formatINRWhole(totalSpent)} countPaise={totalSpent} icon={<WalletCards />} />
        {totalBudget > 0 && <SummaryCard label="Total budget" value={formatINRWhole(totalBudget)} countPaise={totalBudget} icon={<Target />} />}
        {totalBudget > 0 && (
          <SummaryCard
            label="Left in budget"
            value={formatINRWhole(totalBudget - totalSpent)} countPaise={totalBudget - totalSpent}
            icon={<PiggyBank />}
            tone={totalBudget - totalSpent >= 0 ? "good" : "warning"}
          />
        )}
      </section>

      <p className="helper-text investments-asof">
        <Info size={14} />
        Tag any expense to a trip when you add it. It still counts in your normal expenses, and also rolls up here.
      </p>

      <Panel title="Your trips">
        {vacations.length === 0 ? (
          <EmptyState text="No vacations yet. Add your first trip below, then tag expenses to it." />
        ) : (
          <div className="vacation-list">
            {vacations.map((vacation) => (
              <VacationCard key={vacation.id} vacation={vacation} onEdit={setEditing} onDelete={remove} />
            ))}
          </div>
        )}
      </Panel>

      {adding && (
        <FormDialog title="Add vacation" onClose={() => setAdding(false)}>
        <VacationForm
          vacation={null}
          onCancel={() => setAdding(false)}
          onSaved={async (message) => {
            setAdding(false);
            await refresh();
            showNotice(message);
          }}
        />
      </FormDialog>
      )}

      {editing && (
        <FormDialog title="Edit vacation" onClose={() => setEditing(null)}>
          <VacationForm
            key={editing.id}
            vacation={editing}
            onCancel={() => setEditing(null)}
            onSaved={async (message) => {
              setEditing(null);
              await refresh();
              showNotice(message);
            }}
          />
        </FormDialog>
      )}
    </div>
  );
}

function VacationCard({
  vacation,
  onEdit,
  onDelete
}: {
  vacation: Vacation;
  onEdit: (vacation: Vacation) => void;
  onDelete: (vacation: Vacation) => void;
}) {
  const overBudget = vacation.budgetPaise !== null && vacation.totalSpentPaise > vacation.budgetPaise;
  const usedPercent =
    vacation.budgetPaise && vacation.budgetPaise > 0
      ? Math.min(100, Math.round((vacation.totalSpentPaise / vacation.budgetPaise) * 100))
      : 0;
  const dateLabel =
    vacation.startDate && vacation.endDate
      ? `${formatDateWithYear(vacation.startDate)} to ${formatDateWithYear(vacation.endDate)}`
      : vacation.startDate
        ? `From ${formatDateWithYear(vacation.startDate)}`
        : "";

  return (
    <article className="loan-card vacation-card">
      <div className="loan-card-header">
        <div className="loan-title">
          <span className="loan-icon" style={{ color: "#0ea5e9", background: "#0ea5e918" }}>
            <Plane size={18} />
          </span>
          <div>
            <strong>{vacation.name}</strong>
            <span>
              {vacation.transactionCount} expense{vacation.transactionCount === 1 ? "" : "s"}
              {dateLabel ? ` · ${dateLabel}` : ""}
            </span>
          </div>
        </div>
        <strong className="vacation-total">{formatINR(vacation.totalSpentPaise)}</strong>
      </div>

      {vacation.budgetPaise !== null && (
        <div className="vacation-budget">
          <div className="vacation-budget-head">
            <span>Budget</span>
            <strong className={overBudget ? "amount-out" : "amount-in"}>
              {formatINR(vacation.totalSpentPaise)} / {formatINR(vacation.budgetPaise)}
            </strong>
          </div>
          <div className="vacation-budget-bar">
            <span style={{ width: `${usedPercent}%`, background: overBudget ? "var(--danger)" : "var(--accent)" }} />
          </div>
          <small>
            {overBudget
              ? `Over by ${formatINR(vacation.totalSpentPaise - vacation.budgetPaise)}`
              : `${formatINR(vacation.budgetPaise - vacation.totalSpentPaise)} left`}
          </small>
        </div>
      )}

      {vacation.breakdown.length > 0 ? (
        <div className="vacation-breakdown">
          {vacation.breakdown.map((item) => {
            const share =
              vacation.totalSpentPaise > 0 ? Math.round((item.amountPaise / vacation.totalSpentPaise) * 100) : 0;
            return (
              <div className="vacation-breakdown-row" key={item.subcategoryId}>
                <span className="vacation-breakdown-name">
                  <IconGlyph name={item.icon} size={14} />
                  {item.name}
                </span>
                <div className="vacation-breakdown-bar">
                  <span style={{ width: `${share}%`, background: item.color }} />
                </div>
                <strong>{formatINR(item.amountPaise)}</strong>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="investment-note">No expenses tagged to this trip yet.</p>
      )}

      {vacation.note && <p className="investment-note">{vacation.note}</p>}

      <div className="loan-actions">
        <button type="button" className="secondary-action" onClick={() => onEdit(vacation)}>
          <Pencil size={16} />
          Edit
        </button>
        <button type="button" className="secondary-action danger-action" onClick={() => onDelete(vacation)}>
          <Trash2 size={16} />
          Remove
        </button>
      </div>
    </article>
  );
}

function VacationForm({
  vacation,
  onSaved,
  onCancel
}: {
  vacation: Vacation | null;
  onSaved: (message: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(vacation?.name ?? "");
  const [startDate, setStartDate] = useState(vacation?.startDate ?? "");
  const [endDate, setEndDate] = useState(vacation?.endDate ?? "");
  const [budget, setBudget] = useState(vacation?.budgetPaise != null ? amountInputFromPaise(vacation.budgetPaise) : "");
  const [note, setNote] = useState(vacation?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Enter a trip name.");
      return;
    }
    if (startDate && endDate && startDate > endDate) {
      setError("Trip start date must be on or before the end date.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const budgetPaise = budget.trim() ? parseAmountToPaise(budget) : 0;
      if (vacation) {
        await Api.updateVacation(vacation.id, {
          name: name.trim(),
          startDate: startDate || "",
          endDate: endDate || "",
          budgetPaise,
          note: note.trim()
        });
        await onSaved("Vacation updated.");
      } else {
        await Api.createVacation({
          name: name.trim(),
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          budgetPaise: budgetPaise > 0 ? budgetPaise : undefined,
          note: note.trim() || undefined
        });
        setName("");
        setStartDate("");
        setEndDate("");
        setBudget("");
        setNote("");
        await onSaved("Vacation created.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save vacation.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="stack-form loan-form" onSubmit={submit}>
      <label>
        Trip name
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Goa trip, Europe 2026..." required />
      </label>
      <div className="form-pair">
        <label>
          Start date (optional)
          <input type="date" min={EARLIEST_DATE} max={LATEST_DATE} value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        </label>
        <label>
          End date (optional)
          <input type="date" min={EARLIEST_DATE} max={LATEST_DATE} value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </label>
      </div>
      <label>
        Trip budget (optional)
        <input value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="₹0" inputMode="decimal" />
      </label>
      <label>
        Note (optional)
        <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. family trip, 5 nights" />
      </label>
      {error && <p className="form-error">{error}</p>}
      <div className="loan-form-actions">
        {onCancel && (
          <button type="button" className="secondary-action" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        )}
        <button className="primary-action" disabled={saving}>
          <Plus size={18} />
          {saving ? "Saving..." : vacation ? "Save vacation" : "Add vacation"}
        </button>
      </div>
    </form>
  );
}

function SubscriptionsPage({
  subscriptions,
  accounts,
  refresh,
  showNotice,
  requestConfirm
}: {
  subscriptions: AutopaySubscription[];
  accounts: Account[];
  refresh: () => Promise<void>;
  showNotice: (message: string) => void;
  requestConfirm: (request: ConfirmRequest) => void;
}) {
  const [editing, setEditing] = useState<AutopaySubscription | null>(null);
  const [adding, setAdding] = useState(false);
  /* A subscription charged to a card is the ordinary case, not an exception, and this list
     showing banks alone is how the owner came to open the form and find their cards missing. */
  const debitAccounts = accounts.filter(
    (account) => !account.isArchived && (account.type === "bank" || account.type === "credit_card")
  );
  const active = subscriptions.filter((subscription) => !subscription.isArchived);
  const activeCount = active.filter((subscription) => subscription.status === "active").length;
  const monthlyTotal = active
    .filter((subscription) => subscription.status === "active")
    .reduce((sum, subscription) => sum + subscription.amountPaise, 0);

  /* Running and finished, the way the accounts page groups banks and cards: a heading only
     where something sits under it. "Expired" is the subscription's own word for a term that has
     run its course -- it is not archived, and it is not gone. */
  const subscriptionGroups = [
    {
      key: "running",
      title: "Running",
      subscriptions: active.filter((subscription) => subscription.status === "active")
    },
    {
      key: "finished",
      title: "Finished",
      subscriptions: active.filter((subscription) => subscription.status !== "active")
    }
  ].filter((group) => group.subscriptions.length > 0);

  function remove(subscription: AutopaySubscription) {
    requestConfirm({
      message: `Delete ${subscription.name}?`,
      /* The thing worth saying plainly, because it is the thing that makes deleting safe: the
         payments it already made are money that actually moved, and they stay. */
      detail:
        "The subscription goes and stops being counted. Every payment it has already made stays on your transactions, and your balances do not change.",
      confirmLabel: "Delete",
      tone: "danger",
      onConfirm: async () => {
        try {
          await Api.deleteSubscription(subscription.id);
          if (editing?.id === subscription.id) setEditing(null);
          await refresh();
          showNotice("Subscription deleted. Its payments are still on your transactions.");
        } catch (err) {
          showNotice(err instanceof Error ? err.message : "Could not delete subscription.");
        }
      }
    });
  }

  return (
    <div className="page-grid loans-page">
      <PageHeader
        title="AutoPay"
        actions={
          <button type="button" className="primary-action" onClick={() => setAdding(true)}>
            <Plus size={17} />
            Add subscription
          </button>
        }
      />
      <section className="summary-grid mini loan-summary-grid">
        <SummaryCard label="Active subscriptions" value={String(activeCount)} icon={<CalendarClock />} />
        <SummaryCard label="Monthly total" value={formatINRWhole(monthlyTotal)} countPaise={monthlyTotal} icon={<ArrowDownUp />} tone="warning" />
      </section>

      {/*
        * Laid out like the Accounts page, which is what the owner asked for: the cards are the
        * page rather than the contents of a panel on it, grouped by whether they are still
        * running, three across. There is no archived group any more -- archive became delete,
        * so a subscription is either here or gone.
        */}
      {subscriptionGroups.map((group) => (
        <section className="account-group" key={group.key}>
          <h2 className="account-group-title">{group.title}</h2>
          <div className="budget-grid accounts-grid">
            {group.subscriptions.map((subscription) => (
              <SubscriptionCard
                key={subscription.id}
                subscription={subscription}
                onEdit={setEditing}
                onDelete={remove}
              />
            ))}
          </div>
        </section>
      ))}

      {subscriptionGroups.length === 0 && <EmptyState text="No subscriptions yet. Add one to start tracking." />}

      {adding && (
        <FormDialog title="Add subscription" onClose={() => setAdding(false)}>
        <SubscriptionForm
          subscription={null}
          debitAccounts={debitAccounts}
          onCancel={() => setAdding(false)}
          onSaved={async (message) => {
            setAdding(false);
            await refresh();
            showNotice(message);
          }}
        />
      </FormDialog>
      )}

      {editing && (
        <FormDialog title="Edit subscription" onClose={() => setEditing(null)}>
          <SubscriptionForm
            key={editing.id}
            subscription={editing}
            debitAccounts={debitAccounts}
            onCancel={() => setEditing(null)}
            onSaved={async (message) => {
              setEditing(null);
              await refresh();
              showNotice(message);
            }}
          />
        </FormDialog>
      )}
    </div>
  );
}

function SubscriptionCard({
  subscription,
  onEdit,
  onDelete
}: {
  subscription: AutopaySubscription;
  onEdit: (subscription: AutopaySubscription) => void;
  /* Archive and Restore were a pair; the owner asked for delete instead, and there is nothing
     to restore from. The payments a deleted subscription made stay on the transactions. */
  onDelete?: (subscription: AutopaySubscription) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const expired = subscription.status === "expired";
  return (
    <article className="loan-card">
      <div className="loan-card-header">
        <div className="loan-title">
          <span className="loan-icon" style={{ color: "#4f46e5", background: "#4f46e514" }}>
            <IconGlyph name="calendar-clock" size={18} />
          </span>
          <div>
            <strong>{subscription.name}</strong>
            <span>{formatINR(subscription.amountPaise)} / cycle</span>
          </div>
        </div>
        <div className="loan-header-actions">
          {/* The bank the payment is taken from, in the same chip the EMI tracker uses: two
              subscriptions of the same amount are told apart by where the money leaves from.
              One with no bank set only reminds, and wears no chip. */}
          {subscription.accountName && <span className="loan-bank">{subscription.accountName}</span>}
          <span className={`subscription-status ${expired ? "expired" : "active"}`}>
            {expired ? "Expired" : "Active"}
          </span>
          <button
            type="button"
            className={`icon-button disclosure-toggle ${expanded ? "expanded" : ""}`}
            aria-label={expanded ? `Collapse ${subscription.name}` : `Expand ${subscription.name}`}
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            <ChevronDown size={18} />
          </button>
        </div>
      </div>

      <div className="loan-card-quick">
        <span>Payments made</span>
        <strong>{subscription.paymentCount}</strong>
        <small>Renews until {formatDateWithYear(subscription.expiryDate)}</small>
      </div>

      {expanded && <>
      <div className="subscription-meta">
        <div>
          <span>Started</span>
          <strong>{formatDateWithYear(subscription.startDate)}</strong>
        </div>
        <div>
          <span>Expires</span>
          <strong>{formatDateWithYear(subscription.expiryDate)}</strong>
        </div>
        <div>
          <span>Duration</span>
          <strong>{subscription.durationMonths} months</strong>
        </div>
        <div>
          <span>Payments made</span>
          <strong>{subscription.paymentCount}</strong>
        </div>
      </div>

      <div className="loan-actions">
        <button type="button" className="secondary-action" onClick={() => onEdit(subscription)}>
          <Pencil size={16} />
          Edit
        </button>
        {onDelete && (
          <button type="button" className="secondary-action danger-action" onClick={() => onDelete(subscription)}>
            <Trash2 size={16} />
            Delete
          </button>
        )}
      </div>

      <PaymentHistoryGrid source="autopay" id={subscription.id} />
      </>}
    </article>
  );
}

function SubscriptionForm({
  subscription,
  debitAccounts,
  onSaved,
  onCancel
}: {
  subscription: AutopaySubscription | null;
  /** Every account an AutoPay can come out of: a bank or a card. */
  debitAccounts: Account[];
  onSaved: (message: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(subscription?.name ?? "");
  const [amount, setAmount] = useState(subscription ? amountInputFromPaise(subscription.amountPaise) : "");
  const [startDate, setStartDate] = useState(subscription?.startDate ?? todayISO());
  const [durationMonths, setDurationMonths] = useState(String(subscription?.durationMonths ?? 12));
  const [accountId, setAccountId] = useState(subscription?.accountId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const payload = {
        name,
        amountPaise: parseAmountToPaise(amount),
        startDate,
        durationMonths: Number.parseInt(durationMonths, 10)
      };

      if (subscription) {
        // Empty means "no bank", which detaches it and stops it paying itself. A new
        // subscription has nothing to detach, so the key is left out below.
        await Api.updateSubscription(subscription.id, { ...payload, accountId: accountId || null });
        await onSaved("Subscription updated.");
      } else {
        await Api.createSubscription({ ...payload, ...(accountId ? { accountId } : {}) });
        setName("");
        setAmount("");
        setStartDate(todayISO());
        setDurationMonths("12");
        await onSaved("Subscription added.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save subscription.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="stack-form loan-form" onSubmit={submit}>
      <label>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Netflix, Spotify..." required />
      </label>
      <label>
        Amount
        <input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="₹0" inputMode="decimal" required />
      </label>
      <label>
        Start date
        <input type="date" min={EARLIEST_DATE} max={LATEST_DATE} value={startDate} onChange={(event) => setStartDate(event.target.value)} required />
      </label>
      <label>
        Duration
        <select value={durationMonths} onChange={(event) => setDurationMonths(event.target.value)} required>
          {AUTOPAY_DURATION_MONTH_OPTIONS.map((months) => (
            <option key={months} value={months}>
              {months} {months === 1 ? "month" : "months"}
            </option>
          ))}
        </select>
      </label>
      <label>
        Paid from
        <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
          <option value="">Just remind me</option>
          {debitAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name} · {accountTypeLabel(account.type)}
            </option>
          ))}
        </select>
      </label>
      {/* Named rather than implied: this is the one thing in the app that spends money without
          being asked each time, so it says plainly what it will and will not do. */}
      <p className="field-hint investment-form-hint">
        {accountId
          ? "Each payment is taken from that account on its day, from today onwards, but only when there is room for it -- the balance on a bank, what is left of the limit on a card. A month it cannot cover stays listed in Upcoming payments until it can."
          : "Left as a reminder, this is listed in Upcoming payments and you record each payment yourself."}
      </p>
      {error && <p className="form-error">{error}</p>}
      <div className="loan-form-actions">
        {onCancel && (
          <button type="button" className="secondary-action" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        )}
        <button className="primary-action" disabled={saving}>
          <Plus size={18} />
          {saving ? "Saving..." : subscription ? "Save subscription" : "Add subscription"}
        </button>
      </div>
    </form>
  );
}

function CategoriesPage({
  categoryTypes,
  refresh,
  showNotice,
  requestConfirm
}: {
  categoryTypes: CategoryType[];
  refresh: () => Promise<void>;
  showNotice: (message: string) => void;
  requestConfirm: (request: ConfirmRequest) => void;
}) {
  const [mode, setMode] = useState<"subtype" | "type">("subtype");
  const [name, setName] = useState("");
  const [typeId, setTypeId] = useState(categoryTypes.find((type) => type.behavior !== "card_payment")?.id ?? "");
  const [behavior, setBehavior] = useState<TaxonomyBehavior>("expense");
  const [icon, setIcon] = useState(iconOptions[0]);
  const [color, setColor] = useState(colorOptions[0]);
  const [openTypeIds, setOpenTypeIds] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const parentTypes = useMemo(
    () => categoryTypes.filter((type) => type.behavior !== "card_payment"),
    [categoryTypes]
  );

  useEffect(() => {
    if (typeId && parentTypes.some((type) => type.id === typeId)) return;
    setTypeId(parentTypes[0]?.id ?? "");
  }, [parentTypes, typeId]);

  useEffect(() => {
    setOpenTypeIds((current) => {
      const available = new Set(categoryTypes.map((type) => type.id));
      const retained = current.filter((id) => available.has(id));
      return retained.length === current.length ? current : retained;
    });
  }, [categoryTypes]);

  function toggleTypeOpen(id: string) {
    setOpenTypeIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      if (mode === "type") {
        await Api.createCategoryType({ name, behavior, icon, color });
      } else {
        await Api.createSubcategory({ typeId, name, icon, color });
      }
      setName("");
      setAdding(false);
      await refresh();
      showNotice(mode === "type" ? "Type created." : "SubType created.");
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Could not create item.");
    }
  }

  async function removeType(categoryType: CategoryType) {
    requestConfirm({
      message: "Are you sure you want to delete this?",
      detail: `${categoryType.name} and its SubTypes will be removed. Existing transactions will move to uncategorized.`,
      confirmLabel: "Delete",
      tone: "danger",
      onConfirm: async () => {
        try {
          await Api.deleteCategoryType(categoryType.id);
          await refresh();
          showNotice("Type deleted. Existing usage moved to uncategorized.");
        } catch (err) {
          showNotice(err instanceof Error ? err.message : "Could not delete Type.");
        }
      }
    });
  }

  async function removeSubcategory(subcategory: Subcategory) {
    requestConfirm({
      message: "Are you sure you want to delete this?",
      detail: `${subcategory.name} will be removed. Existing transactions will move to uncategorized.`,
      confirmLabel: "Delete",
      tone: "danger",
      onConfirm: async () => {
        try {
          await Api.deleteSubcategory(subcategory.id);
          await refresh();
          showNotice("SubType deleted. Existing usage moved to uncategorized.");
        } catch (err) {
          showNotice(err instanceof Error ? err.message : "Could not delete SubType.");
        }
      }
    });
  }

  return (
    <div className="page-grid">
      <PageHeader
        title="Categories"
        actions={
          <button type="button" className="primary-action" onClick={() => setAdding(true)}>
            <Plus size={17} />
            Create Type or SubType
          </button>
        }
      />
      <Panel title="Type library">
        <div className="taxonomy-tree">
          {categoryTypes.map((categoryType) => {
            const isOpen = openTypeIds.includes(categoryType.id);
            return (
            <div className={`taxonomy-group ${isOpen ? "open" : ""}`} key={categoryType.id}>
              <div className="taxonomy-type-row">
                <button
                  className="taxonomy-toggle"
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => toggleTypeOpen(categoryType.id)}
                >
                  <ChevronDown size={16} />
                  <CategoryBadge category={typeToCategory(categoryType)} />
                </button>
                <span className="category-flags">
                  {categoryType.isLocked ? "Locked" : categoryType.isSystem ? "Default" : "Custom"}
                </span>
                <button
                  className="icon-button danger"
                  onClick={() => removeType(categoryType)}
                  disabled={categoryType.isLocked}
                  title={categoryType.isLocked ? "This Type is locked" : "Delete Type"}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              {isOpen && categoryType.behavior === "card_payment" ? (
                <p className="helper-text dynamic-subtype-note">SubTypes come from active credit-card accounts.</p>
              ) : isOpen ? (
                <div className="taxonomy-subtypes">
                  {categoryType.subcategories.map((subcategory) => (
                    <div className="taxonomy-subtype-row" key={subcategory.id}>
                      <CategoryBadge category={subcategoryToCategory(subcategory)} compact />
                      <button
                        className="icon-button danger"
                        onClick={() => removeSubcategory(subcategory)}
                        disabled={subcategory.isLocked}
                        title={subcategory.isLocked ? "This SubType is locked" : "Delete SubType"}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
          })}
        </div>
      </Panel>

      {adding && (
        <FormDialog title="Create Type or SubType" onClose={() => setAdding(false)}>
        <form className="stack-form" onSubmit={submit}>
          <div className="segmented-control">
            <button type="button" className={mode === "subtype" ? "active" : ""} onClick={() => setMode("subtype")}>
              Add SubType
            </button>
            <button type="button" className={mode === "type" ? "active" : ""} onClick={() => setMode("type")}>
              Add Type
            </button>
          </div>
          {mode === "subtype" ? (
            <label>
              Parent Type
              <select value={typeId} onChange={(event) => setTypeId(event.target.value)} required>
                {parentTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              Money behavior
              <select value={behavior} onChange={(event) => setBehavior(event.target.value as TaxonomyBehavior)}>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
                <option value="loan">Loan</option>
                <option value="investment">Investment</option>
                <option value="transfer">Transfer</option>
                <option value="refund">Refund</option>
              </select>
            </label>
          )}
          <label>
            Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={mode === "type" ? "Education, Business..." : "Fuel, Pharmacy, Rent..."}
              required
            />
          </label>
          <div>
            <span className="field-label">Icon</span>
            <div className="icon-grid">
              {iconOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={icon === option ? "selected" : ""}
                  onClick={() => setIcon(option)}
                  title={option}
                >
                  <IconGlyph name={option} size={18} />
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="field-label">Color</span>
            <div className="color-grid">
              {colorOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={color === option ? "selected" : ""}
                  style={{ background: option }}
                  onClick={() => setColor(option)}
                  title={option}
                />
              ))}
            </div>
          </div>
          <div className="dialog-form-actions">
            <button type="button" className="secondary-action" onClick={() => setAdding(false)}>
              Cancel
            </button>
            <button className="primary-action">
              <Plus size={18} />
              {mode === "type" ? "Add Type" : "Add SubType"}
            </button>
          </div>
        </form>
      </FormDialog>
      )}
    </div>
  );
}

function AccountForm({ onCreated, onCancel }: { onCreated: () => Promise<void>; onCancel?: () => void }) {
  const [type, setType] = useState<Account["type"]>("bank");
  const [name, setName] = useState("");
  const [starting, setStarting] = useState("");
  const [limit, setLimit] = useState("");
  const [dueDay, setDueDay] = useState("");
  // Blank and zero both mean no alert for this account, which is the default.
  const [minimumBalance, setMinimumBalance] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      await Api.createAccount({
        name,
        type,
        startingBalancePaise: parseAmountToPaise(starting),
        creditLimitPaise: type === "credit_card" ? parseAmountToPaise(limit) : undefined,
        paymentDueDay: type === "credit_card" && dueDay.trim() ? Number.parseInt(dueDay, 10) : null,
        // A card has an outstanding rather than a balance, so it never carries a minimum.
        minimumBalancePaise:
          type === "credit_card" || !minimumBalance.trim() ? undefined : parseAmountToPaise(minimumBalance)
      });
      setName("");
      setStarting("");
      setLimit("");
      setDueDay("");
      setMinimumBalance("");
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add account.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="stack-form" onSubmit={submit}>
      <label>
        Account type
        <select value={type} onChange={(event) => setType(event.target.value as Account["type"])}>
          <option value="bank">Bank account</option>
          <option value="credit_card">Credit card</option>
          <option value="food_card">Food card</option>
        </select>
      </label>
      <label>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="HDFC Bank, ICICI Card..." required />
      </label>
      <label>
        {type === "credit_card" ? "Starting outstanding" : "Starting balance"}
        <input value={starting} onChange={(event) => setStarting(event.target.value)} placeholder="₹0" inputMode="decimal" />
      </label>
      {type !== "credit_card" && (
        <label>
          Minimum balance
          <input
            value={minimumBalance}
            onChange={(event) => setMinimumBalance(event.target.value)}
            placeholder="₹0"
            inputMode="decimal"
          />
          <small className="field-hint">
            This balance turns red below this figure. Leave blank for no alert.
          </small>
        </label>
      )}
      {type === "credit_card" && (
        <>
          <label>
            Credit limit
            <input value={limit} onChange={(event) => setLimit(event.target.value)} placeholder="₹1,50,000" inputMode="decimal" required />
          </label>
          <label>
            Payment due day
            <input
              value={dueDay}
              onChange={(event) => setDueDay(event.target.value)}
              placeholder="18"
              inputMode="numeric"
              min={1}
              max={31}
              type="number"
            />
            <small className="field-hint">
              The day the bill is due each month. Set it and the Overview reminds you while the card still owes money.
            </small>
          </label>
        </>
      )}
      {error && <p className="form-error">{error}</p>}
      <div className="dialog-form-actions">
        {onCancel && (
          <button type="button" className="secondary-action" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        )}
        <button className="primary-action" disabled={saving}>
          <Plus size={18} />
          {saving ? "Adding..." : "Add account"}
        </button>
      </div>
    </form>
  );
}

function TransactionTable({
  transactions,
  empty,
  compact = false
}: {
  transactions: Transaction[];
  empty: string;
  compact?: boolean;
}) {
  if (transactions.length === 0) {
    return <EmptyState text={empty} />;
  }

  if (compact) {
    // Narrow panels (Overview): date and account sit under the merchant so the amount, the
    // figure people scan for, always has room.
    return (
      <div className="transaction-table compact">
        <div className="table-head">
          <span>Transaction</span>
          <span>Type / SubType</span>
          <span className="table-amount">Amount</span>
        </div>
        {transactions.map((transaction) => (
          <div className="table-row" key={transaction.id}>
            <span className="table-primary">
              <strong>{transaction.merchant || transaction.note || "Unknown"}</strong>
              <small>
                {formatShortDate(transaction.date)} · {transaction.accountName}
              </small>
            </span>
            <span>
              <TransactionTaxonomyBadge transaction={transaction} />
            </span>
            <strong className={`table-amount ${transaction.direction === "inflow" ? "amount-in" : "amount-out"}`}>
              {signedAmount(transaction.amountPaise, transaction.direction)}
            </strong>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="transaction-table">
      <div className="table-head">
        <span>Date</span>
        <span>Account</span>
        <span>Merchant</span>
        <span>Type / SubType</span>
        <span>Amount</span>
      </div>
      {transactions.map((transaction) => (
        <div className="table-row" key={transaction.id}>
          <span>{formatShortDate(transaction.date)}</span>
          <span>{transaction.accountName}</span>
          <strong>{transaction.merchant || transaction.note || "Unknown"}</strong>
          <span>
            <TransactionTaxonomyBadge transaction={transaction} />
          </span>
          <strong className={transaction.direction === "inflow" ? "amount-in" : "amount-out"}>
            {signedAmount(transaction.amountPaise, transaction.direction)}
          </strong>
        </div>
      ))}
    </div>
  );
}

type BarCategory = {
  name: string;
  icon: string;
  color: string;
  amountPaise: number;
  share: number;
  subcategoryId?: string;
  typeId?: string;
};

// Report buckets for "Other", uncategorised, or card lines don't map to one real filter.
function isDrillableId(id: string | undefined) {
  return Boolean(id) && !id!.includes(":") && id !== "uncategorized" && id !== "other-chart-segments";
}

function CashflowSummary({ types }: { types: MonthlyReport["types"] }) {
  const inflowParts = cashflowPartsFromTypes(types, "in");
  const outflowParts = cashflowPartsFromTypes(types, "out");
  const inflowPaise = inflowParts.reduce((sum, part) => sum + part.amountPaise, 0);
  const outflowPaise = outflowParts.reduce((sum, part) => sum + part.amountPaise, 0);
  const savingsPaise = inflowPaise - outflowPaise;

  return (
    <div className="cashflow-summary" aria-label="Inflow, outflow and savings breakdown">
      <div className="cashflow-summary-row cashflow-section">
        <div className="cashflow-formula-left" aria-label="Inflow minus outflow">
          <div className="cashflow-summary-line inflow">
            <div className="cashflow-summary-head">
              <span>Inflow</span>
              <strong className="amount-in">{formatINR(inflowPaise)}</strong>
            </div>
          </div>
          <span className="cashflow-summary-operator">−</span>
          <div className="cashflow-summary-line outflow">
            <div className="cashflow-summary-head">
              <span>Outflow</span>
              <strong className="amount-out">{formatINR(outflowPaise)}</strong>
            </div>
          </div>
        </div>
        <span className="cashflow-summary-operator">=</span>
        <div className="cashflow-summary-line savings">
          <div className="cashflow-summary-head">
            <span>Savings</span>
            <strong className={savingsPaise >= 0 ? "amount-in" : "amount-out"}>
              {signedImpact(savingsPaise)}
            </strong>
          </div>
        </div>
      </div>

      <CashflowEquation label="Inflow" total={inflowPaise} parts={inflowParts} tone="in" />
      <CashflowEquation label="Outflow" total={outflowPaise} parts={outflowParts} tone="out" />
    </div>
  );
}

function CashflowEquation({
  label,
  total,
  parts,
  tone
}: {
  label: string;
  total: number;
  parts: CashflowPart[];
  tone: "in" | "out";
}) {
  return (
    <div className={`cashflow-equation-row cashflow-section ${tone}`}>
      <div className="cashflow-equation-parts" aria-label={`${label} components`}>
        {parts.length === 0 ? (
          <span className="cashflow-equation-empty">Nothing yet</span>
        ) : (
          parts.map((part, index) => (
            <span className="cashflow-equation-piece" key={part.id}>
              {index > 0 && <span className="cashflow-equation-plus">+</span>}
              <span className="cashflow-equation-part" style={{ "--cat-color": part.color } as React.CSSProperties}>
                <span className="cashflow-equation-name">{part.name}</span>
                <span className="cashflow-equation-amount">{formatINR(part.amountPaise)}</span>
              </span>
            </span>
          ))
        )}
      </div>
      <span className="cashflow-equation-eq">=</span>
      <div className="cashflow-equation-total-card">
        <span>{label}</span>
        <strong className={tone === "in" ? "amount-in" : "amount-out"}>{formatINR(total)}</strong>
      </div>
    </div>
  );
}

function OutflowMixChart({
  types,
  onTypeClick
}: {
  types: MonthlyReport["types"];
  onTypeClick?: (typeId: string) => void;
}) {
  const outflowTypes = [...types.filter((type) => !INFLOW_BEHAVIORS.has(type.behavior))].sort(
    (a, b) => b.amountPaise - a.amountPaise
  );
  const outflowPaise = outflowTypes.reduce((sum, type) => sum + type.amountPaise, 0);
  const outflowSegments = consolidateDonutSegments(
    outflowTypes.map((type) => ({
      id: type.typeId,
      name: type.name,
      color: type.color,
      amountPaise: type.amountPaise
    }))
  );

  return (
    <div className="report-analytics outflow-mix-analytics">
      <div className="report-chart-header">
        <div>
          <span>Outflow mix</span>
          <strong>{formatINR(outflowPaise)}</strong>
        </div>
      </div>
      <div className="pie-panel">
        <div className="pie-chart">
          {outflowSegments.length === 0 || outflowPaise <= 0 ? (
            <EmptyState text="No outflow yet for this period." />
          ) : (
            <DonutChart
              segments={outflowSegments}
              totalPaise={outflowPaise}
              ariaLabel="Outflow mix by Type"
              onSegmentClick={onTypeClick ? (segment) => onTypeClick(segment.id) : undefined}
              centerLabel="Outflow"
              centerValue={formatINRWhole(outflowPaise)}
              centerCountPaise={outflowPaise}
              className="report-donut-chart"
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ReportTypeAnalytics({
  types,
  selectedTypeId,
  onSelect,
  onSubTypeClick
}: {
  types: MonthlyReport["types"];
  selectedTypeId: string;
  onSelect: (typeId: string) => void;
  onSubTypeClick?: (typeId: string, subcategoryId: string) => void;
}) {
  if (types.length === 0) {
    return <EmptyState text="No Type breakdown for this period." />;
  }

  const selected = types.find((type) => type.typeId === selectedTypeId) ?? types[0];
  const segments = selected.subcategories
    .filter((item) => item.amountPaise > 0)
    .map((item) => ({
      id: item.subcategoryId,
      name: item.name,
      color: item.color,
      amountPaise: item.amountPaise
    }));
  const chartSegments = consolidateDonutSegments(segments);

  return (
    <div className="report-analytics">
      <div className="report-chart-header">
        <div>
          <span>SubType mix</span>
          {/* The chosen filter is already lit in the ribbon beside this, so repeating its
              name here said nothing. Its total does. */}
          <strong>{formatINR(selected.amountPaise)}</strong>
        </div>
        <div className="type-filter-chips">
          {types.map((type) => (
            <button
              key={type.typeId}
              className={selected.typeId === type.typeId ? "active" : ""}
              onClick={() => onSelect(type.typeId)}
              type="button"
              aria-pressed={selected.typeId === type.typeId}
            >
              <CategoryBadge category={typeToCategory(type)} compact />
            </button>
          ))}
        </div>
      </div>
      <div className="pie-panel">
        <div className="pie-chart">
          <DonutChart
            segments={chartSegments}
            totalPaise={selected.amountPaise}
            ariaLabel={`${selected.name} SubType percentage chart`}
            onSegmentClick={
              onSubTypeClick && isDrillableId(selected.typeId)
                ? (segment) => onSubTypeClick(selected.typeId, segment.id)
                : undefined
            }
            centerLabel="Total"
            centerValue={formatINRWhole(selected.amountPaise)}
            centerCountPaise={selected.amountPaise}
            className="report-donut-chart"
          />
        </div>
      </div>
    </div>
  );
}

function DonutChart({
  segments,
  totalPaise,
  ariaLabel,
  centerLabel,
  centerValue,
  centerCountPaise,
  className = "",
  onSegmentClick
}: {
  segments: DonutSegment[];
  totalPaise: number;
  ariaLabel: string;
  centerLabel: string;
  centerValue: string;
  /** Given, the figure in the middle counts up to it instead of simply appearing. */
  centerCountPaise?: number;
  className?: string;
  onSegmentClick?: (segment: DonutSegment) => void;
}) {
  // A ring with a legend beside it: names and figures read as text, not as labels on leader lines.
  const size = 220;
  const center = size / 2;
  const radius = 84;
  const circumference = 2 * Math.PI * radius;
  const [activeId, setActiveId] = useState<string | null>(null);

  if (segments.length === 0 || totalPaise <= 0) {
    return (
      <div className={`donut-figure ${className}`.trim()}>
        <svg className="donut-chart" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="No chart data">
          <circle className="donut-empty" cx={center} cy={center} r={radius} />
        </svg>
      </div>
    );
  }

  // A hairline gap between slices keeps neighbours with similar colours apart.
  const gap = segments.length > 1 ? 2 : 0;
  let cursor = 0;
  const slices = segments.map((segment) => {
    const share = (segment.amountPaise / totalPaise) * 100;
    const length = (share / 100) * circumference;
    const dash = Math.max(length - gap, 0.5);
    const slice = {
      ...segment,
      share,
      labelShare: segment.labelShare ?? share,
      dash,
      dashOffset: -(cursor / 100) * circumference,
      drillable: Boolean(onSegmentClick && isDrillableId(segment.id))
    };
    cursor += share;
    return slice;
  });
  const sliceState = (id: string) => (activeId === null ? "" : activeId === id ? " is-active" : " is-dim");

  return (
    <div className={`donut-figure ${className}`.trim()} data-active={activeId ?? undefined}>
      <svg className="donut-chart" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={ariaLabel}>
        <circle className="donut-track" cx={center} cy={center} r={radius} />
        {slices.map((segment) => (
          <circle
            key={segment.id}
            className={`donut-segment${segment.drillable ? " donut-segment-link" : ""}${sliceState(segment.id)}`}
            cx={center}
            cy={center}
            r={radius}
            stroke={segment.color}
            strokeDasharray={`${segment.dash} ${circumference - segment.dash}`}
            strokeDashoffset={segment.dashOffset}
            onMouseEnter={() => setActiveId(segment.id)}
            onMouseLeave={() => setActiveId(null)}
            onClick={segment.drillable ? () => onSegmentClick?.(segment) : undefined}
          >
            <title>{`${segment.name}: ${formatShare(segment.labelShare)} (${formatINR(segment.amountPaise)})`}</title>
          </circle>
        ))}
        <text className="donut-center-label" x={center} y={center - 8} textAnchor="middle">
          {centerLabel}
        </text>
        {centerCountPaise === undefined ? (
          <text className="donut-center-value" x={center} y={center + 16} textAnchor="middle">
            {centerValue}
          </text>
        ) : (
          <CountUpText
            className="donut-center-value"
            x={center}
            y={center + 16}
            textAnchor="middle"
            paise={centerCountPaise}
            formatValue={formatINRWhole}
          />
        )}
      </svg>
      <ul className="donut-legend" aria-label={`${ariaLabel} legend`}>
        {slices.map((segment) => {
          const body = (
            <>
              <i className="donut-swatch" style={{ background: segment.color }} aria-hidden="true" />
              <span className="donut-legend-name">{segment.name}</span>
              <span className="donut-legend-share">{formatShare(segment.labelShare)}</span>
              <strong className="donut-legend-amount">{formatINR(segment.amountPaise)}</strong>
            </>
          );
          const hover = {
            onMouseEnter: () => setActiveId(segment.id),
            onMouseLeave: () => setActiveId(null),
            onFocus: () => setActiveId(segment.id),
            onBlur: () => setActiveId(null)
          };
          return (
            <li key={segment.id} className={`donut-legend-row${sliceState(segment.id)}`}>
              {segment.drillable ? (
                <button
                  type="button"
                  className="donut-legend-item"
                  aria-label={`Show ${segment.name} transactions`}
                  onClick={() => onSegmentClick?.(segment)}
                  {...hover}
                >
                  {body}
                </button>
              ) : (
                <div className="donut-legend-item" {...hover}>
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * One chart, two readings of the same figures: a ring for the split and bars for side-by-side
 * comparison. A segment may carry its own `maxPaise` (a credit card's limit), and the bar view then
 * draws it against that instead of against the biggest segment.
 */
function MixChart({
  segments,
  totalPaise,
  ariaLabel,
  centerLabel,
  centerValue,
  centerCountPaise,
  className = "",
  emptyText,
  onSegmentClick
}: {
  segments: DonutSegment[];
  totalPaise: number;
  ariaLabel: string;
  centerLabel: string;
  centerValue: string;
  /** Passed through to the ring: the figure in its middle counts up to this. */
  centerCountPaise?: number;
  className?: string;
  emptyText: string;
  onSegmentClick?: (segment: DonutSegment) => void;
}) {
  const [mode, setMode] = useState<"pie" | "bar">("pie");

  if (segments.length === 0 || totalPaise <= 0) {
    return <EmptyState text={emptyText} />;
  }

  const largest = segments.reduce((max, segment) => Math.max(max, segment.amountPaise), 0);
  return (
    <div className="mix-chart">
      <div className="mix-switch" role="group" aria-label={`${ariaLabel} view`}>
        {(["pie", "bar"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={mode === option}
            onClick={() => setMode(option)}
          >
            {option === "pie" ? "Pie" : "Bar"}
          </button>
        ))}
      </div>
      {mode === "pie" ? (
        <DonutChart
          segments={segments}
          totalPaise={totalPaise}
          ariaLabel={ariaLabel}
          centerLabel={centerLabel}
          centerValue={centerValue}
          centerCountPaise={centerCountPaise}
          className={className}
          onSegmentClick={onSegmentClick}
        />
      ) : (
        <ul className="mix-bars" aria-label={ariaLabel}>
          {segments.map((segment) => {
            const ceiling = segment.maxPaise ?? largest;
            const share = ceiling > 0 ? Math.min((segment.amountPaise / ceiling) * 100, 100) : 0;
            const drillable = Boolean(onSegmentClick) && isDrillableId(segment.id);
            const head = (
              <>
                <span>{segment.name}</span>
                <strong>{formatINR(segment.amountPaise)}</strong>
              </>
            );
            return (
              <li className="mix-bar-row" key={segment.id}>
                {drillable ? (
                  <button
                    type="button"
                    className="mix-bar-head"
                    aria-label={`Show ${segment.name}`}
                    onClick={() => onSegmentClick?.(segment)}
                  >
                    {head}
                  </button>
                ) : (
                  <div className="mix-bar-head">{head}</div>
                )}
                <div className="mix-bar-track">
                  <span className="mix-bar-fill" style={{ width: `${share}%`, background: segment.color }} />
                </div>
                <small className="mix-bar-note">
                  {segment.maxPaise
                    ? `${formatShare(share)} of ${formatINR(segment.maxPaise)}`
                    : formatShare((segment.amountPaise / totalPaise) * 100)}
                </small>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function consolidateDonutSegments(segments: DonutSegment[], maxSegments = 8): DonutSegment[] {
  const sorted = [...segments].sort((a, b) => b.amountPaise - a.amountPaise);
  if (sorted.length <= maxSegments) return sorted;

  const visible = sorted.slice(0, maxSegments - 1);
  const remainder = sorted.slice(maxSegments - 1);
  const amountPaise = remainder.reduce((sum, segment) => sum + segment.amountPaise, 0);
  const labelShare = remainder.reduce((sum, segment) => sum + (segment.labelShare ?? 0), 0);
  return [
    ...visible,
    {
      id: "other-chart-segments",
      name: "Other",
      color: "#64748b",
      amountPaise,
      ...(remainder.some((segment) => segment.labelShare !== undefined) ? { labelShare } : {})
    }
  ];
}

function CategoryBadge({ category, compact = false }: { category: Category; compact?: boolean }) {
  return (
    <span
      className={`category-badge ${compact ? "compact" : ""}`}
      style={{ "--cat-color": category.color } as React.CSSProperties}
    >
      <IconGlyph name={category.icon} size={14} />
      <span className="category-badge-label">{category.name}</span>
    </span>
  );
}

function TransactionTag({
  icon,
  label,
  tone = "neutral",
  color,
  title
}: {
  icon?: React.ReactNode;
  label: string;
  title?: string;
  tone?: "neutral" | "account" | "method" | "type" | "subtype";
  color?: string;
}) {
  const colorStyle = color ? ({ "--cat-color": color } as React.CSSProperties) : undefined;

  return (
    <span className={`transaction-tag ${tone}`} style={colorStyle} title={title}>
      {icon}
      <span>{label}</span>
    </span>
  );
}

function TransactionTaxonomyBadge({
  transaction,
  compact = false
}: {
  transaction: Transaction;
  compact?: boolean;
}) {
  const typeCategory = typeCategoryFromTransaction(transaction);
  const category = categoryFromTransaction(transaction);
  return (
    <span className={`taxonomy-badges ${compact ? "compact" : ""}`}>
      <CategoryBadge category={typeCategory} compact={compact} />
      <CategoryBadge category={category} compact={compact} />
    </span>
  );
}

function typeCategoryFromTransaction(transaction: Transaction): Category {
  return {
    id: transaction.typeId ?? "uncategorized",
    name: transaction.typeName ?? "Uncategorized",
    icon: transaction.typeIcon ?? "circle-question",
    color: transaction.typeColor ?? "#ea580c",
    isSystem: true,
    isLocked: false,
    sortOrder: 0
  };
}

function categoryFromTransaction(transaction: Transaction): Category {
  // Say what the row actually is instead of repeating the Type name.
  if (transaction.status === "split") {
    return { id: "split", name: "Split", icon: "arrow-left-right", color: transaction.typeColor ?? "#64748b", isSystem: true, isLocked: false, sortOrder: 0 };
  }
  if ((transaction.kind === "refund" || transaction.kind === "reversal") && !transaction.subcategoryId) {
    return {
      id: "refund",
      name: transaction.linkedTransactionId ? "Linked to purchase" : "Refund",
      icon: "rotate-ccw",
      color: transaction.typeColor ?? "#0891b2",
      isSystem: true,
      isLocked: false,
      sortOrder: 0
    };
  }
  if (transaction.kind === "card_payment" && transaction.transferAccountName) {
    return {
      id: transaction.transferAccountId ?? "",
      // A bill that also settled EMIs says so in the row: without it, two payments of different
      // amounts on the same card look like the same thing.
      name:
        transaction.cardEmiPaise > 0
          ? `${transaction.transferAccountName} · ${formatINR(transaction.cardEmiPaise)} EMIs`
          : transaction.transferAccountName,
      icon: "credit-card",
      color: transaction.typeColor ?? "#ea580c",
      isSystem: true,
      isLocked: false,
      sortOrder: 0
    };
  }

  return {
    id: transaction.subcategoryId ?? transaction.typeId ?? "",
    name:
      transaction.subcategoryName ??
      transaction.typeName ??
      transaction.categoryName ??
      "Uncategorized",
    icon:
      transaction.subcategoryIcon ??
      transaction.typeIcon ??
      transaction.categoryIcon ??
      "circle-question",
    color:
      transaction.subcategoryColor ??
      transaction.typeColor ??
      transaction.categoryColor ??
      "#ea580c",
    isSystem: true,
    isLocked: false,
    sortOrder: 0
  };
}

const FAQ_ITEMS: Array<{ question: string; answer: string }> = [
  {
    question: "Where is my data stored, and who else can see it?",
    answer:
      "This copy runs on the web, so your accounts, transactions, budgets and settings live in a hosted Postgres database rather than on your phone or laptop. Getting in needs your email and password, and there is no sign-up: an account only exists because the owner created one with the account command. Every row carries whose it is, and every question the app asks the database names the person asking — there is a test that reads every one of those questions and fails if a single one forgets, which is what stops two people on the same copy ever seeing each other's money. The tables also refuse to let one person's row point at another's. You can also run the app on your own machine instead, which keeps the database in a file under the project and reaches nothing outside it."
  },
  {
    question: "How is 'Available cash' calculated?",
    answer:
      "It's the money across your bank and food-card accounts: each account's starting balance, plus every income you recorded into it, minus every expense, transfer and card payment made from it."
  },
  {
    question: "How is a credit card's 'Outstanding' and 'Available limit' calculated?",
    answer:
      "Outstanding is what you currently owe: the card's starting balance plus everything charged to it, minus the payments you've made toward it. Available limit is the card's total limit minus the outstanding."
  },
  {
    question: "How is 'This month spending' calculated?",
    answer:
      "It adds up every expense dated in the current calendar month. Income, transfers between your own accounts, and credit-card payments are not counted as spending."
  },
  {
    question: "What do the budget labels mean: On track, Watch, Likely to exceed, Over budget?",
    answer:
      "On track means spending is comfortably within budget. Watch means you're getting close. Likely to exceed means the month-end projection lands over the budget. Over budget means you've already spent more than the budgeted amount. The projection is what you've spent so far plus what that line usually adds in the rest of the month (from recent months that used it), so rent paid early isn't doubled. Without two months of history it follows your pace, and in the first days of a month it just shows what you've spent."
  },
  {
    question: "Are my investment values updated automatically?",
    answer:
      "Market prices aren't fetched: stocks, mutual funds, gold, land, property and PF values are entered by you. Two things do move on their own. A fund bought as a SIP takes its monthly instalment from the bank you chose and adds it to that fund. And any SIP transaction you record yourself against a mutual fund is added too, if it's dated after you last typed the fund's figures — earlier ones are assumed to be included already, so nothing is counted twice. When you enter a new value from your statement, that becomes the new starting point. Each investment type is a dropdown showing its total invested, current value and net gain; open it to see every holding, grouped by the year or month you invested if you've chosen that in Profile."
  },
  {
    question: "How do vacations work, and do trip expenses still count as normal expenses?",
    answer:
      "A vacation is a label you put on expenses, not a new category. First create a trip on the Vacations page (optionally with dates and a budget). Then, when you add an Expense from the Transactions page, tick 'Part of a vacation?' and choose the trip. That expense keeps its normal SubType (Food, Travel, Hotel…) and still counts in all your normal expense totals, reports and budgets, and it also rolls up under the trip. The Vacations page shows each trip's total spend, budget-vs-spent, and a breakdown by SubType. Deleting a trip only removes the grouping; the expenses themselves stay untouched."
  },
  {
    question: "How are Inflow, Outflow and Savings in Reports calculated?",
    answer:
      "Inflow adds up everything that brought money in for the period (income, plus any refund that isn't tied to a purchase). A refund recorded with the Refund button on a purchase isn't inflow: it reduces that purchase's SubType instead, so it never makes a month look like you earned more. Outflow adds up everything that took money out (expense, loan, investment, transfer, credit-card payment and any other outflow categories). Savings is simply Inflow minus Outflow. Positive means you kept money, negative means you spent more than came in. Self transfers are left out of both sides, because moving money between your own accounts is not income or spending. The Outflow figure on the Overview uses this exact same calculation."
  },
  {
    question: "How do I move money between my own bank accounts?",
    answer:
      "Add a transaction on the account the money leaves, choose Type = Transfer and SubType = Self transfer, then pick the receiving bank account in the 'Account' dropdown that appears. Saving it lowers the source account's balance and raises the receiving account's balance by the same amount. Because the money never left you, a self transfer is not counted as Outflow or spending anywhere in Reports or the Overview."
  },
  {
    question: "How are loan interest, months left and the closure month worked out?",
    answer:
      "Each EMI you link to a loan is split the way banks do on a reducing balance: this month's interest is the outstanding × annual rate ÷ 12, and the rest of the EMI repays principal, which lowers next month's interest. Prepayments go fully to principal. 'Months left' is how many EMIs it takes to clear today's outstanding at your EMI and rate, and the closure month counts those forward from this month (or next month, if this month's EMI is already recorded). For the time before you started recording EMIs here, the gap between the loan's original principal and the outstanding you entered says how much had already been repaid; the app walks the loan's own schedule until it has repaid that much, and the interest those instalments carried is the interest paid. So a loan you enter with nothing yet repaid shows no interest paid, and one you enter years in shows the interest those years really cost. 'Principal paid' is simply the original principal less what is still outstanding. Your final EMI can be a normal EMI even if it's a little more than the payoff shown; it closes the loan. Archiving a loan hides it from the tracker, but anything still owed keeps counting in your net worth."
  },
  {
    question: "How are backups made?",
    answer:
      "It depends where the database is. When you run the app on your own machine it copies the database file every 30 minutes and once more when you close it normally, into a local 'backups' folder: the newest 5, plus the newest from each of the last 7 days. When the app is running on the web the database is not a file this app can copy, so it takes no backups of its own — the database host keeps those. You can always take your own copy of everything from the export on the Transactions page."
  },
  {
    question: "How do Post Office schemes, fixed deposits and bonds pay out?",
    answer:
      "These are the holdings that pay you back while you hold them, so they are entered differently from a fund. Alongside the amount invested you give how often it pays (monthly, quarterly, every six months or yearly), the interest amount, the day it lands, the bank it lands in, and the last day it pays. From then on each payment writes itself into that bank as income on its due day — never for a date before you entered the holding, and never twice for the same period. Because the money has already arrived in the bank, the holding's own value stays at what you put in: the page shows Interest earned rather than a net gain, and net worth counts the principal once and the credits once, not the credits twice."
  },
  {
    question: "Can AutoPay and SIPs pay themselves?",
    answer:
      "Yes, once you tell them which bank to use. An AutoPay with a bank attached takes its payment on its own day: if the balance covers it, the payment is written and the balance drops; if it doesn't, nothing happens at all and the payment stays listed under Upcoming payments against the bank that fell short. A mutual fund bought as a SIP works the same way — you give the monthly amount, the day and the bank, and each instalment is taken when the bank can cover it and added to the fund. Neither ever pays twice for the same month, and neither back-dates: nothing is written for a day before you set it up."
  },
  {
    question: "My credit card EMIs are part of the card bill. How do I record that?",
    answer:
      "When you record a payment to a credit card, the form lists the EMIs running on that card and asks which of them this payment settled. Tick them and the single bill payment does both jobs: the card's outstanding comes down by the whole amount, and each ticked EMI is recorded against its own loan with its interest and principal split out. Those settled instalments belong to the bill, so they move and disappear with it — editing or deleting one on its own is refused, and deleting the card payment takes them with it."
  },
  {
    question: "What does 'Credit card spends' on the Overview count?",
    answer:
      "What you charged to your cards this calendar month, less anything refunded back onto them. EMI instalments are left out, because an EMI is an older purchase being paid off rather than new spending this month."
  },
  {
    question: "How do I tidy up a lot of transactions at once?",
    answer:
      "Tick the rows on the Transactions page and a bar appears saying how many are selected, with a Delete that asks once before it acts. An EMI instalment that was settled as part of a card payment is refused on its own — it belongs to that payment — and the refusal is per row, so the rest of the batch still goes."
  }
];

const NEWS_SEEN_KEY = "finance-whats-new-seen";

function storedNewsSeen(): string | null {
  try {
    return window.localStorage.getItem(NEWS_SEEN_KEY);
  } catch {
    // A browser with site data blocked still gets the page; it just keeps showing the mark.
    return null;
  }
}

/* Two groups and no others: what you can now do, and what is no longer wrong. */
const NEWS_GROUPS = [
  { key: "added", heading: "New", tone: "is-new" },
  { key: "fixed", heading: "Fixed", tone: "is-fixed" }
] as const;

function WhatsNewPage({ entries, onRead }: { entries: NewsEntry[]; onRead: () => void }) {
  useEffect(() => {
    onRead();
  }, [onRead]);

  return (
    <div className="page-grid">
      <Panel title="What's new">
        <p className="helper-text faq-intro">
          New features and fixes, newest first.
        </p>
        {entries.length === 0 ? (
          <EmptyState text="Nothing new yet." />
        ) : (
          <ol className="news-list">
            {entries.map((entry) => (
              <li className="news-entry" key={entry.date}>
                <h3>{formatDayHeading(entry.date)}</h3>
                {NEWS_GROUPS.map(({ key, heading, tone }) => {
                  const lines = entry[key] ?? [];
                  if (lines.length === 0) {
                    return null;
                  }
                  return (
                    <div className="news-group" key={key}>
                      <h4 className={`news-group-heading ${tone}`}>{heading}</h4>
                      <ul>
                        {lines.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}

function FaqPage() {
  return (
    <div className="page-grid">
      <Panel title="Frequently asked questions">
        <p className="helper-text faq-intro">
          Plain-language answers about how the numbers in this app are worked out.
        </p>
        <div className="faq-list">
          {FAQ_ITEMS.map((item) => (
            <FaqItem key={item.question} question={item.question} answer={item.answer} />
          ))}
        </div>
      </Panel>
    </div>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`faq-item ${open ? "open" : ""}`}>
      <button
        type="button"
        className="faq-question"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{question}</span>
        <ChevronDown size={18} className={`faq-chevron ${open ? "expanded" : ""}`} />
      </button>
      {open && <p className="faq-answer">{answer}</p>}
    </div>
  );
}


/**
 * Changing your own password, from inside the application.
 *
 * Until this existed the only way to set one was a command line with the database credential, so
 * an account made for somebody else kept whatever password the person who made it had chosen --
 * and they knew it. Everything else here is about money; this is the one screen that is about
 * whose money it is.
 */
/**
 * One settings row, the same shape every time: what it is on the left, the control that changes
 * it on the right, and a line underneath when the setting needs explaining.
 *
 * The page used to mix three shapes -- a row that was itself a button, a row with a button inside
 * it, and a row that was only a readout -- so nothing on it taught you how the next row behaved.
 * Every row here is a region with a real, separately named control in it.
 */
function SettingsRow({
  label,
  hint,
  tone,
  children
}: {
  label: string;
  hint?: string;
  tone?: "danger";
  children: ReactNode;
}) {
  return (
    <div className={`settings-row ${tone ? `settings-row-${tone}` : ""}`}>
      <span className="settings-row-label">{label}</span>
      <div className="settings-row-control">{children}</div>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

/** A group of rows under a heading, so a reader can scan for the kind of thing they want. */
function ProfileSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="profile-section">
      <h3>{title}</h3>
      <div className="profile-section-rows">{children}</div>
    </section>
  );
}

function PasswordRow() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const close = () => {
    setOpen(false);
    setCurrent("");
    setNext("");
    setAgain("");
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (next !== again) {
      setError("The two new passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await Api.changePassword(current, next);
      setDone(true);
      close();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <SettingsRow label="Password" hint={done ? "Changed. Every other browser was signed out." : undefined}>
        <button
          type="button"
          className="secondary-action"
          onClick={() => {
            setDone(false);
            setOpen(true);
          }}
        >
          Change
        </button>
      </SettingsRow>
    );
  }

  return (
    <form className="settings-row password-row" onSubmit={submit}>
      <span className="settings-row-label">Password</span>
      <label>
        Current password
        <input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          required
        />
      </label>
      <label>
        New password
        <input
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(event) => setNext(event.target.value)}
          required
        />
      </label>
      <label>
        New password again
        <input
          type="password"
          autoComplete="new-password"
          value={again}
          onChange={(event) => setAgain(event.target.value)}
          required
        />
      </label>
      {error ? <small className="password-error">{error}</small> : null}
      <small>Changing it signs out every other browser.</small>
      <div className="password-actions">
        <button type="button" className="secondary-action" onClick={close} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="primary-action" disabled={busy || !current || !next || !again}>
          {busy ? "Changing…" : "Change password"}
        </button>
      </div>
    </form>
  );
}

/** The sections simple mode keeps, named the way the navigation names them. */
function simpleModeSectionNames() {
  const names = SIMPLE_MODE_PAGES.map(
    (page) => navItems.find((item) => item.page === page)?.label ?? page
  );
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** What is wrong with each identity field, field by field, so the page can say it where it is. */
export function profileFieldProblems(profile: UserProfile) {
  const name = profile.name.trim();
  const email = profile.email.trim();
  const age = profile.age.trim();
  const ageNumber = Number.parseInt(age, 10);
  return {
    name: name.length === 0 ? "Add your name." : null,
    email:
      email.length === 0
        ? "Add your email address."
        : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
          ? null
          : "That is not an email address.",
    age:
      age.length === 0
        ? "Add your age."
        : /^\d+$/.test(age) && Number.isInteger(ageNumber) && ageNumber >= 1 && ageNumber <= 120
          ? null
          : "Age is a whole number between 1 and 120."
  };
}

export function ProfilePage({
  onPlayIntro,
  introOnLaunch,
  onToggleIntroOnLaunch,
  profile,
  savedProfile,
  settings,
  backupStatus,
  isOwner,
  theme,
  saving,
  cardAlertPercent,
  holdingGrouping,
  simpleMode,
  onProfileChange,
  onSaveProfile,
  onSaveCardAlert,
  onSaveHoldingGrouping,
  onSaveSimpleMode,
  onDownloadReport,
  preparingReport,
  onThemeToggle,
  onSignOut
}: {
  onPlayIntro: () => void;
  introOnLaunch: boolean;
  onToggleIntroOnLaunch: () => void;
  profile: UserProfile;
  savedProfile: UserProfile;
  settings: Record<string, string>;
  backupStatus: BackupStatus | null;
  isOwner: boolean | null;
  theme: Theme;
  saving: boolean;
  cardAlertPercent: number;
  holdingGrouping: HoldingGrouping;
  simpleMode: boolean;
  onProfileChange: (profile: UserProfile) => void;
  onSaveProfile: () => Promise<void> | void;
  onSaveCardAlert: (percent: number) => Promise<void> | void;
  onSaveHoldingGrouping: (grouping: HoldingGrouping) => Promise<void> | void;
  onSaveSimpleMode: (next: boolean) => Promise<void> | void;
  onDownloadReport: () => void;
  preparingReport: boolean;
  onThemeToggle: () => void;
  onSignOut: () => void;
}) {
  const [editing, setEditing] = useState(false);
  /* A field complains once it has been touched, not the moment the editor opens. An empty
     profile would otherwise greet you with three red lines about things you have not done yet. */
  const [touched, setTouched] = useState<Record<"name" | "email" | "age", boolean>>({
    name: false,
    email: false,
    age: false
  });
  const [cardAlertDraft, setCardAlertDraft] = useState(String(cardAlertPercent));

  useEffect(() => {
    setCardAlertDraft(String(cardAlertPercent));
  }, [cardAlertPercent]);

  const displayName = profile.name.trim() || "Your profile";
  const displayEmail = profile.email.trim() || "No email yet";
  // Only a real difference counts as unsaved: opening the editor changes nothing by itself.
  const profileDirty =
    profile.name !== savedProfile.name ||
    profile.email !== savedProfile.email ||
    profile.age !== savedProfile.age;
  const problems = profileFieldProblems(profile);
  const profileCanSave = !problems.name && !problems.email && !problems.age;
  const shownProblem = (field: "name" | "email" | "age") => (touched[field] ? problems[field] : null);

  function startEditing() {
    setTouched({ name: false, email: false, age: false });
    setEditing(true);
  }

  const draftValue = Number.parseInt(cardAlertDraft, 10);
  const draftIsValid = Number.isInteger(draftValue) && draftValue >= 1 && draftValue <= 100;
  const cardAlertProblem =
    cardAlertDraft.trim().length === 0 || draftIsValid ? null : "A whole number between 1 and 100.";

  return (
    <div className="profile-page">
      <div className="profile-menu profile-page-card">
        <div className="profile-card-header">
          <div className="profile-avatar" aria-hidden="true">
            {profile.name.trim().charAt(0).toUpperCase() || "₹"}
          </div>
          <div className="profile-identity">
            <h2>{displayName}</h2>
            <p>{displayEmail}</p>
          </div>
          {!editing && (
            <button type="button" className="secondary-action profile-edit-button" onClick={startEditing}>
              <Pencil size={16} />
              Edit
            </button>
          )}
        </div>

        {editing ? (
          <form
            className="profile-fields"
            onSubmit={async (event) => {
              event.preventDefault();
              /* Pressing Save is what asks every field to speak. A Save that is simply dead
                 while something is wrong tells you nothing about which something. */
              setTouched({ name: true, email: true, age: true });
              if (!profileCanSave) {
                return;
              }
              await onSaveProfile();
              setEditing(false);
            }}
          >
            <label>
              Name
              <input
                autoFocus
                value={profile.name}
                aria-invalid={shownProblem("name") ? true : undefined}
                onChange={(event) => {
                  setTouched((was) => ({ ...was, name: true }));
                  onProfileChange({ ...profile, name: event.target.value });
                }}
                placeholder="Add your name"
              />
              {shownProblem("name") ? <small className="field-problem">{shownProblem("name")}</small> : null}
            </label>
            <label>
              Email
              {/* inputMode, not type="email": the browser's own validation bubble fires on submit
                  before this form's does, and it speaks about one field while the page has its
                  own message for each of the three. */}
              <input
                inputMode="email"
                autoComplete="email"
                value={profile.email}
                aria-invalid={shownProblem("email") ? true : undefined}
                onChange={(event) => {
                  setTouched((was) => ({ ...was, email: true }));
                  onProfileChange({ ...profile, email: event.target.value });
                }}
                placeholder="name@example.com"
              />
              {shownProblem("email") ? <small className="field-problem">{shownProblem("email")}</small> : null}
            </label>
            <label>
              Age
              <input
                value={profile.age}
                inputMode="numeric"
                aria-invalid={shownProblem("age") ? true : undefined}
                onChange={(event) => {
                  setTouched((was) => ({ ...was, age: true }));
                  onProfileChange({ ...profile, age: event.target.value });
                }}
                placeholder="Add age"
              />
              {shownProblem("age") ? <small className="field-problem">{shownProblem("age")}</small> : null}
            </label>
            <div className="profile-edit-actions">
              <button
                type="button"
                className="secondary-action"
                onClick={() => {
                  onProfileChange(savedProfile);
                  setEditing(false);
                }}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`profile-save-button ${profileDirty ? "is-dirty" : ""}`}
                disabled={saving || !profileDirty}
              >
                <Check size={16} />
                {saving ? "Saving..." : profileDirty ? "Save changes" : "Nothing to save"}
              </button>
            </div>
          </form>
        ) : (
          /* Read state as values, not as inputs. Fields that cannot be typed in should not look
             like fields that can: the page used to show three read-only boxes. */
          <dl className="profile-facts">
            <div>
              <dt>Name</dt>
              <dd>{profile.name.trim() || "Not set"}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{profile.email.trim() || "Not set"}</dd>
            </div>
            <div>
              <dt>Age</dt>
              <dd>{profile.age.trim() || "Not set"}</dd>
            </div>
          </dl>
        )}

        <ProfileSection title="Preferences">
          <SettingsRow
            label="Simple mode"
            hint={
              simpleMode
                ? `Showing ${SIMPLE_MODE_PAGES.length} sections. Turn this off to get the rest back.`
                : `Cuts the app down to ${SIMPLE_MODE_PAGES.length} sections — ${simpleModeSectionNames()} — on every screen.`
            }
          >
            <button
              type="button"
              role="switch"
              aria-checked={simpleMode}
              aria-label="Simple mode"
              className="switch-control"
              onClick={() => void onSaveSimpleMode(!simpleMode)}
            >
              <span className="switch-track" aria-hidden="true">
                <span className="switch-thumb" />
              </span>
              {simpleMode ? "On" : "Off"}
            </button>
          </SettingsRow>
          <SettingsRow label="Dark theme" hint="Follows your system setting until you choose here.">
            <button
              type="button"
              role="switch"
              aria-checked={theme === "dark"}
              aria-label="Dark theme"
              className="switch-control"
              onClick={onThemeToggle}
            >
              <span className="switch-track" aria-hidden="true">
                <span className="switch-thumb" />
              </span>
              {theme === "dark" ? "On" : "Off"}
            </button>
          </SettingsRow>
          <SettingsRow label="Currency" hint="Every figure in this app is in rupees.">
            <strong>{settings.currency ?? "INR"}</strong>
          </SettingsRow>
          <SettingsRow
            label="Holdings in a type"
            hint="How a type's holdings are listed when you open it on the Investments page."
          >
            <select
              className="settings-select"
              aria-label="How holdings are listed inside an investment type"
              value={holdingGrouping}
              onChange={(event) => void onSaveHoldingGrouping(event.target.value as HoldingGrouping)}
            >
              {HOLDING_GROUPINGS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </SettingsRow>
          <SettingsRow
            label="Card utilization alert"
            hint={cardAlertProblem ?? "Credit cards turn red when utilization crosses this value."}
          >
            <div className="card-alert-controls">
              <input
                aria-label="Card utilization alert percentage"
                aria-invalid={cardAlertProblem ? true : undefined}
                inputMode="numeric"
                value={cardAlertDraft}
                onChange={(event) => setCardAlertDraft(event.target.value)}
              />
              <span className="card-alert-suffix" aria-hidden="true">
                %
              </span>
              <button
                type="button"
                className="secondary-action"
                disabled={!draftIsValid || draftValue === cardAlertPercent}
                onClick={() => void onSaveCardAlert(draftValue)}
              >
                Save
              </button>
            </div>
          </SettingsRow>
          <SettingsRow label="Intro film" hint="A short film about what this app does.">
            <div className="intro-row-controls">
              <button
                type="button"
                role="switch"
                aria-checked={introOnLaunch}
                aria-label="Play the intro on launch"
                className="switch-control"
                onClick={onToggleIntroOnLaunch}
              >
                <span className="switch-track" aria-hidden="true">
                  <span className="switch-thumb" />
                </span>
                On launch
              </button>
              <button type="button" className="secondary-action" onClick={onPlayIntro}>
                Watch
              </button>
            </div>
          </SettingsRow>
        </ProfileSection>

        <ProfileSection title="Your data">
          <SettingsRow
            label="Report"
            hint='Every page as one document. Choose "Save as PDF" in the print dialog.'
          >
            <button type="button" className="secondary-action" onClick={onDownloadReport} disabled={preparingReport}>
              <Download size={16} />
              {preparingReport ? "Preparing…" : "Download"}
            </button>
          </SettingsRow>
          {isOwner === true ? (
            <SettingsRow label="Backups" hint={formatBackupDetail(backupStatus)}>
              <strong>{formatBackupStatus(backupStatus)}</strong>
            </SettingsRow>
          ) : null}
        </ProfileSection>

        <ProfileSection title="Your account">
          <PasswordRow />
          <SettingsRow
            label="Signed in"
            tone="danger"
            hint={profile.email.trim() ? `As ${profile.email.trim()} in this browser.` : "In this browser."}
          >
            <button type="button" className="secondary-action is-danger" onClick={onSignOut}>
              Sign out
            </button>
          </SettingsRow>
        </ProfileSection>
      </div>
    </div>
  );
}

/**
 * Editing one account, and the only place it can be deleted from.
 *
 * Delete used to sit on the card beside Edit, behind a disclosure. The budget card carries one
 * action, so it moved in here -- where the name and the figures it would take away are already
 * on screen, which is a better place to ask the question from than a row of cards.
 */
export function AccountEditDialog({
  account,
  onClose,
  onSaved,
  onError,
  onDelete
}: {
  account: Account;
  onClose: () => void;
  onSaved: (message: string) => Promise<void> | void;
  onError: (message: string) => void;
  onDelete: () => void;
}) {
  const isCard = account.type === "credit_card";
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(() => ({
    name: account.name,
    opening: amountInputFromPaise(account.startingBalancePaise),
    limit: account.creditLimitPaise === null ? "" : amountInputFromPaise(account.creditLimitPaise),
    dueDay: account.paymentDueDay ? String(account.paymentDueDay) : "",
    // Blank and zero both mean no alert, which is what an account starts with.
    minimum: account.minimumBalancePaise ? amountInputFromPaise(account.minimumBalancePaise) : ""
  }));
  /* Kept apart from the draft above on purpose. Everything else in this dialog describes the
     account; this writes a transaction, and it applies when it is pressed rather than riding
     along with Save -- so saving the name twice cannot correct the balance twice. */
  const adjustHintId = useId();
  const [adjustment, setAdjustment] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  async function applyAdjustment() {
    const parsed = parseSignedAmount(adjustment);
    if (!parsed) {
      onError("Type how much to adjust by, as +500 or -500.");
      return;
    }
    setAdjusting(true);
    try {
      await Api.createTransaction({
        date: todayISO(),
        accountId: account.id,
        method: account.type === "credit_card" ? "credit_card" : "bank_transfer",
        merchant: "Balance adjustment",
        typeId: ADJUSTMENT_TYPE_ID,
        subcategoryId: ADJUSTMENT_SUBCATEGORY_ID,
        amountPaise: parsed.paise,
        direction: parsed.direction,
        kind: "adjustment"
      });
      const moved = parsed.direction === "inflow" ? parsed.paise : -parsed.paise;
      setAdjustment("");
      await onSaved(
        `Balance adjusted by ${signedAmount(parsed.paise, parsed.direction)}. Now ${formatINRWhole(
          account.balancePaise + moved
        )}.`
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not adjust the balance.");
    } finally {
      setAdjusting(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const openingPaise = parseAmountToPaise(draft.opening || "0");
    const limitPaise = isCard ? parseAmountToPaise(draft.limit || "0") : undefined;
    if (draft.name.trim().length < 2) {
      onError("Give the account a name of at least 2 characters.");
      return;
    }
    if (openingPaise < 0 || (limitPaise !== undefined && limitPaise < 0)) {
      onError("Amounts can't be negative.");
      return;
    }
    const typedDueDay = draft.dueDay.trim();
    const dueDay = typedDueDay ? Number.parseInt(typedDueDay, 10) : null;
    if (typedDueDay && (!Number.isInteger(dueDay) || dueDay! < 1 || dueDay! > 31)) {
      onError("Payment due day must be a day of the month, 1 to 31.");
      return;
    }
    const minimumPaise = isCard ? undefined : parseAmountToPaise(draft.minimum || "0");
    if (minimumPaise !== undefined && minimumPaise < 0) {
      onError("A minimum balance can't be negative.");
      return;
    }
    setSaving(true);
    try {
      await Api.updateAccount(account.id, {
        name: draft.name.trim(),
        startingBalancePaise: openingPaise,
        ...(limitPaise !== undefined ? { creditLimitPaise: limitPaise, paymentDueDay: dueDay } : {}),
        ...(minimumPaise !== undefined ? { minimumBalancePaise: minimumPaise } : {})
      });
      const shift = openingPaise - account.startingBalancePaise;
      await onSaved(
        shift === 0
          ? "Account updated."
          : `Account updated. ${isCard ? "Outstanding" : "Balance"} moved by ${signedImpact(shift)}.`
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not update the account.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormDialog title={`Edit ${account.name}`} onClose={onClose}>
      <form className="stack-form account-edit-form" onSubmit={save}>
        <label>
          Name
          <input autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        </label>
        <label>
          {isCard ? "Opening outstanding" : "Opening balance"}
          <input
            inputMode="decimal"
            value={draft.opening}
            onChange={(event) => setDraft({ ...draft, opening: event.target.value })}
          />
          <small className="field-hint">
            {isCard
              ? "What you owed on this card before your first transaction here. Change it to match your statement."
              : "The balance before your first transaction here. Change it if the app doesn't match your bank."}
          </small>
        </label>
        {isCard && (
          <>
            <label>
              Credit limit
              <input
                inputMode="decimal"
                value={draft.limit}
                onChange={(event) => setDraft({ ...draft, limit: event.target.value })}
              />
            </label>
            <label>
              Payment due day
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                value={draft.dueDay}
                onChange={(event) => setDraft({ ...draft, dueDay: event.target.value })}
                placeholder="18"
              />
              <small className="field-hint">
                The day the bill is due each month. Leave it blank for no reminder.
              </small>
            </label>
          </>
        )}
        {!isCard && (
          <label>
            Minimum balance
            <input
              inputMode="decimal"
              value={draft.minimum}
              onChange={(event) => setDraft({ ...draft, minimum: event.target.value })}
              placeholder="0"
            />
            <small className="field-hint">
              The app flags this account when it falls below this. Leave it blank for no alert.
            </small>
          </label>
        )}
        {!isCard && (
          <div className="account-adjust">
            <label>
              Adjust balance
              <div className="account-adjust-row">
                <input
                  inputMode="text"
                  value={adjustment}
                  onChange={(event) => setAdjustment(event.target.value)}
                  placeholder="+500 or -500"
                  aria-describedby={`${adjustHintId}`}
                />
                <button
                  type="button"
                  className="secondary-action"
                  onClick={applyAdjustment}
                  disabled={adjusting || !adjustment.trim()}
                >
                  {adjusting ? "Adjusting..." : "Apply"}
                </button>
              </div>
              <small className="field-hint" id={adjustHintId}>
                For when the app and your bank disagree. The amount is the size of the correction,
                so +500 raises the balance by ₹500 and -500 lowers it. It is written as its own
                transaction, which you can delete to undo it, and it counts as neither spending
                nor income.
              </small>
            </label>
          </div>
        )}
        <div className="budget-dialog-actions">
          <button type="button" className="secondary-action danger-action" onClick={onDelete} disabled={saving}>
            <Trash2 size={16} />
            Delete
          </button>
          <div className="budget-dialog-close">
            <button type="button" className="secondary-action" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="primary-action" disabled={saving}>
              <Check size={16} />
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </form>
    </FormDialog>
  );
}

function Panel({
  title,
  action,
  children
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>{title}</h2>
        {action && <div className="panel-action">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/* Editing used to happen in a form parked at the top of the page, so changing a holding near the
   bottom of a long list meant scrolling up to the form and scrolling back down to see what it
   did. The form comes to the item instead. One dialog serves every section. */
function FormDialog({
  title,
  onClose,
  wide = false,
  children
}: {
  title: string;
  onClose: () => void;
  /** For a form laid out in columns -- the entry form has four, and 560px gives it one. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      /* A modal that lets Tab wander out onto the page behind it is not modal. Tab cycles
         inside the dialog instead, wrapping at both ends. */
      if (event.key !== "Tab" || !dialog.current) return;
      const focusable = [...dialog.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )].filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!event.shiftKey && (active === last || !dialog.current.contains(active))) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && (active === first || !dialog.current.contains(active))) {
        event.preventDefault();
        last.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  /* Holding the page still while the dialog is open. overflow:hidden alone is ignored by Safari
     on a phone, so the body is pinned at its current offset and put back afterwards -- which is
     also what keeps the page exactly where it was when the dialog closes. */
  useEffect(() => {
    const offset = window.scrollY;
    const body = document.body;
    const before = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow
    };
    body.style.position = "fixed";
    body.style.top = `-${offset}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
    /* Whatever was focused when the dialog opened -- the Edit button, almost always -- gets the
       focus back when it closes, so the keyboard does not land back at the top of the page. */
    const opener = document.activeElement as HTMLElement | null;
    dialog.current?.focus({ preventScroll: true });
    return () => {
      body.style.position = before.position;
      body.style.top = before.top;
      body.style.width = before.width;
      body.style.overflow = before.overflow;
      window.scrollTo(0, offset);
      opener?.focus?.({ preventScroll: true });
    };
  }, []);

  /* Through a portal onto the body, not into the page. A page that is mid-transition carries a
     transform, and a transform makes its subtree the containing block for position:fixed -- which
     put the first version of this dialog a page and a half above the top of the screen. */
  const content = (
    <div
      className="modal-backdrop form-dialog-backdrop"
      role="presentation"
      /* mousedown rather than click: a drag that starts on a field and ends on the backdrop
         should not throw the form away. */
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`form-dialog${wide ? " is-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialog}
        tabIndex={-1}
      >
        <div className="form-dialog-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label={`Close ${title}`}>
            <X size={18} />
          </button>
        </div>
        <div className="form-dialog-body">{children}</div>
      </div>
    </div>
  );

  // There is no body to portal onto while this is being rendered to a string off the browser.
  return typeof document === "undefined" ? content : createPortal(content, document.body);
}


function SummaryCard({
  label,
  value,
  icon,
  tone = "neutral",
  note,
  countPaise,
  valueClassName
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "neutral" | "warning" | "good";
  note?: React.ReactNode;
  /** When given, the figure counts up to this amount (the formatted `value` stays the accessible text). */
  countPaise?: number;
  /** Colours the figure itself, for cards whose meaning follows the sign of the number. */
  valueClassName?: string;
}) {
  return (
    <div className={`summary-card ${tone}`}>
      <span>{icon}</span>
      <div>
        <p>{label}</p>
        {/* A money tile shows short scale so a crore figure still fits; the exact amount is
            the tooltip, and CountUp keeps it as the text a screen reader reads. */}
        <strong className={valueClassName} title={countPaise === undefined ? undefined : value}>
          {countPaise === undefined ? value : <CountUp paise={countPaise} label={value} />}
        </strong>
        {note}
      </div>
    </div>
  );
}

/** A money figure that counts up to its value when it first appears or changes. */
function CountUp({ paise, label }: { paise: number; label: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useCountUp(ref, paise, formatINRCompact);
  return (
    <>
      <span className="visually-hidden">{label}</span>
      <span ref={ref} aria-hidden="true" className="count-up" />
    </>
  );
}

/**
 * The figure in the middle of a ring, counting up to itself.
 *
 * SVG has no span to hide behind, so the accessible name is carried by the chart's own
 * aria-label and this text is marked decorative: a screen reader would otherwise read a number
 * that is still moving.
 */
function CountUpText({
  paise,
  /* Not `format`: SVG has an attribute of that name, so the prop would be handed to the element. */
  formatValue,
  ...props
}: { paise: number; formatValue: (value: number) => string } & React.SVGProps<SVGTextElement>) {
  const ref = useRef<SVGTextElement>(null);
  useCountUp(ref, paise, formatValue);
  return <text {...props} ref={ref} aria-hidden="true" />;
}

function ChangeVsLastMonth({
  current,
  previous,
  comparison,
  higherIsGood
}: {
  current: number;
  previous: number;
  comparison: Overview["comparison"];
  higherIsGood: boolean;
}) {
  // Nothing to compare against; a percentage off zero would be meaningless.
  if (previous <= 0) return null;
  const [year, month] = comparison.month.split("-").map(Number);
  const shortMonth = new Date(year, month - 1, 1).toLocaleDateString("en-IN", { month: "short" });
  const period = comparison.partial ? `1-${comparison.throughDay} ${shortMonth}` : shortMonth;
  const change = Math.round(((current - previous) / previous) * 100);
  if (change === 0) {
    return <small className="summary-change">Same as {period}</small>;
  }
  const up = change > 0;
  const good = up === higherIsGood;
  return (
    <small className={`summary-change ${good ? "good" : "bad"}`} title={`${formatINR(previous)} over ${period}`}>
      {up ? "↑" : "↓"} {Math.abs(change)}% vs {period}
    </small>
  );
}

function UpcomingPaymentsList({
  upcoming,
  availableCashPaise
}: {
  upcoming: UpcomingPayments | null;
  availableCashPaise: number;
}) {
  if (!upcoming) {
    return <PanelLoader label="Checking what's due" />;
  }
  if (upcoming.items.length === 0) {
    return <EmptyState text="Nothing due soon. AutoPay renewals, loan EMIs and card bills appear here before they're charged." />;
  }
  const dueLabel = (daysAway: number, dueDate: string) =>
    daysAway === 0
      ? "Due today"
      : daysAway === 1
        ? "Due tomorrow"
        : `In ${daysAway} days, ${formatDateWithYear(dueDate).replace(/ \d{4}$/, "")}`;
  // One block per kind, always in this order, and a kind with nothing due is left out.
  const groups = [
    { kind: "autopay" as const, title: "AutoPay", icon: <CalendarClock size={16} /> },
    { kind: "loan" as const, title: "Loans", icon: <Landmark size={16} /> },
    { kind: "sip" as const, title: "Fund instalments", icon: <TrendingUp size={16} /> },
    { kind: "card" as const, title: "Credit card payments", icon: <CreditCard size={16} /> }
  ]
    .map((group) => ({ ...group, items: upcoming.items.filter((item) => item.kind === group.kind) }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="upcoming-list">
      {groups.map((group) => {
        const groupTotal = group.items.reduce((sum, item) => sum + item.amountPaise, 0);
        return (
          <section className="upcoming-group" key={group.kind}>
            <header className="upcoming-group-head">
              <h3>{group.title}</h3>
              <strong>{formatINR(groupTotal)}</strong>
            </header>
            {group.items.map((item) => (
              <div
                className={`upcoming-row${item.notCoveredBy ? " held" : item.daysAway <= 2 ? " soon" : ""}`}
                key={`${item.kind}-${item.id}`}
              >
                <span className="upcoming-icon">{group.icon}</span>
                <div className="upcoming-main">
                  <strong>{item.name}</strong>
                  {/* An AutoPay that fell due and could not be taken says so here rather than
                      disappearing: nothing was recorded, so this is the only sign it is owed. */}
                  <small>
                    {item.notCoveredBy
                      ? item.heldBecause === "archived"
                        ? `Due ${formatShortDate(item.dueDate)} · ${item.notCoveredBy} is archived`
                        : `Due ${formatShortDate(item.dueDate)} · not enough in ${item.notCoveredBy}`
                      : dueLabel(item.daysAway, item.dueDate)}
                  </small>
                </div>
                <strong className="amount-out">{formatINR(item.amountPaise)}</strong>
              </div>
            ))}
          </section>
        );
      })}
      <div className="upcoming-total">
        <span>Total due</span>
        <strong>{formatINR(upcoming.totalPaise)}</strong>
      </div>
      {upcoming.totalPaise > availableCashPaise && (
        <p className="upcoming-warning">
          <CircleAlert size={14} /> That's more than your available cash of {formatINR(availableCashPaise)}.
        </p>
      )}
    </div>
  );
}

function Metric({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className={`metric ${warning ? "warning" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

function PanelLoader({ label }: { label: string }) {
  return (
    <div className="skeleton-block" role="status" aria-busy="true">
      <span className="visually-hidden">{label}</span>
      <span className="skeleton-line" />
      <span className="skeleton-line" />
      <span className="skeleton-line" />
      <span className="skeleton-line" />
    </div>
  );
}

/**
 * A short look at the app, shown once on a new install and replayable from Profile. Muted so the
 * browser lets it start, and always skippable.
 */
function IntroVideo({ onClose }: { onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [soundOn, setSoundOn] = useState(false);
  // Closing is a handoff, not an unmount: the overlay plays itself out and then goes.
  const [leaving, setLeaving] = useState(false);
  const leave = useCallback(() => setLeaving(true), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") leave();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [leave]);

  // The film now plays on every open, so it must never be the thing standing in the way.
  // If it cannot start within a few seconds -- blocked request, decode failure, a stalled
  // network -- it hands off by itself rather than leaving a dark rectangle on screen.
  useEffect(() => {
    const watchdog = window.setTimeout(() => {
      const video = videoRef.current;
      if (!video || video.readyState < 3 || (video.paused && video.currentTime === 0)) leave();
    }, 4000);
    return () => window.clearTimeout(watchdog);
  }, [leave]);

  // Belt and braces: if the leaving animation never reports back, close anyway.
  useEffect(() => {
    if (!leaving) return;
    const fallback = window.setTimeout(onClose, 900);
    return () => window.clearTimeout(fallback);
  }, [leaving, onClose]);

  return (
    <div
      className={`intro-overlay${leaving ? " is-leaving" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="What Financial Tracker does"
      onAnimationEnd={(event) => {
        if (leaving && event.target === event.currentTarget) onClose();
      }}
    >
      <div className="intro-frame">
        <video
          ref={videoRef}
          className="intro-video"
          src="/intro.mp4"
          autoPlay
          muted={!soundOn}
          playsInline
          preload="auto"
          onEnded={leave}
          onError={leave}
          onStalled={leave}
        />
        <div className="intro-actions">
          <button
            type="button"
            className="secondary-action"
            onClick={() => {
              const video = videoRef.current;
              if (!video) return;
              video.muted = soundOn;
              setSoundOn((value) => !value);
              void video.play().catch(() => undefined);
            }}
          >
            {soundOn ? "Mute" : "Sound on"}
          </button>
          <button type="button" className="primary-action" onClick={leave}>
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}

function FullScreenState({
  icon,
  title,
  detail
}: {
  icon: React.ReactNode;
  title: string;
  detail?: string;
}) {
  return (
    <div className="fullscreen-state">
      <div>{icon}</div>
      <h1>{title}</h1>
      {detail && <p>{detail}</p>}
    </div>
  );
}

function ConfirmModal({
  request,
  onCancel,
  onDone
}: {
  request: ConfirmRequest;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [working, setWorking] = useState(false);

  async function confirm() {
    setWorking(true);
    try {
      await request.onConfirm();
      onDone();
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className={`confirm-modal ${request.tone === "danger" ? "danger" : ""}`} role="dialog" aria-modal="true">
        <div className="confirm-icon">
          <Trash2 size={20} />
        </div>
        <div>
          <h2>{request.message}</h2>
          {request.detail && <p>{request.detail}</p>}
        </div>
        <div className="confirm-actions">
          <button className="secondary-action" onClick={onCancel} disabled={working}>
            Cancel
          </button>
          <button className="primary-action danger-confirm" onClick={confirm} disabled={working}>
            {working ? "Working..." : request.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function monthEndForInput(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  const date = new Date(year, monthIndex, 0);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function recentMonthOptions(fromMonth: string, count: number) {
  const [year, monthNumber] = fromMonth.split("-").map(Number);
  const options: Array<{ value: string; label: string }> = [];
  for (let back = 0; back < count; back += 1) {
    const date = new Date(year, monthNumber - 1 - back, 1);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    options.push({ value, label: formatMonth(value) });
  }
  return options;
}

// Splits and refunds depend on other records (split lines, the original purchase), so a
// one-tap copy can't reproduce them faithfully, so those are left to the normal form.
// Money back only makes sense for something that was paid out: not transfers or card bills.
function shiftMonth(month: string, count: number) {
  const [year, monthIndex] = month.split("-").map(Number);
  const date = new Date(year, monthIndex - 1 + count, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** One-tap periods for Reports: step month by month, or jump to the ranges people ask about. */
function ReportPeriodBar({
  from,
  to,
  onChange
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const thisMonth = todayISO().slice(0, 7);
  const anchorMonth = (from || `${thisMonth}-01`).slice(0, 7);
  const isWholeMonth = from === `${anchorMonth}-01` && to === monthEndForInput(anchorMonth);
  const setMonth = (month: string) => onChange(`${month}-01`, monthEndForInput(month));
  const presets = [
    { label: "This month", from: `${thisMonth}-01`, to: monthEndForInput(thisMonth) },
    { label: "Last month", from: `${shiftMonth(thisMonth, -1)}-01`, to: monthEndForInput(shiftMonth(thisMonth, -1)) },
    { label: "Last 3 months", from: `${shiftMonth(thisMonth, -2)}-01`, to: monthEndForInput(thisMonth) },
    { label: "This year", from: `${thisMonth.slice(0, 4)}-01-01`, to: monthEndForInput(thisMonth) }
  ];

  return (
    <div className="report-period-bar">
      <div className="report-month-stepper">
        <button type="button" className="icon-button" aria-label="Previous month" onClick={() => setMonth(shiftMonth(anchorMonth, -1))}>
          <ChevronLeft size={18} />
        </button>
        <strong>
          {isWholeMonth
            ? formatMonth(anchorMonth)
            : presets.find((preset) => preset.from === from && preset.to === to)?.label ?? "Custom range"}
        </strong>
        <button
          type="button"
          className="icon-button"
          aria-label="Next month"
          disabled={anchorMonth >= thisMonth && isWholeMonth}
          onClick={() => setMonth(shiftMonth(anchorMonth, 1))}
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="report-presets" role="group" aria-label="Report period">
        {presets.map((preset) => {
          const active = preset.from === from && preset.to === to;
          return (
            <button
              key={preset.label}
              type="button"
              className={`filter-chip${active ? " active" : ""}`}
              aria-pressed={active}
              onClick={() => onChange(preset.from, preset.to)}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function previousMonthOf(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  const date = new Date(year, monthIndex - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function canRefund(transaction: Transaction) {
  return (
    transaction.direction === "outflow" &&
    transaction.status !== "split" &&
    transaction.refundedPaise < transaction.amountPaise &&
    (transaction.kind === "expense" || transaction.kind === "investment" || transaction.kind === "emi")
  );
}

function canAddAgain(transaction: Transaction) {
  return transaction.status !== "split" && transaction.kind !== "refund" && transaction.kind !== "reversal";
}

function draftFromTransaction(
  transaction: Transaction,
  categoryTypes: CategoryType[],
  accounts: Account[]
): TransactionEditDraft {
  const fallbackType = typeForKind(categoryTypes, transaction.kind);
  return {
    id: transaction.id,
    date: transaction.date,
    accountId: transaction.accountId,
    kind: transaction.kind,
    method: transaction.method,
    merchant: transaction.merchant ?? "",
    note: transaction.note ?? "",
    typeId: transaction.typeId ?? fallbackType?.id ?? "",
    subcategoryId: transaction.subcategoryId ?? "",
    amount: (transaction.amountPaise / 100).toFixed(2),
    transferAccountId:
      transaction.transferAccountId ??
      (transaction.subcategoryId === SELF_TRANSFER_SUBCATEGORY_ID
        ? ""
        : accounts.find((account) => account.type === "credit_card")?.id ?? ""),
    loanId: transaction.loanId ?? "",
    loanPaymentType: transaction.loanPaymentType ?? "emi",
    subscriptionId: transaction.subscriptionId ?? "",
    investmentId: transaction.investmentId ?? "",
    vacationId: transaction.vacationId ?? "",
    cardEmiPaise: transaction.cardEmiPaise
  };
}

function flattenSubcategories(categoryTypes: CategoryType[]): Category[] {
  return categoryTypes.flatMap((type) =>
    type.subcategories.map((subcategory) => subcategoryToCategory(subcategory))
  );
}

function preferredType(categoryTypes: CategoryType[], behavior: TaxonomyBehavior) {
  return categoryTypes.find((type) => type.behavior === behavior);
}

function typeForKind(categoryTypes: CategoryType[], kind: TransactionKind) {
  return categoryTypes.find((type) => type.behavior === behaviorForKind(kind));
}

function behaviorForKind(kind: TransactionKind): TaxonomyBehavior {
  if (kind === "income") return "income";
  if (kind === "investment") return "investment";
  if (kind === "emi") return "loan";
  if (kind === "transfer") return "transfer";
  if (kind === "card_payment") return "card_payment";
  if (kind === "refund" || kind === "reversal") return "refund";
  return "expense";
}

function kindForBehavior(behavior: TaxonomyBehavior): TransactionKind {
  if (behavior === "income") return "income";
  if (behavior === "investment") return "investment";
  if (behavior === "loan") return "emi";
  if (behavior === "transfer") return "transfer";
  if (behavior === "card_payment") return "card_payment";
  if (behavior === "refund") return "refund";
  return "expense";
}

function directionForBehavior(behavior: TaxonomyBehavior) {
  return behavior === "income" || behavior === "refund" ? "inflow" : "outflow";
}

function subcategoryToCategory(subcategory: Subcategory): Category {
  return {
    id: subcategory.id,
    name: subcategory.name,
    icon: subcategory.icon,
    color: subcategory.color,
    isSystem: subcategory.isSystem,
    isLocked: subcategory.isLocked,
    sortOrder: subcategory.sortOrder
  };
}

function typeToCategory(type: CategoryType | MonthlyReport["types"][number]): Category {
  const id = "typeId" in type ? type.typeId : type.id;
  return {
    id,
    name: type.name,
    icon: type.icon,
    color: type.color,
    isSystem: "isSystem" in type ? type.isSystem : true,
    isLocked: "isLocked" in type ? type.isLocked : false,
    sortOrder: "sortOrder" in type ? type.sortOrder : 0
  };
}

function selfTransferTargetAccounts(accounts: Account[], sourceAccountId: string) {
  return accounts.filter((account) => account.type === "bank" && account.id !== sourceAccountId);
}

function isSelfTransfer(transaction: Transaction) {
  return transaction.subcategoryId === SELF_TRANSFER_SUBCATEGORY_ID && Boolean(transaction.transferAccountId);
}

/** Up is good, down is danger, exactly unchanged is ordinary text (white would vanish in light mode). */
/**
 * One segment per credit card that owes money: the amount outstanding, carrying the card's limit so
 * the bar view can draw it as utilisation rather than against the biggest card.
 */
/** Distinct colours for items that would otherwise share one colour, such as holdings of one type. */
const segmentPalette = ["#3a55b4", "#0f766e", "#b45309", "#9333ea", "#be123c", "#0891b2", "#4d7c0f", "#a21caf"];

/** The holdings of one type, each with its own colour so the slices can be told apart. */
function holdingSegments(investments: Investment[], typeId: string): DonutSegment[] {
  return investments
    .filter((item) => item.type === typeId && item.currentValuePaise > 0)
    .sort((a, b) => b.currentValuePaise - a.currentValuePaise)
    .map((item, index) => ({
      id: item.id,
      name: item.name,
      color: segmentPalette[index % segmentPalette.length],
      amountPaise: item.currentValuePaise
    }));
}

/** One segment per investment type that holds something: all stocks together, all funds together. */
function investmentTypeSegments(investments: Investment[]): DonutSegment[] {
  return INVESTMENT_TYPES.map((type) => ({
    id: type.id,
    name: type.label,
    color: type.color,
    amountPaise: investments
      .filter((item) => item.type === type.id)
      .reduce((sum, item) => sum + item.currentValuePaise, 0)
  }))
    .filter((segment) => segment.amountPaise > 0)
    .sort((a, b) => b.amountPaise - a.amountPaise);
}

function cardUtilisationSegments(accounts: Account[]): DonutSegment[] {
  const palette = ["#3a55b4", "#b45309", "#0f766e", "#9333ea", "#be123c", "#15803d"];
  return accounts
    .filter((account) => account.type === "credit_card" && account.outstandingPaise > 0)
    .sort((a, b) => b.outstandingPaise - a.outstandingPaise)
    .map((account, index) => ({
      id: account.id,
      name: account.name,
      color: palette[index % palette.length],
      amountPaise: account.outstandingPaise,
      maxPaise: account.creditLimitPaise ?? undefined
    }));
}

function gainToneClass(paise: number) {
  if (paise > 0) return "amount-in";
  if (paise < 0) return "amount-out";
  return "amount-flat";
}

function signedImpact(paise: number) {
  if (paise === 0) return formatINR(0);
  return `${paise > 0 ? "+" : "-"}${formatINR(Math.abs(paise))}`;
}

function formatShare(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0%";
  if (value < 1) return "<1%";
  if (value < 10) return `${Math.round(value * 10) / 10}%`;
  return `${Math.round(value)}%`;
}

function amountInputFromPaise(paise: number) {
  return (paise / 100).toFixed(2);
}

function parseRateToBps(value: string) {
  const normalized = value.replace("%", "").trim();
  const rate = Number.parseFloat(normalized);
  if (!Number.isFinite(rate) || rate < 0) {
    throw new Error("Enter a valid interest rate.");
  }
  return Math.round(rate * 100);
}

function rateInputFromBps(bps: number) {
  return String(Math.round((bps / 100) * 100) / 100);
}

function formatRateFromBps(bps: number) {
  return `${rateInputFromBps(bps)}%`;
}

function loanProgressPercent(loan: Loan) {
  const principal = safePaise(loan.principalAmountPaise);
  if (principal <= 0) return 0;
  return Math.min(Math.max((loanPrincipalPaidValue(loan) / principal) * 100, 0), 100);
}

function safePaise(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : 0;
}

function loanOutstandingValue(loan: Loan) {
  return safePaise(loan.outstandingPaise);
}

function loanPrincipalPaidValue(loan: Loan) {
  const direct = safePaise(loan.principalPaidPaise);
  if (direct > 0) return direct;
  return Math.max(safePaise(loan.principalAmountPaise) - loanOutstandingValue(loan), 0);
}

function loanInterestPaidValue(loan: Loan) {
  return safePaise(loan.interestPaidPaise);
}

function accountIconForType(type: Account["type"], size = 16) {
  if (type === "credit_card") return <CreditCard size={size} />;
  if (type === "food_card") return <Utensils size={size} />;
  return <Landmark size={size} />;
}

function accountTypeLabel(type: Account["type"]) {
  if (type === "credit_card") return "Credit card";
  if (type === "food_card") return "Food card";
  return "Bank account";
}

function methodLabel(method: PaymentMethod) {
  if (method === "upi") return "UPI";
  if (method === "credit_card") return "Credit card";
  if (method === "bank_transfer") return "Bank transfer";
  if (method === "cash") return "Cash";
  return "Other";
}

function accountIconTone(type: Account["type"]) {
  if (type === "credit_card") return "card";
  if (type === "food_card") return "food";
  return "bank";
}

function creditUtilization(account: Account) {
  const limit = account.creditLimitPaise ?? 0;
  if (account.type !== "credit_card" || limit <= 0) {
    return 0;
  }
  return Math.min(Math.max(Math.round((account.outstandingPaise / limit) * 100), 0), 100);
}

function formatBackupStatus(status: BackupStatus | null) {
  if (!status) return "Unknown";
  return status.managedBy === "host" ? "Kept by the database host" : "Not being kept";
}

function formatBackupDetail(status: BackupStatus | null) {
  if (!status) return "The app could not reach the database to ask.";
  return status.managedBy === "host"
    ? "The database is hosted, and its host takes the backups. The app does not copy it, and could not: a hosted database does not hand a client its own storage."
    : "This database is running locally and nothing is backing it up.";
}

/* Exported for the gate verifier in .unlazy/forms-19, which renders these to static markup to
   check what a page shows before anything has been clicked. Nothing else imports them. */
export {
  AccountForm,
  AccountsPage,
  consolidateDonutSegments,
  BudgetPlannerPage,
  CategoriesPage,
  FormDialog,
  InvestmentForm,
  InvestmentsPage,
  LedgerRow,
  LoanForm,
  LoansPage,
  SubscriptionCard,
  SubscriptionForm,
  SubscriptionsPage,
  TransactionsPage,
  navItems,
  VacationForm,
  WhatsNewPage,
  VacationsPage
};
