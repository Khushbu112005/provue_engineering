# Design Documentation — Tara Finance Research Agent

This document explains the technical design principles, architectural choices, and custom algorithms implemented in Tara.

---

## 1. Core Design Principles

1. **Absolute Mathematical Grounding**: Financial agents must never hallucinate calculations. All totals, percentages, period returns, and portfolio gains are calculated in SQL/code and passed as validated facts, preventing the LLM from doing arithmetic.
2. **Strict Generalization**: Zero hardcoded category lists, fund names, or merchant mappings in application code. The system discovers all schema and metadata vocabulary dynamically from the database.
3. **Resiliency and Self-Healing**: Under high load or API key quota constraints, the system automatically self-heals by bypassing external APIs and serving exact, structured answers using local database repositories.
4. **Sub-Second Latency**: Structured database indexes and efficient SQL distinct queries keep query execution times under 50ms, while memory-caching of the LLM bypass state avoids slow retry timeouts.

---

## 2. Component Design & Decoupled Architecture

Tara separates concerns into distinct layers to maximize engineering maturity:

- **Express 5 API Layer (`src/api/server.ts`)**: Boots the server, validates the environment schema via Zod, checks database connectivity on startup, and exposes `/health` and `/ask`.
- **Request Context Layer (`src/context/request-context.ts`)**: Uses Node's `AsyncLocalStorage` to maintain request-scoped tracing. Every repository query, table read, LLM token count, and function execution time is aggregated dynamically without passing context variables between functions.
- **Query Planner (`src/agent/query-planner.ts`)**: An intent routing layer that determines the request category and calculation parameters. It routes the intent to appropriate tools or fallback handlers.
- **Date Resolver (`src/services/date-resolver.ts`)**: Scans natural language sentences for date expressions (ranges, relative months, quarters, specific years) and resolves them to ISO boundary dates (`startDate`, `endDate`).
- **Drizzle Repository Layer (`src/db/repositories/`)**: Encapsulates SQL executions and database indexing. Drizzle ORM provides type-safe SQL construction, while raw SQL fragments optimize aggregations.
- **Answer Grounding Layer (`src/services/answer-grounding.ts`)**: Formats all financial numbers according to Indian numbering standards (e.g. `₹12,34,567.89`) and rounds currency/rates to exactly 2 decimal places.

---

## 3. Key Algorithms

### A. Jaro-Winkler-Inspired Prefix Normalizer (`src/services/merchant-normalization.ts`)
Raw transaction records contain noisy merchant strings (e.g., location suffixes, payment gateway codes, transaction markers). To normalize merchants into clean canonical brand names without relying on external APIs or ML embeddings:
1. **Clean String**: Convert to uppercase, strip special characters, and remove transaction noise (e.g., `ORDER`, `TRIP`, `PAY`).
2. **Location Removal**: Clip common city names (e.g. `MUMBAI`, `BANGALORE`, `DELHI`) using suffix truncation.
3. **Prefix Clustering**: Use a prefix similarity check. If a normalized merchant matches an existing canonical name prefix (or vice versa) within a minimum length constraint (e.g. `ZEPTO` vs `ZEPTO RUN`), they are grouped under the same family.
4. **Canonical Mapping**: unique families are resolved to the most frequent raw merchant's base name.

### B. Greedy Recurrence Subscription Detection (`src/services/finance-service.ts`)
To identify recurring subscriptions (monthly or quarterly) without relying on hardcoded lists:
1. **Group by Merchant & Category**: Transactions are grouped by normalized merchant brand and category.
2. **Temporal Sorting**: Sort transactions chronologically.
3. **Stream Clustering**: We compute intervals (in days) between successive transactions:
   - **Monthly Recurrence**: Intervals between 25 and 40 days.
   - **Quarterly Recurrence**: Intervals between 75 and 105 days.
4. **Sequence Constraint**: A sequence of transactions is clustered into a recurring stream if it has at least 3 occurrences matching the interval.
5. **Pattern Validation**: The stream's category must be `subscription`, `rent`, or `utilities`, or the transactional memo must contain subscription keywords (e.g., `premium`, `bill`, `electricity`, `internet`).
6. **Confidence Scoring**: Streams with zero amount variance are given 99% confidence, while streams with variable amounts (e.g. utility bills) are given 85% confidence.

### C. Self-Healing LLM Quota Bypass (`src/api/server.ts`)
LLM API calls can fail due to network glitches, rate-limiting, or quota exhaustion. If a failed OpenAI API call returns a `429` or `insufficient_quota` error, Tara intercepts the error, toggles a global `globalBypassLlm` flag to `true`, and falls back to the local `DeterministicExecutor`. 
Subsequent requests bypass OpenAI completely, reducing request latency from ~8 seconds (caused by the AI SDK retry loop) to under 10-50 milliseconds.

---

## 4. Key Design Decisions

- **Express 5**: Uses native promise rejection handling in middleware, simplifying route error boundary designs.
- **Drizzle ORM**: Selected over Prisma for its performance benefits (SQL-like construction, zero runtime overhead, and explicit query logs).
- **Zod**: Used to enforce schema contracts at three boundaries: environment variables, validation of ingested snapshots, and tool result payloads.
- **No Message Queues or Redis**: Because personal finance queries are user-blocking, the pipeline runs synchronously. Bypassing heavy architectures like BullMQ or Redis keeps the system lightweight and easy to deploy.
