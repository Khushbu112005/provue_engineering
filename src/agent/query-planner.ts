import { z } from "zod";
import { Agent } from "@mastra/core/agent";

export interface ExecutionPlan {
  taskType: string;
  tools: string[];
  calculations: string[];
  confidenceScore: number;
}

export const ExecutionPlanSchema = z.object({
  taskType: z.string().describe("Type of the task, e.g. SPENDING_QUERY, SPENDING_COMPARISON, PORTFOLIO_AGGREGATE, FUND_RETURNS, RECURRING_SUBSCRIPTIONS"),
  tools: z.array(z.string()).describe("List of tools to execute, e.g. queryTransactions, queryFunds, queryHoldings, detectRecurringSubscriptions"),
  calculations: z.array(z.string()).describe("Required mathematical calculations, e.g. net_spend, period_return, realized_return, mom_growth"),
  confidenceScore: z.number().min(0).max(100).describe("Confidence score of the plan from 0 to 100")
});

export const QueryPlanner = {
  planRuleBased(question: string): ExecutionPlan | null {
    const q = question.toUpperCase().trim();

    // 1. Recurring Subscriptions
    if (q.includes("RECURRING") || q.includes("SUBSCRIPTION") || q.includes("SUBSRIPTION")) {
      return {
        taskType: "RECURRING_SUBSCRIPTIONS",
        tools: ["detectRecurringSubscriptions"],
        calculations: ["recurring_detection"],
        confidenceScore: 99
      };
    }

    // 2. Portfolio aggregates
    if (
      q.includes("PORTFOLIO") ||
      (q.includes("WORTH") && q.includes("TODAY")) ||
      (q.includes("MADE") && q.includes("ABSOLUTE"))
    ) {
      return {
        taskType: "PORTFOLIO_AGGREGATE",
        tools: ["queryHoldings"],
        calculations: ["purchase_cost", "current_value", "realized_gain", "realized_return"],
        confidenceScore: 98
      };
    }

    // 3. Fund / Holding returns (Realized return)
    if (
      q.includes("REALIZED RETURN") ||
      q.includes("REALISED RETURN") ||
      q.includes("MY RETURN ON") ||
      q.includes("HOLDING") ||
      q.includes("UNITS")
    ) {
      return {
        taskType: "HOLDINGS_RETURNS",
        tools: ["queryHoldings"],
        calculations: ["realized_return", "current_value"],
        confidenceScore: 95
      };
    }

    // 4. Fund period return (Fund only)
    if (
      q.includes("FUND'S RETURN") ||
      q.includes("FUND RETURN") ||
      q.includes("RANK ALL FUNDS") ||
      q.includes("RANK FUNDS") ||
      (q.includes("RETURN") && q.includes("FUND"))
    ) {
      return {
        taskType: "FUND_RETURNS",
        tools: ["queryFunds"],
        calculations: ["period_return"],
        confidenceScore: 95
      };
    }

    // 5. Spend Comparison
    if (
      q.includes("COMPARE") ||
      q.includes("GROW FASTER") ||
      q.includes("DECREASE FROM") ||
      q.includes("INCREASE FROM") ||
      q.includes("GROWTH RATE") ||
      q.includes("MONTH BY MONTH") ||
      q.includes("FOOD VERSUS TRAVEL") ||
      q.includes("VS")
    ) {
      return {
        taskType: "SPENDING_COMPARISON",
        tools: ["queryTransactions"],
        calculations: ["net_spend", "mom_growth", "comparison"],
        confidenceScore: 95
      };
    }

    // 6. Spend Ranking (e.g. top 5 merchants)
    if (
      q.includes("TOP") ||
      q.includes("RANK") ||
      q.includes("BIGGEST EXPENSE") ||
      q.includes("LARGEST EXPENSE") ||
      q.includes("SINGLE BIGGEST")
    ) {
      return {
        taskType: "SPENDING_RANKING",
        tools: ["queryTransactions"],
        calculations: ["net_spend", "ranking"],
        confidenceScore: 95
      };
    }

    // 7. General Spending Query
    if (
      q.includes("SPEND") ||
      q.includes("EXPENSE") ||
      q.includes("COST") ||
      q.includes("HOW MUCH DID I") ||
      q.includes("TOTAL ACTUAL") ||
      q.includes("RENT") ||
      q.includes("DATA") ||
      q.includes("TRANSACTION")
    ) {
      return {
        taskType: "SPENDING_QUERY",
        tools: ["queryTransactions"],
        calculations: ["net_spend"],
        confidenceScore: 90
      };
    }

    return null;
  },

  async plan(question: string, agent?: Agent): Promise<ExecutionPlan> {
    // Try rule-based first
    const rulePlan = this.planRuleBased(question);
    if (rulePlan) {
      return rulePlan;
    }

    // Default safe fallback plan
    return {
      taskType: "SPENDING_QUERY",
      tools: ["queryTransactions"],
      calculations: ["net_spend"],
      confidenceScore: 70
    };
  }
};
