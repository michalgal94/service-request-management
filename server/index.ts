import { createApp } from './app.js';
import { config } from './config.js';
import { openDatabase } from './database.js';
import { seedDatabaseIfEmpty } from './seed.js';

const db = openDatabase(config.databasePath);
if (config.autoSeed) seedDatabaseIfEmpty(db);
const app = createApp(db, { staticDirectory: config.staticDirectory });
const server = app.listen(config.port, '127.0.0.1', () => {
  console.log(`Service requests: http://localhost:${config.port}`);
});

server.on('error', (error) => {
  console.error('Could not start server:', error.message);
  db.close();
  process.exitCode = 1;
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
