// db.ts
import { Pool } from "pg";

export const pool = new Pool({
  user: process.env.DB_USER || "booking_user",
  host: process.env.DB_HOST || "bk_postgres",
  database: process.env.DB_NAME || "booking_db",
  password: process.env.DB_PASSWORD || "booking_pass",
  port: Number(process.env.DB_PORT) || 5432,
});

export async function initDB() {
  const client = await pool.connect();
  try {
    // await client.query("BEGIN");

    // Enable UUID
    await client.query(`
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    `);

    // BOOKINGS
    await client.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        host_id UUID NOT NULL,
        amount INTEGER NOT NULL,
        currency VARCHAR(10) NOT NULL DEFAULT 'MAD',
        status VARCHAR(50) NOT NULL DEFAULT 'created',
        payment_id VARCHAR(255) UNIQUE,
        payment_processed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // PAYMENTS
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
        hyperswitch_payment_id VARCHAR(255) UNIQUE NOT NULL,
        amount INTEGER NOT NULL,
        currency VARCHAR(10) NOT NULL,
        status VARCHAR(50) NOT NULL,
        raw_response JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // WEBHOOK EVENTS
    await client.query(`
      CREATE TABLE IF NOT EXISTS webhook_events (
        id SERIAL PRIMARY KEY,
        event_id VARCHAR(255) UNIQUE,
        event_type VARCHAR(100),
        payload JSONB,
        processed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query("COMMIT");
    console.log("✅ Postgres schema ready");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ DB INIT ERROR", err);
  } finally {
    client.release();
  }
}