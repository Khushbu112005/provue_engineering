import fs from "fs";
import path from "path";
import { FinanceService } from "../services/finance-service.js";
import { TransactionsRepository } from "../db/repositories/transactions.repository.js";
import { FundsRepository } from "../db/repositories/funds.repository.js";
import { pool } from "../config/database.js";
import { RequestContext } from "../context/request-context.js";

async function main() {
  const sampleName = process.env.SAMPLE_NAME;
  if (!sampleName) {
    console.error("❌ ERROR: SAMPLE_NAME environment variable not set (e.g. sample_a, sample_b, sample_c)");
    process.exit(1);
  }

  console.log(`Calculating expected results for: ${sampleName}`);

  // Initialize a mock request context
  const mockStore = {
    requestId: "mock",
    traceId: "mock",
    sessionId: "mock",
    question: "mock",
    toolsCalled: [],
    tablesRead: new Set<string>(),
    tokenUsage: { prompt: 0, completion: 0, total: 0 },
    agentPlan: null,
    startTime: Date.now(),
    responseLength: 0,
    toolExecutionTime: 0,
    databaseQueryTime: 0
  };

  await RequestContext.run(mockStore, async () => {
    // 1. Q1 2025 Spend (Jan 2025 - Mar 2025)
    const q1Spend = await FinanceService.getNetSpending({
      startDate: "2025-01-01",
      endDate: "2025-03-31",
      excludeTransfers: true
    });

    // 2. Food Spend March 2025 (March 2025)
    const foodSpendMarch2025 = await FinanceService.getNetSpending({
      category: "food",
      startDate: "2025-03-01",
      endDate: "2025-03-31"
    });

    // 3. Rent Spend (Total)
    const rentSpend = await FinanceService.getNetSpending({
      category: "rent"
    });

    // 4. Portfolio Performance (Worth, Gain, overall returns)
    const portfolio = await FinanceService.getHoldingsPerformance();

    // 5. Pick the first holding to verify individual realized return
    const firstHolding = portfolio.holdings[0];
    let holdingReturnDetail = null;
    if (firstHolding) {
      holdingReturnDetail = {
        fundId: firstHolding.fundId,
        fundName: firstHolding.fundName,
        realizedReturnPct: firstHolding.realizedReturnPct.value,
        realizedReturnFormatted: firstHolding.realizedReturnPct.formatted,
        units: firstHolding.units,
        purchaseCost: firstHolding.purchaseCost.value,
        currentValue: firstHolding.currentValue.value
      };
    }

    // 6. Fund Period Return for the first fund in DB
    const allFunds = await FundsRepository.findAll();
    const firstFund = allFunds[0];
    let fundPeriodReturnDetail = null;
    if (firstFund) {
      try {
        const res = await FinanceService.getFundPeriodReturn(firstFund.id, "2024-01-01", "2025-01-01");
        fundPeriodReturnDetail = {
          fundId: res.fundId,
          fundName: res.fundName,
          periodReturnPct: res.periodReturn.value,
          periodReturnFormatted: res.periodReturn.formatted
        };
      } catch (err: any) {
        console.warn(`⚠️ Could not compute 1-year period return for ${firstFund.id}: ${err.message}`);
      }
    }

    // 7. Subscriptions
    const subs = await FinanceService.detectSubscriptions();

    // Compile results
    const results = {
      q1Spend: q1Spend.totalSpend.value,
      q1SpendFormatted: q1Spend.totalSpend.formatted,
      foodSpendMarch2025: foodSpendMarch2025.totalSpend.value,
      foodSpendMarch2025Formatted: foodSpendMarch2025.totalSpend.formatted,
      rentSpend: rentSpend.totalSpend.value,
      rentSpendFormatted: rentSpend.totalSpend.formatted,
      portfolioValue: portfolio.totalCurrentValue.value,
      portfolioValueFormatted: portfolio.totalCurrentValue.formatted,
      portfolioGain: portfolio.totalRealizedGain.value,
      portfolioGainFormatted: portfolio.totalRealizedGain.formatted,
      portfolioReturnPct: portfolio.portfolioRealizedReturnPct.value,
      portfolioReturnPctFormatted: portfolio.portfolioRealizedReturnPct.formatted,
      holdingReturnDetail,
      fundPeriodReturnDetail,
      subscriptionCount: subs.length,
      subscriptions: subs.map(s => ({
        merchant: s.merchant,
        frequency: s.frequency,
        avgAmount: s.avgAmount.value
      }))
    };

    // Ensure directory exists
    const outDir = path.resolve("./src/evals/expected-results");
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const outFile = path.join(outDir, `${sampleName}.json`);
    fs.writeFileSync(outFile, JSON.stringify(results, null, 2), "utf-8");
    console.log(`✅ Saved expected results to: ${outFile}`);
  });

  await pool.end();
}

main().catch(err => {
  console.error("❌ Expected calculator failed:", err);
  process.exit(1);
});
