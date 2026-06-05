import { TransactionsRepository, TransactionFilter } from "../db/repositories/transactions.repository.js";
import { FundsRepository } from "../db/repositories/funds.repository.js";
import { HoldingsRepository } from "../db/repositories/holdings.repository.js";
import { AnswerGrounding, GroundedCurrency, GroundedPercentage } from "./answer-grounding.js";
import { FinanceServiceError } from "./error-handler.js";
import { ErrorCode } from "../types/error-codes.js";
import { CONSTANTS } from "../config/constants.js";

function stdDev(values: number[], mean: number): number {
  if (values.length <= 1) return 0;
  const sqDiffs = values.map(v => Math.pow(v - mean, 2));
  const avgSqDiff = sqDiffs.reduce((sum, v) => sum + v, 0) / values.length;
  return Math.sqrt(avgSqDiff);
}

export interface NetSpendingResult {
  totalSpend: GroundedCurrency;
  transactionCount: number;
}

export interface FundPeriodReturnResult {
  fundId: string;
  fundName: string;
  startDate: string;
  endDate: string;
  startNav: number;
  endNav: number;
  periodReturn: GroundedPercentage;
}

export interface HoldingPerformanceDetails {
  fundId: string;
  fundName: string;
  units: number;
  purchaseDate: string;
  purchaseNav: number;
  purchaseCost: GroundedCurrency;
  latestNav: number;
  currentValue: GroundedCurrency;
  realizedGain: GroundedCurrency;
  realizedReturnPct: GroundedPercentage;
}

export interface PortfolioPerformanceResult {
  holdings: HoldingPerformanceDetails[];
  totalPurchaseCost: GroundedCurrency;
  totalCurrentValue: GroundedCurrency;
  totalRealizedGain: GroundedCurrency;
  portfolioRealizedReturnPct: GroundedPercentage;
}

export interface SubscriptionDetail {
  merchant: string;
  category: string;
  frequency: "monthly" | "quarterly" | "irregular";
  avgAmount: GroundedCurrency;
  confidenceScore: number;
  occurrences: number;
}

export const FinanceService = {
  async getNetSpending(filter: TransactionFilter): Promise<NetSpendingResult> {
    const txns = await TransactionsRepository.findFiltered(filter);
    
    let sum = 0;
    txns.forEach(t => {
      // In this dataset, negative amounts are refunds, positive amounts are expenses.
      // E.g. Sum(amount) yields net spending.
      sum += t.amount;
    });

    return {
      totalSpend: AnswerGrounding.formatCurrency(sum),
      transactionCount: txns.length
    };
  },

  async getFundPeriodReturn(
    fundIdOrName: string,
    startDate: string,
    endDate: string
  ): Promise<FundPeriodReturnResult> {
    const fund = await FundsRepository.findByIdOrName(fundIdOrName);
    if (!fund) {
      throw new FinanceServiceError(ErrorCode.INVALID_FUND, `Fund "${fundIdOrName}" not found.`);
    }

    const startNavData = await FundsRepository.findNAVWithFallback(fund.id, startDate);
    if (!startNavData) {
      throw new FinanceServiceError(
        ErrorCode.NAV_DATA_UNAVAILABLE,
        `No sufficient NAV data available for start date ${startDate}. Max gap exceeded.`
      );
    }

    const endNavData = await FundsRepository.findNAVWithFallback(fund.id, endDate);
    if (!endNavData) {
      throw new FinanceServiceError(
        ErrorCode.NAV_DATA_UNAVAILABLE,
        `No sufficient NAV data available for end date ${endDate}. Max gap exceeded.`
      );
    }

    const startNav = startNavData.navValue;
    const endNav = endNavData.navValue;
    
    // Period Return % = (end_nav - start_nav) / start_nav * 100
    const periodReturnVal = ((endNav - startNav) / startNav) * 100;
    
    return {
      fundId: fund.id,
      fundName: fund.name,
      startDate: startNavData.navDate,
      endDate: endNavData.navDate,
      startNav,
      endNav,
      periodReturn: AnswerGrounding.formatPercentage(periodReturnVal)
    };
  },

  async getHoldingsPerformance(): Promise<PortfolioPerformanceResult> {
    const portfolioHoldings = await HoldingsRepository.findAll();
    
    let totalPurchaseCostVal = 0;
    let totalCurrentValueVal = 0;

    const holdingsDetails: HoldingPerformanceDetails[] = [];

    for (const h of portfolioHoldings) {
      const latestNavData = await FundsRepository.findLatestNAV(h.fundId);
      if (!latestNavData) {
        throw new FinanceServiceError(
          ErrorCode.NAV_DATA_UNAVAILABLE,
          `No NAV data available for fund ${h.fundId}`
        );
      }

      const latestNav = latestNavData.navValue;
      const purchaseCost = h.units * h.purchaseNav;
      const currentValue = h.units * latestNav;
      const realizedGain = currentValue - purchaseCost;
      const realizedReturnPctVal = purchaseCost > 0 ? (realizedGain / purchaseCost) * 100 : 0;

      totalPurchaseCostVal += purchaseCost;
      totalCurrentValueVal += currentValue;

      holdingsDetails.push({
        fundId: h.fundId,
        fundName: h.fundName,
        units: h.units,
        purchaseDate: h.purchaseDate,
        purchaseNav: h.purchaseNav,
        purchaseCost: AnswerGrounding.formatCurrency(purchaseCost),
        latestNav,
        currentValue: AnswerGrounding.formatCurrency(currentValue),
        realizedGain: AnswerGrounding.formatCurrency(realizedGain),
        realizedReturnPct: AnswerGrounding.formatPercentage(realizedReturnPctVal)
      });
    }

    const totalRealizedGainVal = totalCurrentValueVal - totalPurchaseCostVal;
    const portfolioRealizedReturnPctVal = totalPurchaseCostVal > 0 ? (totalRealizedGainVal / totalPurchaseCostVal) * 100 : 0;

    return {
      holdings: holdingsDetails,
      totalPurchaseCost: AnswerGrounding.formatCurrency(totalPurchaseCostVal),
      totalCurrentValue: AnswerGrounding.formatCurrency(totalCurrentValueVal),
      totalRealizedGain: AnswerGrounding.formatCurrency(totalRealizedGainVal),
      portfolioRealizedReturnPct: AnswerGrounding.formatPercentage(portfolioRealizedReturnPctVal)
    };
  },

  async findFilteredTransactions(
    filter: TransactionFilter,
    options?: { limit?: number; offset?: number; sortBy?: "date" | "amount"; sortOrder?: "asc" | "desc" }
  ) {
    return await TransactionsRepository.findFiltered(filter, options);
  },

  async aggregateSpending(filter: TransactionFilter, groupBy: "category" | "merchant" | "month") {
    return await TransactionsRepository.aggregateSpending(filter, groupBy);
  },

  async detectSubscriptions(): Promise<SubscriptionDetail[]> {
    const allTxns = await TransactionsRepository.findFiltered({ excludeTransfers: true });
    
    // Group transactions by merchantFamily and category
    const groups: Record<string, { txns: typeof allTxns; merchant: string; category: string }> = {};
    for (const t of allTxns) {
      if (t.amount <= 0) continue; // Exclude refunds
      const key = `${t.merchantFamily}::${t.category}`;
      if (!groups[key]) {
        groups[key] = { txns: [], merchant: t.merchantFamily, category: t.category };
      }
      groups[key].txns.push(t);
    }

    const subscriptions: SubscriptionDetail[] = [];

    // Helper function to find recurring streams
    function findRecurringStreams(txns: typeof allTxns): { frequency: "monthly" | "quarterly", stream: typeof allTxns }[] {
      const sorted = [...txns].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const streams: { frequency: "monthly" | "quarterly", lastDate: Date, txns: typeof allTxns }[] = [];
      
      for (const t of sorted) {
        const tDate = new Date(t.date);
        let matchedStream = null;
        
        for (const s of streams) {
          const gap = (tDate.getTime() - s.lastDate.getTime()) / (1000 * 60 * 60 * 24);
          
          // Monthly check (25 to 40 days gap)
          if (gap >= 25 && gap <= 40) {
            if (s.frequency === "monthly" || s.txns.length === 1) {
              s.frequency = "monthly";
              matchedStream = s;
              break;
            }
          }
          // Quarterly check (75 to 105 days gap)
          if (gap >= 75 && gap <= 105) {
            if (s.frequency === "quarterly" || s.txns.length === 1) {
              s.frequency = "quarterly";
              matchedStream = s;
              break;
            }
          }
        }
        
        if (matchedStream) {
          matchedStream.txns.push(t);
          matchedStream.lastDate = tDate;
        } else {
          streams.push({
            frequency: "monthly", // default
            lastDate: tDate,
            txns: [t]
          });
        }
      }
      
      return streams
        .filter(s => s.txns.length >= 3)
        .map(s => ({
          frequency: s.frequency,
          stream: s.txns
        }));
    }

    for (const key of Object.keys(groups)) {
      const { txns, merchant, category } = groups[key];
      const streams = findRecurringStreams(txns);
      if (streams.length === 0) {
        continue;
      }

      // Check if this merchant/category is actually a subscription/utility/rent
      const isSubPattern = streams.some(s => {
        const hasSubCategory = ["subscription", "rent", "utilities"].includes(category.toLowerCase());
        const hasSubKeywords = s.stream.some(t => {
          const m = (t.memo || "").toLowerCase();
          return m.includes("subscription") || m.includes("membership") || m.includes("premium") || 
                 m.includes("workspace") || m.includes("internet") || m.includes("bill") || 
                 m.includes("power") || m.includes("electricity") || m.includes("rent");
        });
        return hasSubCategory || hasSubKeywords;
      });

      if (!isSubPattern) {
        continue;
      }

      // Report a subscription for this merchant family & category
      // Combine all transactions from matching streams
      const allSubTxns = streams.flatMap(s => s.stream);
      const amounts = allSubTxns.map(t => t.amount);
      const avgAmountVal = amounts.reduce((sum, v) => sum + v, 0) / amounts.length;
      
      const hasMonthly = streams.some(s => s.frequency === "monthly");
      const frequency = hasMonthly ? "monthly" : "quarterly";

      // Calculate confidence score (higher if there are more occurrences and low amount variance)
      const uniqueAmounts = new Set(amounts);
      const amountVarianceConfidence = uniqueAmounts.size === 1 ? 99 : 85;

      subscriptions.push({
        merchant,
        category,
        frequency,
        avgAmount: AnswerGrounding.formatCurrency(avgAmountVal),
        confidenceScore: amountVarianceConfidence,
        occurrences: allSubTxns.length
      });
    }

    // Sort by occurrences descending, then by merchant name
    return subscriptions.sort((a, b) => b.occurrences - a.occurrences || a.merchant.localeCompare(b.merchant));
  }
};
