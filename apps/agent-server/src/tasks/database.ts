export interface Statement {
  run(...params: (string | number | null)[]): unknown;
  get(
    ...params: (string | number | null)[]
  ): Record<string, unknown> | undefined;
  all(...params: (string | number | null)[]): Record<string, unknown>[];
}
export interface Sqlite {
  exec(sql: string): void;
  prepare(sql: string): Statement;
}
export function initialize(db: Sqlite): void {
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, request_id TEXT UNIQUE NOT NULL, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS task_events (task_id TEXT NOT NULL, sequence INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(task_id,sequence));
    CREATE TABLE IF NOT EXISTS leases (scope TEXT PRIMARY KEY, task_id TEXT NOT NULL, lease_id TEXT NOT NULL, until_ms INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS dispatch_intents (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, digest TEXT NOT NULL, step_id TEXT NOT NULL, receipt TEXT, UNIQUE(task_id, step_id));
  `);
}
export function transaction<T>(db: Sqlite, operation: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
