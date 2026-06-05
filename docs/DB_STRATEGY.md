# Database Strategy

This document details the database architecture, index strategies, query optimizations, and expected access patterns implemented for the Tara Finance Research Agent.

---

## 1. Indexing Strategy

To achieve sub-second query latency and support fast aggregations, we implement targeted indices matching our primary tool access patterns.

### Table: `transactions`
- `(date)`: Accelerates date filters (e.g., Q1 spend, monthly comparisons).
- `(category)`: Speeds up filtering transactions by category (e.g. food, rent).
- `(canonical_merchant)`: Optimizes query aggregations on merchant brands.
- `(date, category)`: Fast composite index for category-level monthly aggregations.
- `(date, canonical_merchant)`: Composite index for monthly merchant brand spending checks.

### Table: `fund_navs`
- `(fund_id)`: Quick lookup of NAV history for a single fund.
- `(fund_id, nav_date)`: Composite index for range-based NAV lookups and closest-date NAV searches.

### Table: `holdings`
- `(fund_id)`: Index for joining holdings against the `funds` table.

---

## 2. Expected Access Patterns

### Ingestion (Write-Heavy)
- Happens periodically via the `ingest.ts` script.
- Utilizes batch inserts within a single database transaction.
- Indices are temporarily bypassed or processed concurrently by PostgreSQL.

### Query transactions (Read-Heavy)
- Occurs at request time when user queries spending.
- Selects, groups, and sums transactions filtering by categories, merchants, and dates.
- Composite index on `(date, category)` ensures the planner avoids sequential scans for date ranges.

### Period Returns & NAV History (Read-Heavy)
- Requires querying Net Asset Values (NAVs) at starting/ending dates.
- Utilizes the composite `(fund_id, nav_date)` index to quickly sort and locate NAV values adjacent to missing dates.
- Prevents database sequential scans.

---

## 3. Query Optimization Strategy

### Deterministic Arithmetic
- Calculations are completed inside SQL (using `SUM`, `COUNT`, `AVG`) or structured repositories, rather than requesting raw datasets and calculating in Node memory or relying on the LLM.
- Reduces network overhead and improves memory efficiency.

### Graceful Fallback Logic for NAV dates
- Resolves closest previous/next dates in SQL using subqueries or ordered limits, leveraging composite index sorting to fetch adjacent values in `O(log N)` complexity.
