import express from "express";
import fs from "fs";
import path from "path";
import { env } from "../config/env.js";
import { checkDatabaseConnection } from "../config/database.js";
import { taraAgent } from "../agent/agent.js";
import { QueryPlanner } from "../agent/query-planner.js";
import { DateResolver } from "../services/date-resolver.js";
import { RequestContext, TokenUsage } from "../context/request-context.js";
import { CONSTANTS } from "../config/constants.js";
import { ErrorCode } from "../types/error-codes.js";
import { ErrorHandler } from "../services/error-handler.js";

import { DeterministicExecutor } from "../services/deterministic-executor.js";

let globalBypassLlm = process.env.BYPASS_LLM === "true";

export const app = express();
app.use(express.json());

// Ensure log directory exists
const logDir = path.resolve(CONSTANTS.LOG_DIR);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

function writeToLog(logPath: string, message: string) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logPath, `[${timestamp}] ${message}\n`, "utf-8");
}

// Favicon — inline SVG to suppress browser 404
app.get("/favicon.ico", (req, res) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#6366f1"/><text x="16" y="22" font-size="20" text-anchor="middle" fill="#fff" font-family="sans-serif">T</text></svg>`;
  const buf = Buffer.from(svg);
  res.set("Content-Type", "image/svg+xml");
  res.set("Cache-Control", "public, max-age=86400");
  res.send(buf);
});

// GET / landing page
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Tara - Finance Research Agent</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          background-color: #0b0f19;
          color: #f3f4f6;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
        }
        .card {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          padding: 32px;
          max-width: 480px;
          text-align: center;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
        }
        h1 {
          font-size: 2rem;
          margin-bottom: 8px;
          background: linear-gradient(135deg, #6366f1, #a855f7);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        p {
          color: #9ca3af;
          line-height: 1.6;
          margin-bottom: 24px;
        }
        .status {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background-color: rgba(16, 185, 129, 0.1);
          color: #10b981;
          padding: 6px 12px;
          border-radius: 9999px;
          font-size: 0.875rem;
          font-weight: 500;
          margin-bottom: 24px;
        }
        .status-dot {
          width: 8px;
          height: 8px;
          background-color: #10b981;
          border-radius: 50%;
          animation: pulse 2s infinite;
        }
        .endpoints {
          text-align: left;
          background-color: rgba(0, 0, 0, 0.2);
          border-radius: 8px;
          padding: 16px;
          font-family: monospace;
          font-size: 0.875rem;
        }
        .endpoint-row {
          margin-bottom: 8px;
        }
        .endpoint-row:last-child {
          margin-bottom: 0;
        }
        .method {
          font-weight: bold;
          color: #818cf8;
          margin-right: 8px;
        }
        @keyframes pulse {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
          70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Tara Finance Agent</h1>
        <div class="status">
          <span class="status-dot"></span>
          API Status: Online
        </div>
        <p>Tara is a production-grade personal finance research agent capable of answering natural language questions about spending, transactions, categories, investments, mutual funds, and portfolio performance.</p>
        <div class="endpoints">
          <div class="endpoint-row"><span class="method">GET</span><a href="/health" style="color: inherit; text-decoration: none;">/health</a></div>
          <div class="endpoint-row"><span class="method">POST</span>/ask</div>
        </div>
      </div>
    </body>
    </html>
  `);
});

// GET /health check
app.get("/health", async (req, res) => {
  const isDbConnected = await checkDatabaseConnection();
  if (!isDbConnected) {
    writeToLog(CONSTANTS.ERROR_LOG, "Health check failed: database disconnected");
    res.status(500).json({ status: "error", message: "Database connection failed" });
    return;
  }
  res.json({ status: "ok" });
});

// GET /ask — Interactive chat UI
app.get("/ask", (req, res) => {
  res.status(200).send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Ask Tara - Finance Research Agent</title>
      <link rel="icon" type="image/svg+xml" href="/favicon.ico">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #0b0f19;
          color: #f3f4f6;
          height: 100vh;
          display: flex;
          flex-direction: column;
        }

        /* Header */
        .header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 24px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          background: rgba(11,15,25,0.95);
          backdrop-filter: blur(12px);
          position: sticky;
          top: 0;
          z-index: 10;
        }
        .header-icon {
          width: 36px; height: 36px;
          background: linear-gradient(135deg, #6366f1, #a855f7);
          border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          font-weight: 700; font-size: 1.1rem; color: #fff;
        }
        .header-text h1 {
          font-size: 1.05rem; font-weight: 600;
          background: linear-gradient(135deg, #6366f1, #a855f7);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        }
        .header-text span { font-size: 0.75rem; color: #6b7280; }
        .header-home {
          margin-left: auto;
          color: #6b7280; text-decoration: none; font-size: 0.8rem; font-weight: 500;
          padding: 6px 14px; border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.08);
          transition: all 0.2s;
        }
        .header-home:hover { color: #a5b4fc; border-color: rgba(165,180,252,0.3); }

        /* Chat area */
        .chat-area {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          scroll-behavior: smooth;
        }

        /* Welcome state */
        .welcome {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 24px;
          text-align: center;
          animation: fadeIn 0.6s ease;
        }
        .welcome-icon {
          width: 64px; height: 64px;
          background: linear-gradient(135deg, #6366f1, #a855f7);
          border-radius: 18px;
          display: flex; align-items: center; justify-content: center;
          font-size: 1.8rem; font-weight: 700; color: #fff;
          box-shadow: 0 8px 32px rgba(99,102,241,0.3);
        }
        .welcome h2 {
          font-size: 1.4rem; font-weight: 600; color: #e5e7eb;
        }
        .welcome p { color: #6b7280; font-size: 0.9rem; max-width: 420px; line-height: 1.6; }
        .suggestions {
          display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; max-width: 560px;
        }
        .suggestion-chip {
          padding: 8px 16px;
          background: rgba(99,102,241,0.08);
          border: 1px solid rgba(99,102,241,0.2);
          border-radius: 20px;
          color: #a5b4fc;
          font-size: 0.8rem;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }
        .suggestion-chip:hover {
          background: rgba(99,102,241,0.16);
          border-color: rgba(99,102,241,0.4);
          transform: translateY(-1px);
        }

        /* Messages */
        .msg {
          max-width: 680px;
          padding: 14px 18px;
          border-radius: 16px;
          font-size: 0.9rem;
          line-height: 1.65;
          animation: slideUp 0.3s ease;
          word-wrap: break-word;
        }
        .msg-user {
          align-self: flex-end;
          background: linear-gradient(135deg, #4f46e5, #7c3aed);
          color: #fff;
          border-bottom-right-radius: 4px;
        }
        .msg-bot {
          align-self: flex-start;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          color: #d1d5db;
          border-bottom-left-radius: 4px;
        }
        .msg-bot pre {
          background: rgba(0,0,0,0.3);
          padding: 12px; border-radius: 8px;
          font-family: 'SF Mono', 'Fira Code', monospace;
          font-size: 0.82rem; overflow-x: auto;
          margin-top: 8px;
          white-space: pre-wrap;
        }

        /* Typing indicator */
        .typing {
          align-self: flex-start;
          display: flex; gap: 5px; padding: 16px 20px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px; border-bottom-left-radius: 4px;
        }
        .typing span {
          width: 7px; height: 7px;
          background: #6366f1;
          border-radius: 50%;
          animation: bounce 1.4s infinite both;
        }
        .typing span:nth-child(2) { animation-delay: 0.16s; }
        .typing span:nth-child(3) { animation-delay: 0.32s; }

        /* Input bar */
        .input-bar {
          padding: 16px 24px;
          border-top: 1px solid rgba(255,255,255,0.06);
          background: rgba(11,15,25,0.95);
          backdrop-filter: blur(12px);
        }
        .input-wrap {
          max-width: 720px;
          margin: 0 auto;
          display: flex;
          gap: 10px;
          align-items: center;
        }
        .input-wrap input {
          flex: 1;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          color: #f3f4f6;
          padding: 12px 18px;
          border-radius: 12px;
          font-size: 0.9rem;
          font-family: inherit;
          outline: none;
          transition: border-color 0.2s;
        }
        .input-wrap input:focus { border-color: #6366f1; }
        .input-wrap input::placeholder { color: #4b5563; }
        .input-wrap button {
          background: linear-gradient(135deg, #6366f1, #7c3aed);
          color: #fff;
          border: none;
          padding: 12px 20px;
          border-radius: 12px;
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }
        .input-wrap button:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(99,102,241,0.4); }
        .input-wrap button:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }

        /* Animations */
        @keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1); }
        }

        /* Scrollbar */
        .chat-area::-webkit-scrollbar { width: 6px; }
        .chat-area::-webkit-scrollbar-track { background: transparent; }
        .chat-area::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }

        @media (max-width: 640px) {
          .suggestions { flex-direction: column; align-items: center; }
          .msg { max-width: 90%; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="header-icon">T</div>
        <div class="header-text">
          <h1>Tara Finance Agent</h1>
          <span>Personal Finance Research Assistant</span>
        </div>
        <a href="/" class="header-home">← Home</a>
      </div>

      <div class="chat-area" id="chatArea">
        <div class="welcome" id="welcome">
          <div class="welcome-icon">T</div>
          <h2>Ask me anything about your finances</h2>
          <p>I can answer questions about your spending, transactions, mutual fund portfolio, NAV trends, and more.</p>
          <div class="suggestions">
            <div class="suggestion-chip" onclick="askSuggestion(this)">What is my portfolio worth today?</div>
            <div class="suggestion-chip" onclick="askSuggestion(this)">Show my top 5 merchants by spend</div>
            <div class="suggestion-chip" onclick="askSuggestion(this)">How much did I spend on food in Q1 2025?</div>
            <div class="suggestion-chip" onclick="askSuggestion(this)">Compare January vs February 2025 spending</div>
            <div class="suggestion-chip" onclick="askSuggestion(this)">List all my holdings</div>
            <div class="suggestion-chip" onclick="askSuggestion(this)">What was my biggest expense?</div>
          </div>
        </div>
      </div>

      <div class="input-bar">
        <form class="input-wrap" id="askForm" onsubmit="handleSubmit(event)">
          <input type="text" id="questionInput" placeholder="Ask about your spending, portfolio, funds..." autocomplete="off" autofocus />
          <button type="submit" id="sendBtn">Send</button>
        </form>
      </div>

      <script>
        const chatArea = document.getElementById('chatArea');
        const welcome = document.getElementById('welcome');
        const input = document.getElementById('questionInput');
        const sendBtn = document.getElementById('sendBtn');

        function askSuggestion(el) {
          input.value = el.textContent;
          handleSubmit(new Event('submit'));
        }

        function addMessage(text, type) {
          if (welcome) welcome.remove();
          const div = document.createElement('div');
          div.className = 'msg msg-' + type;
          div.textContent = text;
          chatArea.appendChild(div);
          chatArea.scrollTop = chatArea.scrollHeight;
          return div;
        }

        function showTyping() {
          const div = document.createElement('div');
          div.className = 'typing';
          div.id = 'typingIndicator';
          div.innerHTML = '<span></span><span></span><span></span>';
          chatArea.appendChild(div);
          chatArea.scrollTop = chatArea.scrollHeight;
        }

        function hideTyping() {
          const el = document.getElementById('typingIndicator');
          if (el) el.remove();
        }

        async function handleSubmit(e) {
          e.preventDefault();
          const question = input.value.trim();
          if (!question) return;

          addMessage(question, 'user');
          input.value = '';
          sendBtn.disabled = true;
          showTyping();

          try {
            const resp = await fetch('/ask', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ question })
            });
            const data = await resp.json();
            hideTyping();
            addMessage(data.answer || 'No answer received.', 'bot');
          } catch (err) {
            hideTyping();
            addMessage('Something went wrong. Please try again.', 'bot');
          } finally {
            sendBtn.disabled = false;
            input.focus();
          }
        }
      </script>
    </body>
    </html>
  `);
});

// POST /ask endpoint
app.post("/ask", async (req, res) => {
  const { question } = req.body;
  if (!question || typeof question !== "string") {
    res.status(400).json({ error: "Missing required parameter 'question' as string" });
    return;
  }

  const startTime = Date.now();
  const requestId = `req_${Math.random().toString(36).substring(2, 11)}`;
  const traceId = `tr_${Math.random().toString(36).substring(2, 11)}`;
  const sessionId = req.headers["x-session-id"] as string || `sess_${Math.random().toString(36).substring(2, 11)}`;

  // Initialize context store
  const store = {
    requestId,
    traceId,
    sessionId,
    question,
    toolsCalled: [],
    tablesRead: new Set<string>(),
    tokenUsage: { prompt: 0, completion: 0, total: 0 },
    agentPlan: null,
    startTime,
    responseLength: 0,
    toolExecutionTime: 0,
    databaseQueryTime: 0
  };

  await RequestContext.run(store, async () => {
    try {
      writeToLog(CONSTANTS.APPLICATION_LOG, `requestId=${requestId} traceId=${traceId} Question: ${question}`);

      // 1. Query Planner Layer
      const plan = await QueryPlanner.plan(question, taraAgent);
      RequestContext.setAgentPlan(plan);

      // 2. Date Resolver Layer
      const resolvedDates = await DateResolver.resolve(question);

      // 3. Orchestration & LLM Generation
      // Prepend resolved date range to ensure LLM calls tools with precise boundaries if defined
      let augmentedPrompt = `User Question: "${question}"`;
      if (resolvedDates.startDate && resolvedDates.endDate) {
        augmentedPrompt += `\n[DATE RESOLVER CONTEXT: Use startDate = "${resolvedDates.startDate}" and endDate = "${resolvedDates.endDate}" for any date-filtered tools.]`;
      }

      let answer = "";
      let tokenUsage = { prompt: 0, completion: 0, total: 0 };

      if (globalBypassLlm) {
        writeToLog(CONSTANTS.APPLICATION_LOG, `Bypassing LLM generation (globalBypassLlm is true) for traceId=${traceId}`);
        answer = await DeterministicExecutor.execute(question, plan);
      } else {
        try {
          writeToLog(CONSTANTS.APPLICATION_LOG, `Attempting LLM generation for traceId=${traceId}`);
          const result = await taraAgent.generate(augmentedPrompt);
          answer = result.text || "";
          
          const usage = (result as any).usage;
          if (usage) {
            tokenUsage = {
              prompt: usage.inputTokens || 0,
              completion: usage.outputTokens || 0,
              total: usage.totalTokens || 0
            };
          }
        } catch (llmErr: any) {
          writeToLog(CONSTANTS.ERROR_LOG, `LLM generation failed (falling back to DeterministicExecutor): ${llmErr.message}`);
          console.warn(`⚠️ LLM generation failed, running deterministic execution fallback: ${llmErr.message}`);
          
          // Self-healing: if LLM quota exceeded, bypass subsequent calls
          if (llmErr.message?.includes("quota") || llmErr.message?.includes("429") || llmErr.message?.includes("insufficient_quota")) {
            globalBypassLlm = true;
            console.log("ℹ️ Quota error detected. Enabling automatic LLM bypass for subsequent requests.");
          }
          
          answer = await DeterministicExecutor.execute(question, plan);
        }
      }

      // 4. Grounding and Token Usage
      RequestContext.setResponseLength(answer.length);
      RequestContext.setTokenUsage(tokenUsage.prompt, tokenUsage.completion, tokenUsage.total);

      const latencyMs = Date.now() - startTime;

      // Log observability output
      const finalStore = RequestContext.getStore()!;
      const logEntry = {
        request_id: finalStore.requestId,
        trace_id: finalStore.traceId,
        session_id: finalStore.sessionId,
        question: finalStore.question,
        tools_called: finalStore.toolsCalled,
        tables_read: Array.from(finalStore.tablesRead),
        latency_ms: latencyMs,
        status: "success",
        error_message: null,
        token_usage_prompt: finalStore.tokenUsage.prompt,
        token_usage_completion: finalStore.tokenUsage.completion,
        token_usage_total: finalStore.tokenUsage.total,
        agent_plan: finalStore.agentPlan,
        response_length: finalStore.responseLength,
        tool_execution_time: finalStore.toolExecutionTime,
        database_query_time: finalStore.databaseQueryTime
      };

      fs.appendFileSync(CONSTANTS.REQUEST_LOG, JSON.stringify(logEntry) + "\n", "utf-8");
      writeToLog(CONSTANTS.APPLICATION_LOG, `requestId=${requestId} traceId=${traceId} Success latency=${latencyMs}ms`);

      res.json({ answer });
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      const errorResp = ErrorHandler.handle(err, `POST /ask`);
      
      const logEntry = {
        request_id: requestId,
        trace_id: traceId,
        session_id: sessionId,
        question: question,
        tools_called: store.toolsCalled,
        tables_read: Array.from(store.tablesRead),
        latency_ms: latencyMs,
        status: "failed",
        error_message: errorResp.errorMessage,
        token_usage_prompt: store.tokenUsage.prompt,
        token_usage_completion: store.tokenUsage.completion,
        token_usage_total: store.tokenUsage.total,
        agent_plan: store.agentPlan,
        response_length: 0,
        tool_execution_time: store.toolExecutionTime,
        database_query_time: store.databaseQueryTime
      };

      fs.appendFileSync(CONSTANTS.REQUEST_LOG, JSON.stringify(logEntry) + "\n", "utf-8");
      writeToLog(CONSTANTS.ERROR_LOG, `requestId=${requestId} traceId=${traceId} Failure: ${errorResp.errorMessage}`);

      res.json({ answer: errorResp.userMessage });
    }
  });
});

// Startup validation and server boot
export async function startServer() {
  console.log("⚡ Starting server validation...");

  // Validate database connection
  const dbOk = await checkDatabaseConnection();
  if (!dbOk) {
    console.error("❌ Startup Validation Failed: Database is not reachable.");
    process.exit(1);
  }
  console.log("✅ Startup Validation: Database connection successful.");

  // Check required directories
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const port = env.PORT;
  app.listen(port, () => {
    console.log(`🚀 Server running on port ${port} (mode: ${env.NODE_ENV})`);
    writeToLog(CONSTANTS.APPLICATION_LOG, `Server started on port ${port}`);
  });
}

// Only start the server if file is run directly (not during imports/testing)
if (process.argv[1] && (process.argv[1].endsWith("server.ts") || process.argv[1].endsWith("server.js"))) {
  startServer().catch(err => {
    console.error("❌ Server startup crash:", err);
    process.exit(1);
  });
}
