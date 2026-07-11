import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";

export const BACKUP_KEEP_COUNT = 3;
const BACKUP_FILE_PATTERN = /^finance-(?:before-[a-z0-9-]+-)?\d{4}-\d{2}-\d{2}T.*\.db$/i;

export function ensureBackupDir() {
  const backupDir = process.env.FINANCE_BACKUP_DIR
    ? path.resolve(process.env.FINANCE_BACKUP_DIR)
    : path.join(process.cwd(), "backups");
  mkdirSync(backupDir, { recursive: true });
  return backupDir;
}

export function pruneBackupFiles(backupDir = ensureBackupDir(), keepCount = BACKUP_KEEP_COUNT) {
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

  const latestValidPaths = new Set(
    entries
      .filter((entry) => entry.size > 0)
      .sort((left, right) => right.mtimeMs - left.mtimeMs || right.name.localeCompare(left.name))
      .slice(0, keepCount)
      .map((entry) => entry.fullPath)
  );

  for (const entry of entries) {
    if (entry.size > 0 && latestValidPaths.has(entry.fullPath)) {
      continue;
    }

    try {
      unlinkSync(entry.fullPath);
    } catch {
      // Backup pruning should never block the app from starting or saving data.
    }
  }
}
