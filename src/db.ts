import Database from "better-sqlite3";
import path from "path";

const dbPath = path.resolve(__dirname, "../payments.db");
const db = new Database(dbPath);

// Create bookings table if not exists
db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    amount INTEGER NOT NULL,
    status TEXT NOT NULL,
    inflight_batch_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    hyperswitch_payment_id TEXT,
    hyperswitch_client_secret TEXT
  );
`);



export default db;
