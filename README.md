# Tara — Finance Research Agent

Tara is a production-grade personal finance research agent designed to answer natural language questions about personal spending, transactions, categories, merchant normalizations, refunds, mutual funds, portfolio performance, and investment returns.

Tara is built on a robust, PostgreSQL-backed architecture and leverages TypeScript, Express 5, Mastra SDK, and Drizzle ORM. All calculations are grounded in database queries and executed via code-driven deterministic math to guarantee 100% accuracy and prevent hallucinations.

---

## Key Features

1. **Deterministic Calculations**: 100% database-grounded calculations. Realized returns, NAV period returns, spending aggregates, and recurring subscriptions are computed in code/SQL and rounded to 2 decimal places.
2. **Intent Query Planner**: A query planner layer that parses requests into task types and executes matching deterministic database-backed logic.
3. **Robust Date Resolver**: Flexible date extraction from natural language (relative ranges like YTD, specific quarters, specific months, or exact ISO boundaries).
4. **Merchant Normalization & Prefix Clustering**: Substring cleansing and Jaro-Winkler-inspired prefix clustering to group varied raw merchant text into clean canonical brand names (e.g. mapping `Swiggy Bangalore` and `UPI-SWIGGY-12` to `SWIGGY`).
5. **Greedy Subscription Stream Clustering**: A recurrence stream-clustering algorithm that groups transactional streams into monthly/quarterly subscriptions with variance checks.
6. **Resilient LLM Bypass (Quota-Safe)**: An automatic fast-path bypass layer that self-heals by routing queries directly to the local executor in milliseconds once an upstream LLM quota limit (429) is caught.
7. **Production Logging & Observability**: Complete JSON-lines request log recording prompt tokens, completion tokens, table reads, and database/tool latencies.

---

## Tech Stack

- **Core Runtime**: Node.js & TypeScript
- **Web App Server**: Express 5
- **Agent Orchestrator**: Mastra SDK (`@mastra/core`)
- **Database Access**: PostgreSQL, Drizzle ORM, Drizzle-Kit
- **Validation**: Zod (for env validation, tool outputs, and ingestion checks)
- **Execution Engine**: `tsx` (TypeScript Execute)

---

## Directory Structure

```
├── data/                       # Dataset snapshots (sample_a, sample_b, sample_c)
├── docs/                       # Technical design and schema documents
│   ├── ARCHITECTURE.md         # Request lifecycles and workflow diagrams
│   ├── DATA_DICTIONARY.md      # Data dictionary and column definitions
│   ├── DB_STRATEGY.md          # Expected patterns, indexing, and SQL design
│   └── ER_DIAGRAM.md           # Entity-relationship schema diagram
├── src/
│   ├── agent/                  # Mastra agent tools, agent config, and query planner
│   ├── api/                    # Express 5 application and server endpoints
│   ├── config/                 # validated env, db connections, and constants
│   ├── context/                # Request-scoped tracing via AsyncLocalStorage
│   ├── db/                     # Drizzle schema definition and repository layer
│   ├── evals/                  # dynamic validation suite, reliability and benchmarks
│   ├── ingest/                 # snapshot validation and db ingestion logic
│   └── services/               # date resolver, normalizer, and finance arithmetic
├── package.json
└── tsconfig.json
```

---

## Setup & Installation

### 1. Prerequisites
- **Node.js** (v18 or higher)
- **PostgreSQL** database instance (local or hosted, e.g. Neon, Supabase)

### 2. Environment Variables
Create a `.env` file at the root of the workspace using the template below:

```ini
# PostgreSQL connection string
DATABASE_URL="postgresql://username:password@localhost:5432/provue_tara"

# OpenAI API Key for agent execution (Mastra)
OPENAI_API_KEY="sk-proj-..."

# Optional system date to anchor relative dates (e.g. Q1 2025, last month).
# If omitted, system date defaults to the latest transaction date in the database.
SYSTEM_DATE="2025-03-31"

# Express server port
PORT=3000

# Node Environment
NODE_ENV=development
```

### 3. Install Dependencies
Run the command below to install dependencies:
```bash
npm install
```

### 4. Database Migrations
Ensure your database tables are created according to the schema. You can run migrations using Drizzle-Kit:
```bash
npx drizzle-kit push
```

---

## Execution & Scripts

The following npm scripts are available:

### Ingestion Pipeline
Ingest a dataset snapshot directory containing `transactions.json`, `funds.json`, and `holdings.json`:
```bash
# Set DATA_DIR environment variable to target snapshot folder
$env:DATA_DIR="c:/path/to/data/sample_a"
npm run ingest
```

### Run Server (Local Development)
Start the Express server on the configured port:
```bash
npm run dev
```

### Run Evals Suite
Executes the dynamic 42-case testing suite evaluating net spending, refunds, transfers, subscriptions, fund returns, holding performance, and empty data states:
```bash
npm run evals
```

### Run Reliability Tests
Runs a query 10 times consecutively, checks for identical numerical answers, and reports a consistency score:
```bash
npm run test:reliability
```

### Run Performance Latency Tests
Runs 15 benchmark requests measuring average, median (p50), and p95 request latencies:
```bash
npm run test:performance
```

### Run Generalization Checks
Performs a static scan over source files to ensure no brand, fund, category, or memo names are hardcoded in application logic:
```bash
npm run test:generalization
```

---

## API Routes

### 1. GET `/health`
Verifies database connectivity and server status.
- **Success Response**: `200 OK`
  ```json
  {
    "status": "ok"
  }
  ```

### 2. POST `/ask`
Submits a natural language question.
- **Request Body**:
  ```json
  {
    "question": "How much did I spend on food in March 2025?"
  }
  ```
- **Response**:
  ```json
  {
    "answer": "Your total net spending in category \"food\" from 2025-03-01 to 2025-03-31 was **₹3,156.00** across 6 transaction(s)."
  }
  ```
