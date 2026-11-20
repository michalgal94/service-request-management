import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function openDatabase(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  try {
    db.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;');
    db.exec('BEGIN IMMEDIATE');
    try {
      const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
      if (version > 2) throw new Error('Database schema is newer than this application.');
      if (version === 0) {
        db.exec(`
          CREATE TABLE tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
            description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
            status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed')),
            created_at TEXT NOT NULL
          ) STRICT;
          CREATE INDEX tickets_created_idx ON tickets (created_at DESC, id DESC);
          CREATE INDEX tickets_status_created_idx ON tickets (status, created_at DESC, id DESC);
        `);
      }
      if (version < 2) {
        db.exec(`
          ALTER TABLE tickets ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1);
          CREATE TABLE ticket_creation_requests (
            idempotency_key TEXT PRIMARY KEY,
            request_hash TEXT NOT NULL,
            response_json TEXT NOT NULL
          ) STRICT;
          PRAGMA user_version = 2;
        `);
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
