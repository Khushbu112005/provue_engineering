import { app } from "../api/server.js";
import { pool } from "../config/database.js";
import http from "http";

async function runAsk(question: string, port: number): Promise<{ answer: string; latencyMs: number }> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ question });
    const req = http.request(
      {
        hostname: "localhost",
        port,
        path: "/ask",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data)
        }
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          const latencyMs = Date.now() - start;
          try {
            const parsed = JSON.parse(body);
            resolve({ answer: parsed.answer || "", latencyMs });
          } catch (e) {
            resolve({ answer: body, latencyMs });
          }
        });
      }
    );

    req.on("error", (err) => reject(err));
    req.write(data);
    req.end();
  });
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[idx];
}

async function main() {
  console.log("⚡ Starting Performance Benchmark...");

  const port = 3007;
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(port, resolve));
  console.log(`🚀 Temp API server started on port ${port}`);

  const testQueries = [
    "What was my biggest expense?",
    "How much did I spend on food in March 2025?",
    "What is my portfolio worth today?",
    "Which merchants look like recurring subscriptions?",
    "Rank all funds by one-year return between 2024-01-01 and 2025-01-01."
  ];

  const latencies: number[] = [];

  console.log(`Running ${testQueries.length * 3} benchmark requests...`);
  
  // Warm up request
  await runAsk(testQueries[0], port);

  for (let i = 0; i < 3; i++) {
    for (const q of testQueries) {
      process.stdout.write(`   Benchmarking: "${q}"... `);
      try {
        const res = await runAsk(q, port);
        latencies.push(res.latencyMs);
        console.log(`DONE (${res.latencyMs}ms)`);
      } catch (err: any) {
        console.log(`FAILED (${err.message})`);
      }
    }
  }

  const avg = latencies.reduce((sum, v) => sum + v, 0) / latencies.length;
  const p95 = percentile(latencies, 95);
  const p50 = percentile(latencies, 50);

  console.log("\n=================================");
  console.log("📊 PERFORMANCE METRICS:");
  console.log(`   Total Queries Run: ${latencies.length}`);
  console.log(`   Average Latency: \x1b[36m${avg.toFixed(2)}ms\x1b[0m`);
  console.log(`   P50 (Median) Latency: \x1b[36m${p50.toFixed(2)}ms\x1b[0m`);
  console.log(`   P95 Latency: \x1b[35m${p95.toFixed(2)}ms\x1b[0m`);
  console.log("=================================\n");

  // Shut down temp server and database connection
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();

  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Performance benchmark failed:", err);
  process.exit(1);
});
