# Production Deployment Checklist — Tara

This checklist details the steps required to deploy the Tara Finance Research Agent to production and verify its functionality.

---

## 1. Environment Configurations
Verify that all environment variables are correctly populated in your hosting provider (e.g., Railway, Render, Vercel, or AWS):

- [ ] `DATABASE_URL` is set to your production PostgreSQL connection string (with SSL mode enabled if required by provider).
- [ ] `OPENAI_API_KEY` is set to a valid, funded OpenAI API key.
- [ ] `NODE_ENV` is set to `production`.
- [ ] `PORT` is configured (defaults to 3000 if not specified).
- [ ] `SYSTEM_DATE` is set (optional, e.g. `"2025-03-31"` to lock relative calculations, or omitted to default to the latest transaction date).

---

## 2. Database & Schema Verification
- [ ] Deploy the Drizzle schema pushing tables to the production instance:
  ```bash
  npx drizzle-kit push
  ```
- [ ] Verify that all indices are created successfully in production:
  - `transactions` indexes: `(date)`, `(category)`, `(canonical_merchant)`, `(date, category)`, `(date, canonical_merchant)`
  - `fund_navs` indexes: `(fund_id)`, `(fund_id, nav_date)`
  - `holdings` indexes: `(fund_id)`
- [ ] Execute database ingestion to populate the initial reference data:
  ```bash
  cross-env DATA_DIR=./data/sample_a npm run ingest
  ```

---

## 3. Server Startup & Health Checks
- [ ] Start the application in production mode:
  ```bash
  npm run build
  npm start
  ```
- [ ] Verify that startup validation succeeds (no database or environment crashes).
- [ ] Query the health check endpoint:
  ```bash
  curl http://localhost:3000/health
  ```
  - Expected response: `200 OK` with `{"status": "ok"}`.

---

## 4. Endpoint Functionality Checks
Send a test POST request to `/ask`:
```bash
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "What is my portfolio worth today?"}'
```
- [ ] Verify that the response status is `200 OK`.
- [ ] Verify that the response contains the `"answer"` property.
- [ ] Verify that the answer text contains the portfolio worth (e.g. `₹76,562.69` on sample_a).

---

## 5. Logging & Observability Audit
- [ ] Verify that request traces are appended to `logs/request_logs.jsonl`.
- [ ] Verify that logs contain prompt and completion token counts (or zero counts for fallback runs).
- [ ] Check `logs/application.log` to confirm request routings and database query execution times.
- [ ] Verify that `logs/error.log` is clean of unhandled exceptions.
