/**
 * How What's new is laid out, apart from the page that frames it.
 *
 * Its own module for two reasons. The page itself is a panel, a line of helper text and an
 * empty state -- the part worth reasoning about is what a release looks like once there are
 * several of them, and that part can be rendered and counted on its own here. And App.tsx is
 * large enough that anything self-contained is better read outside it.
 */
import { formatDayHeading } from "./format";
import type { NewsEntry } from "./whats-new";

export const NEWS_GROUPS = [
  { key: "added", heading: "New", tone: "is-new" },
  { key: "fixed", heading: "Fixed", tone: "is-fixed" }
] as const;

/**
 * How many lines of a group the newest release shows before the rest go behind a toggle.
 *
 * Two, not five: the point of the cap is that the newest release reads as a headline rather
 * than a changelog. A reader who wants the whole of it is one press away.
 */
export const NEWS_VISIBLE_LINES = 2;

/** Every release, newest first. */
export function NewsList({ entries }: { entries: NewsEntry[] }) {
  return (
    <ol className="news-list">
      {entries.map((entry, index) => (
        <NewsEntryRow key={entry.date} entry={entry} newest={index === 0} />
      ))}
    </ol>
  );
}

/**
 * One release.
 *
 * The page used to print every line of every release at once -- thirty-odd bullets on arrival,
 * most of them months old and none of them the thing the reader came for. So the newest release
 * opens with its first lines per group, and every older one is a single row carrying its counts.
 * Nothing is removed: a press opens whichever part somebody actually wants.
 *
 * `<details>` rather than state of its own, so the browser handles the toggle, the arrow and the
 * keyboard, and so the closed content is still in the document for find-on-page.
 */
function NewsEntryRow({ entry, newest }: { entry: NewsEntry; newest: boolean }) {
  const counts = NEWS_GROUPS.map(({ key, heading }) => {
    const total = (entry[key] ?? []).length;
    return total === 0 ? null : `${total} ${heading.toLowerCase()}`;
  }).filter((part): part is string => part !== null);

  const groups = NEWS_GROUPS.map(({ key, heading, tone }) => {
    const lines = entry[key] ?? [];
    if (lines.length === 0) {
      return null;
    }
    // Only the newest release is capped. An older one is already behind a toggle of its own,
    // so capping it again would mean two presses to read one line.
    const shown = newest ? lines.slice(0, NEWS_VISIBLE_LINES) : lines;
    const hidden = lines.slice(shown.length);
    return (
      <div className="news-group" key={key}>
        <h4 className={`news-group-heading ${tone}`}>{heading}</h4>
        <ul>
          {shown.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {hidden.length > 0 && (
          <details className="news-more">
            <summary>{hidden.length} more</summary>
            <ul>
              {hidden.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    );
  });

  if (newest) {
    return (
      <li className="news-entry">
        <h3>{formatDayHeading(entry.date)}</h3>
        {groups}
      </li>
    );
  }

  return (
    <li className="news-entry is-past">
      <details className="news-past">
        <summary>
          <span className="news-past-date">{formatDayHeading(entry.date)}</span>
          <span className="news-past-counts">{counts.join(", ")}</span>
        </summary>
        {groups}
      </details>
    </li>
  );
}
