import { TransactionsRepository } from "../db/repositories/transactions.repository.js";
import { pool } from "../config/database.js";
import { RequestContext } from "../context/request-context.js";

async function main() {
  // Mock context
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
    const txns = await TransactionsRepository.findFiltered({ merchant: "Netflix" });
    console.log(`Found ${txns.length} Netflix transactions:`);
    txns.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()).forEach(t => {
      console.log(`  Date: ${t.date} | Amount: ${t.amount} | Memo: ${t.memo} | Family: ${t.merchantFamily}`);
    });
  });

  await pool.end();
}

main();
