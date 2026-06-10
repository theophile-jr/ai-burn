import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

let available = null;

/** Whether the `sqlite3` CLI is on PATH (needed for Cursor & OpenCode). */
export async function sqliteAvailable() {
  if (available !== null) return available;
  try {
    await execFileP("sqlite3", ["--version"]);
    available = true;
  } catch {
    available = false;
  }
  return available;
}

/**
 * Run a read-only query against a SQLite file via the sqlite3 CLI and return
 * rows as objects, or null when sqlite3/the db/the table is unavailable.
 * `immutable=1` lets us read databases the owning app keeps locked.
 */
export async function querySqlite(dbPath, sql) {
  if (!(await sqliteAvailable())) return null;
  const uri = `file:${encodeURI(dbPath)}?immutable=1`;
  try {
    const { stdout } = await execFileP(
      "sqlite3",
      ["-readonly", "-json", uri, sql],
      { maxBuffer: 256 * 1024 * 1024 }
    );
    const text = stdout.trim();
    return text ? JSON.parse(text) : [];
  } catch {
    return null;
  }
}
