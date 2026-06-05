import fs from "fs";
import path from "path";
import { db, pool, checkDatabaseConnection } from "../config/database.js";
import { funds, fundNavs, holdings, transactions } from "../db/schema.js";
import { validateIngestionData } from "./validators.js";
import { buildCanonicalMapping } from "../services/merchant-normalization.js";
import { sql } from "drizzle-orm";

async function main() {
  const dataDir = process.env.DATA_DIR;
  if (!dataDir) {
    console.error("❌ ERROR: DATA_DIR environment variable is not defined.");
    process.exit(1);
  }

  const absoluteDataDir = path.resolve(dataDir);
  console.log(`📂 Ingesting snapshots from: ${absoluteDataDir}`);

  // Resolve JSON file paths
  const txnsPath = path.join(absoluteDataDir, "transactions.json");
  const fundsPath = path.join(absoluteDataDir, "funds.json");
  const holdingsPath = path.join(absoluteDataDir, "holdings.json");

  // Check files existence
  if (!fs.existsSync(txnsPath) || !fs.existsSync(fundsPath) || !fs.existsSync(holdingsPath)) {
    console.error("❌ ERROR: Missing one or more required JSON files in snapshot directory.");
    process.exit(1);
  }

  // Read files
  const rawTxns = JSON.parse(fs.readFileSync(txnsPath, "utf-8"));
  const rawFunds = JSON.parse(fs.readFileSync(fundsPath, "utf-8"));
  const rawHoldings = JSON.parse(fs.readFileSync(holdingsPath, "utf-8"));

  // 1. Validation Layer
  const validation = validateIngestionData(rawTxns, rawFunds, rawHoldings);
  
  if (validation.warnings.length > 0) {
    console.log("⚠️ Warnings during validation:");
    validation.warnings.forEach(w => console.warn(`   - ${w}`));
  }

  if (!validation.isValid) {
    console.error("❌ Ingestion validation failed. Aborting.");
    validation.errors.forEach(e => console.error(`   - ${e}`));
    process.exit(1);
  }
  console.log("✅ Data schema and integrity validated successfully.");

  // 2. Database Connection Check
  const dbConnected = await checkDatabaseConnection();
  if (!dbConnected) {
    console.error("❌ ERROR: Database connectivity failure. Ingestion aborted.");
    process.exit(1);
  }

  // 3. Merchant Normalization & Clustering
  console.log("🧠 Normalizing and clustering merchants...");
  const rawMerchants = rawTxns.map((t: any) => t.merchant);
  const merchantMapping = buildCanonicalMapping(rawMerchants);

  // 4. Data Preparation
  const fundsToInsert = rawFunds.map((f: any) => ({
    id: f.id,
    name: f.name,
    category: f.category
  }));

  const navsToInsert = rawFunds.flatMap((f: any) =>
    f.nav.map((n: any) => ({
      fundId: f.id,
      navDate: n.date,
      navValue: Number(n.value)
    }))
  );

  const holdingsToInsert = rawHoldings.map((h: any) => ({
    fundId: h.fund_id,
    units: Number(h.units),
    purchaseDate: h.purchase_date,
    purchaseNav: Number(h.purchase_nav)
  }));

  const txnsToInsert = rawTxns.map((t: any) => {
    const mapping = merchantMapping[t.merchant] || {
      normalized: t.merchant.toUpperCase(),
      family: t.merchant.toUpperCase(),
      canonical: t.merchant.toUpperCase()
    };

    return {
      id: t.id,
      date: t.date,
      merchant: t.merchant,
      normalizedMerchant: mapping.normalized,
      merchantFamily: mapping.family,
      canonicalMerchant: mapping.canonical,
      category: t.category,
      amount: Number(t.amount),
      currency: t.currency,
      memo: t.memo || ""
    };
  });

  // 5. Run DB Transaction
  console.log("💾 Writing to database...");
  try {
    await db.transaction(async (tx) => {
      // Truncate tables in cascade order using raw SQL
      await tx.execute(sql`TRUNCATE TABLE holdings, fund_navs, transactions, funds CASCADE`);

      // Insert funds (parent table)
      if (fundsToInsert.length > 0) {
        const chunkSize = 100;
        for (let i = 0; i < fundsToInsert.length; i += chunkSize) {
          const chunk = fundsToInsert.slice(i, i + chunkSize);
          await tx.insert(funds).values(chunk);
        }
      }

      // Insert fund NAVs
      if (navsToInsert.length > 0) {
        const chunkSize = 500;
        for (let i = 0; i < navsToInsert.length; i += chunkSize) {
          const chunk = navsToInsert.slice(i, i + chunkSize);
          await tx.insert(fundNavs).values(chunk);
        }
      }

      // Insert holdings
      if (holdingsToInsert.length > 0) {
        const chunkSize = 100;
        for (let i = 0; i < holdingsToInsert.length; i += chunkSize) {
          const chunk = holdingsToInsert.slice(i, i + chunkSize);
          await tx.insert(holdings).values(chunk);
        }
      }

      // Insert transactions
      if (txnsToInsert.length > 0) {
        const chunkSize = 200;
        for (let i = 0; i < txnsToInsert.length; i += chunkSize) {
          const chunk = txnsToInsert.slice(i, i + chunkSize);
          await tx.insert(transactions).values(chunk);
        }
      }
    });

    console.log("🎉 Ingestion complete!");
    console.log(`   - Funds: ${fundsToInsert.length}`);
    console.log(`   - NAV Points: ${navsToInsert.length}`);
    console.log(`   - Holdings: ${holdingsToInsert.length}`);
    console.log(`   - Transactions: ${txnsToInsert.length}`);
  } catch (error) {
    console.error("❌ Ingestion transaction failed.", error);
    process.exit(1);
  } finally {
    // Close the pool so script exits cleanly
    await pool.end();
  }
}

main().catch(err => {
  console.error("❌ Ingestion uncaught error:", err);
  process.exit(1);
});
