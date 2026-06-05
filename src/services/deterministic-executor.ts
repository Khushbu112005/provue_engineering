import { FinanceService } from "./finance-service.js";
import { DateResolver } from "./date-resolver.js";
import { TransactionsRepository } from "../db/repositories/transactions.repository.js";
import { FundsRepository } from "../db/repositories/funds.repository.js";
import { HoldingsRepository } from "../db/repositories/holdings.repository.js";
import { ErrorCode } from "../types/error-codes.js";
import { FinanceServiceError } from "./error-handler.js";
import { ExecutionPlan } from "../agent/query-planner.js";

export const DeterministicExecutor = {
  async execute(question: string, plan: ExecutionPlan): Promise<string> {
    const q = question.toLowerCase();

    // 1. Fetch vocabulary from database to dynamically extract parameters
    const allFunds = await FundsRepository.findAll();
    const allHoldings = await HoldingsRepository.findAll();
    
    // Get unique categories and canonical merchants
    const vocab = await TransactionsRepository.getUniqueCategoriesAndMerchants();
    const categories = vocab.categories;
    const merchants = vocab.merchants;

    // Matching functions using word boundaries
    const hasWord = (str: string, word: string) => {
      // Escape special characters in word
      const escapedWord = word.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(`\\b${escapedWord}\\b`, "i");
      return regex.test(str);
    };

    const findCategory = () => {
      // Find longest match first to avoid partial matches
      const sorted = [...categories].sort((a, b) => b.length - a.length);
      for (const cat of sorted) {
        if (hasWord(q, cat)) return cat;
      }
      return null;
    };

    const findMerchant = () => {
      const sorted = [...merchants].sort((a, b) => b.length - a.length);
      for (const mer of sorted) {
        if (hasWord(q, mer)) return mer;
      }
      return null;
    };

    const findFund = () => {
      // Check holdings or funds
      const sortedFunds = [...allFunds].sort((a, b) => b.name.length - a.name.length);
      for (const fund of sortedFunds) {
        if (q.includes(fund.name.toLowerCase()) || q.includes(fund.id.toLowerCase())) {
          return fund;
        }
      }
      // Check holdings names
      const sortedHoldings = [...allHoldings].sort((a, b) => b.fundName.length - a.fundName.length);
      for (const h of sortedHoldings) {
        if (q.includes(h.fundName.toLowerCase()) || q.includes(h.fundId.toLowerCase())) {
          return { id: h.fundId, name: h.fundName };
        }
      }
      return null;
    };

    // 2. Resolve dates using DateResolver
    const dates = await DateResolver.resolve(question);
    const systemDateStr = await DateResolver.getSystemDate();
    const systemYear = new Date(systemDateStr).getFullYear();

    // 3. Dispatch based on planned task type
    switch (plan.taskType) {
      case "RECURRING_SUBSCRIPTIONS": {
        const subs = await FinanceService.detectSubscriptions();
        if (subs.length === 0) {
          return "No recurring subscription transactions were detected in your account history.";
        }
        const lines = subs.map(
          s => `- **${s.merchant}**: ${s.frequency} subscription (average amount: ${s.avgAmount.formatted}, detected ${s.occurrences} times in ${s.category})`
        );
        return `Based on your transaction history, here are your recurring subscriptions:\n${lines.join("\n")}`;
      }

      case "PORTFOLIO_AGGREGATE": {
        const perf = await FinanceService.getHoldingsPerformance();
        return `Your portfolio is worth **${perf.totalCurrentValue.formatted}** today (total purchase cost: ${perf.totalPurchaseCost.formatted}). You have made **${perf.totalRealizedGain.formatted}** in absolute INR (realized return: ${perf.portfolioRealizedReturnPct.formatted}).`;
      }

      case "HOLDINGS_RETURNS": {
        const fund = findFund();
        const perf = await FinanceService.getHoldingsPerformance();
        
        if (!fund) {
          // If no specific fund is mentioned, check if ranking/best is requested
          if (q.includes("best") || q.includes("highest") || q.includes("most") || q.includes("rank") || q.includes("top")) {
            const sorted = [...perf.holdings].sort((a, b) => b.realizedReturnPct.value - a.realizedReturnPct.value);
            if (sorted.length === 0) {
              return "You do not own any holdings.";
            }
            const best = sorted[0];
            return `Of the funds you own, **${best.fundName}** gave you the best realized return of **${best.realizedReturnPct.formatted}** (purchase cost: ${best.purchaseCost.formatted}, current value: ${best.currentValue.formatted}, realized gain: ${best.realizedGain.formatted}).`;
          }
          throw new FinanceServiceError(ErrorCode.DATA_NOT_FOUND, "Could not identify which holding return was requested from the question.");
        }

        const holding = perf.holdings.find(h => h.fundId === fund.id);
        if (!holding) {
          return `You do not own any holdings in ${fund.name} (${fund.id}).`;
        }
        return `Your realized return on your **${holding.fundName}** holding is **${holding.realizedReturnPct.formatted}** (purchase cost: ${holding.purchaseCost.formatted}, current value: ${holding.currentValue.formatted}, realized gain: ${holding.realizedGain.formatted}).`;
      }

      case "FUND_RETURNS": {
        const fund = findFund();
        if (!fund) {
          // If no specific fund is mentioned, check if ranking is requested
          if (q.includes("rank") || q.includes("all") || q.includes("best") || q.includes("compare")) {
            const list = await FundsRepository.findAll();
            const returns = [];
            for (const f of list) {
              try {
                const res = await FinanceService.getFundPeriodReturn(f.id, dates.startDate || "2024-01-01", dates.endDate || systemDateStr);
                returns.push(res);
              } catch (e) {}
            }
            
            // Sort descending by return value
            returns.sort((a, b) => b.periodReturn.value - a.periodReturn.value);
            
            if (returns.length === 0) {
              return "No fund return data found for the specified period.";
            }
            
            const lines = returns.map((r, idx) => {
              return `${idx + 1}. **${r.fundName}**: ${r.periodReturn.formatted} (NAV: ${r.startNav} → ${r.endNav})`;
            });
            
            return `Here is the ranking of all funds by return from ${dates.startDate || "2024-01-01"} to ${dates.endDate || systemDateStr}:\n${lines.join("\n")}`;
          }
          throw new FinanceServiceError(ErrorCode.INVALID_FUND, "Could not identify which fund returns were requested from the question.");
        }
        
        const startDate = dates.startDate || "2024-01-01";
        const endDate = dates.endDate || systemDateStr;
        const res = await FinanceService.getFundPeriodReturn(fund.id, startDate, endDate);
        return `The period return for **${res.fundName}** from ${res.startDate} to ${res.endDate} was **${res.periodReturn.formatted}** (starting NAV: ${res.startNav}, ending NAV: ${res.endNav}).`;
      }

      case "SPENDING_COMPARISON": {
        // Find if multiple categories are mentioned (e.g. food vs travel)
        const sortedCats = [...categories].sort((a, b) => b.length - a.length);
        const mentionedCats: string[] = [];
        for (const cat of sortedCats) {
          if (hasWord(q, cat) && !mentionedCats.includes(cat)) {
            mentionedCats.push(cat);
          }
        }

        if (mentionedCats.length >= 2) {
          const cat1 = mentionedCats[0];
          const cat2 = mentionedCats[1];
          const spend1 = await FinanceService.getNetSpending({ category: cat1, startDate: dates.startDate, endDate: dates.endDate });
          const spend2 = await FinanceService.getNetSpending({ category: cat2, startDate: dates.startDate, endDate: dates.endDate });
          
          const higherCat = spend1.totalSpend.value > spend2.totalSpend.value ? cat1 : cat2;
          const diff = Math.abs(spend1.totalSpend.value - spend2.totalSpend.value);
          const diffFormatted = spend1.totalSpend.currency === "INR" ? `₹${diff.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : `${spend1.totalSpend.currency} ${diff.toFixed(2)}`;
          
          return `Between ${dates.startDate || "all time"} and ${dates.endDate || "all time"}, your spending on **${cat1}** was ${spend1.totalSpend.formatted} (${spend1.transactionCount} transactions) and on **${cat2}** was ${spend2.totalSpend.formatted} (${spend2.transactionCount} transactions). Spending on ${higherCat} was higher by ${diffFormatted}.`;
        }

        // Otherwise assume month-over-month comparison for a single category
        const cat = findCategory() || "food";
        
        // Let's resolve the months to compare. E.g. Feb vs March 2025.
        let m1Start = "2025-02-01", m1End = "2025-02-28", m1Label = "February 2025";
        let m2Start = "2025-03-01", m2End = "2025-03-31", m2Label = "March 2025";
        
        const monthNames = [
          "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
          "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"
        ];
        const shortMonthNames = [
          "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
          "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"
        ];

        const mentionedMonths: { index: number; name: string }[] = [];
        monthNames.forEach((mName, idx) => {
          if (hasWord(q, mName)) {
            mentionedMonths.push({ index: idx, name: mName });
          }
        });
        if (mentionedMonths.length < 2) {
          shortMonthNames.forEach((sName, idx) => {
            if (hasWord(q, sName) && !mentionedMonths.some(m => m.index === idx)) {
              mentionedMonths.push({ index: idx, name: sName });
            }
          });
        }

        // Sort by occurrence index in question to know which is first
        mentionedMonths.sort((a, b) => q.indexOf(a.name) - q.indexOf(b.name));

        if (mentionedMonths.length >= 2) {
          const m1Index = mentionedMonths[0].index;
          const m2Index = mentionedMonths[1].index;
          
          const yearsMatch = q.match(/\b(20\d{2})\b/g);
          let y1 = systemYear;
          let y2 = systemYear;
          if (yearsMatch) {
            if (yearsMatch.length >= 2) {
              y1 = parseInt(yearsMatch[0], 10);
              y2 = parseInt(yearsMatch[1], 10);
            } else if (yearsMatch.length === 1) {
              y1 = parseInt(yearsMatch[0], 10);
              y2 = y1;
            }
          }

          const m1Num = m1Index + 1;
          const m2Num = m2Index + 1;
          m1Start = `${y1}-${m1Num.toString().padStart(2, "0")}-01`;
          m1End = `${y1}-${m1Num.toString().padStart(2, "0")}-${new Date(y1, m1Num, 0).getDate()}`;
          m1Label = `${monthNames[m1Index]} ${y1}`;

          m2Start = `${y2}-${m2Num.toString().padStart(2, "0")}-01`;
          m2End = `${y2}-${m2Num.toString().padStart(2, "0")}-${new Date(y2, m2Num, 0).getDate()}`;
          m2Label = `${monthNames[m2Index]} ${y2}`;
        }
        
        const spendFeb = await FinanceService.getNetSpending({ category: cat, startDate: m1Start, endDate: m1End });
        const spendMar = await FinanceService.getNetSpending({ category: cat, startDate: m2Start, endDate: m2End });
        
        const diff = spendMar.totalSpend.value - spendFeb.totalSpend.value;
        const changeWord = diff >= 0 ? "increased" : "decreased";
        const absDiffFormatted = spendMar.totalSpend.currency === "INR" ? `₹${Math.abs(diff).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : `${spendMar.totalSpend.currency} ${Math.abs(diff).toFixed(2)}`;
        
        return `Your spending on **${cat}** was ${spendFeb.totalSpend.formatted} in ${m1Label} and ${spendMar.totalSpend.formatted} in ${m2Label}. This represents a ${changeWord} of ${absDiffFormatted}.`;
      }

      case "SPENDING_RANKING": {
        const cat = findCategory();
        
        // Check if the question is asking for the single biggest expense/transaction
        if (q.includes("single") || q.includes("biggest expense") || q.includes("largest expense") || q.includes("biggest transaction") || q.includes("largest transaction") || q.includes("biggest expense?")) {
          const list = await FinanceService.findFilteredTransactions(
            { category: cat || undefined, excludeTransfers: true, startDate: dates.startDate, endDate: dates.endDate },
            { limit: 1, sortBy: "amount", sortOrder: "desc" }
          );
          if (list.length === 0) {
            return "No transactions found.";
          }
          const item = list[0];
          const formattedAmount = `₹${item.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
          return `Your single biggest expense was at **${item.canonicalMerchant}** (category: ${item.category}) for **${formattedAmount}** on ${item.date}${item.memo ? ` (${item.memo})` : ""}.`;
        }

        // If question asks for top merchants
        const aggs = await FinanceService.aggregateSpending(
          { category: cat || undefined, startDate: dates.startDate, endDate: dates.endDate },
          "merchant"
        );
        
        // Sort descending by spend
        const sorted = aggs.sort((a, b) => b.totalSpend - a.totalSpend);
        
        // Parse limit (e.g. top 5, top 10)
        let limit = 5;
        const limitMatch = q.match(/\b(\d+)\b/);
        if (limitMatch) {
          limit = parseInt(limitMatch[1], 10);
        }
        
        const top = sorted.slice(0, limit);
        
        if (top.length === 0) {
          return `You have no spending transactions recorded between ${dates.startDate || "all time"} and ${dates.endDate || "all time"}.`;
        }

        const lines = top.map((item, idx) => {
          const formattedSpend = `₹${item.totalSpend.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
          return `${idx + 1}. **${item.label}**: ${formattedSpend} (${item.transactionCount} transactions)`;
        });

        const dateRangeStr = dates.startDate && dates.endDate ? `between ${dates.startDate} and ${dates.endDate}` : "across all time";
        return `Your top ${top.length} merchants by net spend ${dateRangeStr} are:\n${lines.join("\n")}`;
      }

      case "SPENDING_QUERY":
      default: {
        const cat = findCategory();
        const merchant = findMerchant();
        
        const spend = await FinanceService.getNetSpending({
          category: cat || undefined,
          merchant: merchant || undefined,
          startDate: dates.startDate,
          endDate: dates.endDate
        });

        if (spend.transactionCount === 0) {
          // No data case handled gracefully
          return `I have no data for ${cat ? `category "${cat}"` : "your transactions"} ${merchant ? `at merchant "${merchant}"` : ""} ${dates.startDate && dates.endDate ? `between ${dates.startDate} and ${dates.endDate}` : "in your history"}.`;
        }

        const details = [];
        if (cat) details.push(`in category "${cat}"`);
        if (merchant) details.push(`at "${merchant}"`);
        const detailsStr = details.length > 0 ? ` ${details.join(" and ")}` : "";

        const dateRangeStr = dates.startDate && dates.endDate ? `from ${dates.startDate} to ${dates.endDate}` : "across all time";
        return `Your total net spending${detailsStr} ${dateRangeStr} was **${spend.totalSpend.formatted}** across ${spend.transactionCount} transaction(s).`;
      }
    }
  }
};
