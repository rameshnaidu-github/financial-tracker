import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";

// Always keep this many of the newest backups...
export const BACKUP_KEEP_COUNT = 5;
// ...plus the newest backup of each of the last this-many days, so a bad afternoon (or a
// burst of 30-minute backups of already-damaged data) can't push every good copy out.
export const BACKUP_KEEP_DAYS = 7;
const BACKUP_FILE_PATTERN = /^finance-(?:before-[a-z0-9-]+-)?\d{4}-\d{2}-\d{2}T.*\.db$/i;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * FINANCE_BACKUP_DIR wins. Otherwise a database at a custom FINANCE_DB_PATH keeps its backups
 * beside it, so a second copy of the app (or a test run) can never prune the main app's backups
 * in <project>/backups.
 */
export function resolveBackupDir(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()) {
  if (env.FINANCE_BACKUP_DIR) {
    return path.resolve(env.FINANCE_BACKUP_DIR);
  }
  if (env.FINANCE_DB_PATH) {
    return path.join(path.dirname(path.resolve(env.FINANCE_DB_PATH)), "backups");
  }
  return path.join(cwd, "backups");
}

export function ensureBackupDir() {
  const backupDir = resolveBackupDir();
  mkdirSync(backupDir, { recursive: true });
  return backupDir;
}

function localDayKey(ms: number) {
  const date = new Date(ms);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function pruneBackupFiles(
  backupDir = ensureBackupDir(),
  keepCount = BACKUP_KEEP_COUNT,
  keepDays = BACKUP_KEEP_DAYS,
  nowMs = Date.now()
) {
  if (!existsSync(backupDir)) {
    return;
  }

  const entries = readdirSync(backupDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && BACKUP_FILE_PATTERN.test(entry.name))
    .map((entry) => {
      const fullPath = path.join(backupDir, entry.name);
      try {
        const stats = statSync(fullPath);
        return {
          fullPath,
          name: entry.name,
          mtimeMs: stats.mtimeMs,
          size: stats.size
        };
      } catch {
        return null;
      }
    })
    .filter((entry): entry is { fullPath: string; name: string; mtimeMs: number; size: number } => Boolean(entry));

  const newestFirst = entries
    .filter((entry) => entry.size > 0)
    .sort((left, right) => right.mtimeMs - left.mtimeMs || right.name.localeCompare(left.name));

  const keep = new Set(newestFirst.slice(0, keepCount).map((entry) => entry.fullPath));
  const daysSeen = new Set<string>();
  for (const entry of newestFirst) {
    if (nowMs - entry.mtimeMs > keepDays * DAY_MS) {
      continue;
    }
    const day = localDayKey(entry.mtimeMs);
    if (!daysSeen.has(day)) {
      daysSeen.add(day);
      keep.add(entry.fullPath);
    }
  }

  for (const entry of entries) {
    if (keep.has(entry.fullPath)) {
      continue;
    }

    try {
      unlinkSync(entry.fullPath);
    } catch {
      // Backup pruning should never block the app from starting or saving data.
    }
  }
}
