import { config } from './config.js';
import { openDatabase } from './database.js';
import { seedDatabaseIfEmpty } from './seed.js';

const db = openDatabase(config.databasePath);
try {
  console.log(seedDatabaseIfEmpty(db) ? 'Created 25 example tickets.' : 'Database already contains tickets; no changes made.');
} finally {
  db.close();
}
