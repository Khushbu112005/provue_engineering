import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Client } = pg;

const schemaSql = `
CREATE TABLE IF NOT EXISTS funds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fund_navs (
  id SERIAL PRIMARY KEY,
  fund_id TEXT NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  nav_date DATE NOT NULL,
  nav_value DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS holdings (
  id SERIAL PRIMARY KEY,
  fund_id TEXT NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  units DOUBLE PRECISION NOT NULL,
  purchase_date DATE NOT NULL,
  purchase_nav DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  date DATE NOT NULL,
  merchant TEXT NOT NULL,
  normalized_merchant TEXT NOT NULL,
  merchant_family TEXT NOT NULL,
  canonical_merchant TEXT NOT NULL,
  category TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  currency TEXT NOT NULL,
  memo TEXT NOT NULL
);

-- Transactions indexes
CREATE INDEX IF NOT EXISTS idx_txn_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_txn_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_txn_canonical_merchant ON transactions(canonical_merchant);
CREATE INDEX IF NOT EXISTS idx_txn_date_category ON transactions(date, category);
CREATE INDEX IF NOT EXISTS idx_txn_date_canonical_merchant ON transactions(date, canonical_merchant);

-- Fund NAVs indexes
CREATE INDEX IF NOT EXISTS idx_nav_fund_id ON fund_navs(fund_id);
CREATE INDEX IF NOT EXISTS idx_nav_fund_id_date ON fund_navs(fund_id, nav_date);

-- Holdings indexes
CREATE INDEX IF NOT EXISTS idx_holding_fund_id ON holdings(fund_id);
`;

async function main() {
  console.log("⚡ Executing database migration...");
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("✅ Connected to database. Creating tables and indexes...");
    await client.query(schemaSql);
    console.log("🚀 Migration successful! All tables and indexes verified.");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
