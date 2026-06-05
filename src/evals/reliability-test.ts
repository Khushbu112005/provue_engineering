import { app } from "../api/server.js";
import { pool } from "../config/database.js";
import http from "http";

async function runAsk(question: string, port: number): Promise<string> {
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
          try {
            const parsed = JSON.parse(body);
            resolve(parsed.answer || "");
          } catch (e) {
            resolve(body);
          }
        });
      }
    );

    req.on("error", (err) => reject(err));
    req.write(data);
    req.end();
  });
}

// Extracts all numbers from a string (including formatted ones like 1,234.56)
function extractNumbers(str: string): string[] {
  const matches = str.match(/\d+[\d,]*\.\d+/g) || [];
  return matches.map(m => m.replace(/,/g, ""));
}

async function main() {
  console.log("⏱️ Starting Reliability Consistency Test (10 runs)...");

  const port = 3006;
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(port, resolve));
  console.log(`🚀 Temp API server started on port ${port}`);

  const question = "What is my portfolio worth today, and how much have I made on it in absolute INR?";
  console.log(`Question: "${question}"`);

  const results: { run: number; answer: string; numbers: string[] }[] = [];

  for (let i = 1; i <= 10; i++) {
    process.stdout.write(`   Run #${i}... `);
    const start = Date.now();
    try {
      const answer = await runAsk(question, port);
      const numbers = extractNumbers(answer);
      results.push({ run: i, answer, numbers });
      const latency = Date.now() - start;
      console.log(`DONE (${latency}ms) | Numbers extracted: [${numbers.join(", ")}]`);
    } catch (err: any) {
      console.log(`FAILED (${err.message})`);
      results.push({ run: i, answer: `ERROR: ${err.message}`, numbers: [] });
    }
  }

  // Calculate consistency score
  // We compare the numbers extracted in subsequent runs against the first run
  const baseNumbers = results[0]?.numbers || [];
  let matches = 0;

  console.log("\n=================================");
  console.log("📊 CONSISTENCY RUN RESULTS:");
  results.forEach(r => {
    const isMatch = JSON.stringify(r.numbers) === JSON.stringify(baseNumbers);
    if (isMatch && r.numbers.length > 0) matches++;
    console.log(`   Run #${r.run}: ${isMatch ? "\x1b[32mMATCH\x1b[0m" : "\x1b[31mMISMATCH\x1b[0m"} | Extracted: [${r.numbers.join(", ")}]`);
  });

  const consistencyScore = (matches / 10) * 100;
  console.log("=================================");
  console.log(`📈 FINAL CONSISTENCY SCORE: \x1b[35m${consistencyScore.toFixed(2)}%\x1b[0m`);
  console.log("=================================\n");

  // Shut down temp server and database connection
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();

  if (consistencyScore < 100) {
    console.error("❌ Reliability check failed. Consistency score is below 100%.");
    process.exit(1);
  } else {
    console.log("✅ Reliability check passed successfully!");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("❌ Reliability script failed:", err);
  process.exit(1);
});
