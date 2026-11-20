import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function openDatabase(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  try {
    const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
    if (version > 1) throw new Error('Database schema is newer than this application.');
    if (version === 0) {
      db.exec(`
        BEGIN;
        CREATE TABLE tickets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
          description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
          status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed')),
          created_at TEXT NOT NULL
        ) STRICT;
        CREATE INDEX tickets_created_idx ON tickets (created_at DESC, id DESC);
        CREATE INDEX tickets_status_created_idx ON tickets (status, created_at DESC, id DESC);
        PRAGMA user_version = 1;
        COMMIT;
      `);
    }
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
