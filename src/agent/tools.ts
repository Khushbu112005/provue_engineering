import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { FinanceService } from "../services/finance-service.js";
import { RequestContext } from "../context/request-context.js";

// Define output schema types for validation
export const GroundedCurrencySchema = z.object({
  value: z.number(),
  currency: z.string(),
  formatted: z.string()
});

export const GroundedPercentageSchema = z.object({
  value: z.number(),
  formatted: z.string()
});

export const TransactionOutputSchema = z.object({
  id: z.string(),
  date: z.string(),
  merchant: z.string(),
  normalizedMerchant: z.string(),
  merchantFamily: z.string(),
  canonicalMerchant: z.string(),
  category: z.string(),
  amount: z.number(),
  currency: z.string(),
  memo: z.string()
});

export const SpendingAggregateSchema = z.object({
  label: z.string(),
  totalSpend: z.number(),
  transactionCount: z.number()
});

export const QueryTransactionsOutputSchema = z.object({
  success: z.boolean(),
  transactions: z.array(TransactionOutputSchema).optional(),
  aggregates: z.array(SpendingAggregateSchema).optional(),
  totalSpend: GroundedCurrencySchema.optional(),
  transactionCount: z.number()
});

export const QueryFundsOutputSchema = z.object({
  success: z.boolean(),
  fundId: z.string().optional(),
  fundName: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  startNav: z.number().optional(),
  endNav: z.number().optional(),
  periodReturn: GroundedPercentageSchema.optional(),
  error: z.string().optional()
});

export const HoldingPerformanceSchema = z.object({
  fundId: z.string(),
  fundName: z.string(),
  units: z.number(),
  purchaseDate: z.string(),
  purchaseNav: z.number(),
  purchaseCost: GroundedCurrencySchema,
  latestNav: z.number(),
  currentValue: GroundedCurrencySchema,
  realizedGain: GroundedCurrencySchema,
  realizedReturnPct: GroundedPercentageSchema
});

export const QueryHoldingsOutputSchema = z.object({
  success: z.boolean(),
  holdings: z.array(HoldingPerformanceSchema).optional(),
  totalPurchaseCost: GroundedCurrencySchema.optional(),
  totalCurrentValue: GroundedCurrencySchema.optional(),
  totalRealizedGain: GroundedCurrencySchema.optional(),
  portfolioRealizedReturnPct: GroundedPercentageSchema.optional(),
  error: z.string().optional()
});

export const SubscriptionDetailSchema = z.object({
  merchant: z.string(),
  category: z.string(),
  frequency: z.enum(["monthly", "quarterly", "irregular"]),
  avgAmount: GroundedCurrencySchema,
  confidenceScore: z.number(),
  occurrences: z.number()
});

export const DetectRecurringSubscriptionsOutputSchema = z.object({
  success: z.boolean(),
  subscriptions: z.array(SubscriptionDetailSchema).optional(),
  error: z.string().optional()
});

// Tool 1: queryTransactions
export const queryTransactions = createTool({
  id: "queryTransactions",
  description: "Query transactions, get details, calculate total spending or aggregations. Filter by category, merchant name, start and end dates. Supports grouping and sorting.",
  inputSchema: z.object({
    category: z.string().optional().describe("Filter by category name (e.g. food, travel, rent, utilities)"),
    merchant: z.string().optional().describe("Filter by merchant name (raw or canonical, e.g. Amazon, Uber)"),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Filter start date YYYY-MM-DD"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Filter end date YYYY-MM-DD"),
    groupBy: z.enum(["category", "merchant", "month"]).optional().describe("Group results by category, merchant, or month"),
    sortBy: z.enum(["amount", "date"]).optional().describe("Sort results by amount or date"),
    sortOrder: z.enum(["asc", "desc"]).optional().describe("Sort order (asc or desc)"),
    limit: z.number().optional().describe("Limit transaction rows returned"),
    excludeTransfers: z.boolean().optional().describe("Exclude internal transfers (defaults to true)")
  }),
  outputSchema: QueryTransactionsOutputSchema,
  execute: async ({ input }) => {
    const startTime = Date.now();
    RequestContext.logToolCall("queryTransactions");
    try {
      if (input.groupBy) {
        const aggs = await FinanceService.aggregateSpending(
          {
            category: input.category,
            merchant: input.merchant,
            startDate: input.startDate,
            endDate: input.endDate,
            excludeTransfers: input.excludeTransfers
          },
          input.groupBy
        );
        return {
          success: true,
          aggregates: aggs,
          transactionCount: aggs.reduce((sum, item) => sum + item.transactionCount, 0)
        };
      } else {
        const txns = await FinanceService.getNetSpending({
          category: input.category,
          merchant: input.merchant,
          startDate: input.startDate,
          endDate: input.endDate,
          excludeTransfers: input.excludeTransfers
        });
        const details = await FinanceService.findFilteredTransactions(
          {
            category: input.category,
            merchant: input.merchant,
            startDate: input.startDate,
            endDate: input.endDate,
            excludeTransfers: input.excludeTransfers
          },
          {
            limit: input.limit,
            sortBy: input.sortBy,
            sortOrder: input.sortOrder
          }
        );
        return {
          success: true,
          transactions: details,
          totalSpend: txns.totalSpend,
          transactionCount: txns.transactionCount
        };
      }
    } finally {
      RequestContext.addToolExecutionTime(Date.now() - startTime);
    }
  }
});

// Tool 2: queryFunds
export const queryFunds = createTool({
  id: "queryFunds",
  description: "Retrieve Net Asset Value (NAV) history for a mutual fund and calculate its period return % between two dates.",
  inputSchema: z.object({
    fundName: z.string().describe("Fund name or fund ID to query (e.g. Bluechip Equity Fund, fund_index)"),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Start date YYYY-MM-DD for return calculation"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("End date YYYY-MM-DD for return calculation")
  }),
  outputSchema: QueryFundsOutputSchema,
  execute: async ({ input }) => {
    const startTime = Date.now();
    RequestContext.logToolCall("queryFunds");
    try {
      const res = await FinanceService.getFundPeriodReturn(input.fundName, input.startDate, input.endDate);
      return {
        success: true,
        ...res
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message
      };
    } finally {
      RequestContext.addToolExecutionTime(Date.now() - startTime);
    }
  }
});

// Tool 3: queryHoldings
export const queryHoldings = createTool({
  id: "queryHoldings",
  description: "Analyze the user's holdings, current value, purchase cost, realized gain/loss, and portfolio aggregates.",
  inputSchema: z.object({
    fundName: z.string().optional().describe("Optional fund name to query a specific holding")
  }),
  outputSchema: QueryHoldingsOutputSchema,
  execute: async ({ input }) => {
    const startTime = Date.now();
    RequestContext.logToolCall("queryHoldings");
    try {
      const perf = await FinanceService.getHoldingsPerformance();
      if (input.fundName) {
        const matchUpper = input.fundName.toUpperCase();
        const filtered = perf.holdings.filter(
          h => h.fundId === input.fundName || h.fundName.toUpperCase().includes(matchUpper)
        );
        return {
          success: true,
          holdings: filtered,
          totalPurchaseCost: filtered.length > 0 ? filtered[0].purchaseCost : undefined,
          totalCurrentValue: filtered.length > 0 ? filtered[0].currentValue : undefined,
          totalRealizedGain: filtered.length > 0 ? filtered[0].realizedGain : undefined,
          portfolioRealizedReturnPct: filtered.length > 0 ? filtered[0].realizedReturnPct : undefined
        };
      }
      return {
        success: true,
        ...perf
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message
      };
    } finally {
      RequestContext.addToolExecutionTime(Date.now() - startTime);
    }
  }
});

// Tool 4: detectRecurringSubscriptions
export const detectRecurringSubscriptions = createTool({
  id: "detectRecurringSubscriptions",
  description: "Detect recurring subscription payments based on payment frequency, consistency, and amount variance.",
  inputSchema: z.object({}),
  outputSchema: DetectRecurringSubscriptionsOutputSchema,
  execute: async () => {
    const startTime = Date.now();
    RequestContext.logToolCall("detectRecurringSubscriptions");
    try {
      const subs = await FinanceService.detectSubscriptions();
      return {
        success: true,
        subscriptions: subs
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message
      };
    } finally {
      RequestContext.addToolExecutionTime(Date.now() - startTime);
    }
  }
});
