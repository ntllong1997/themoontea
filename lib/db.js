import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Ensure the data folder exists
const dbFolder = path.join(process.cwd(), 'data');
if (!fs.existsSync(dbFolder)) fs.mkdirSync(dbFolder);

// SQLite DB file
const db = new Database(path.join(dbFolder, 'orders.db'));

// Create table if not exists
db.prepare(
    `
  CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    order TEXT NOT NULL
  )
`
).run();

export default db;
