import { TransactionsRepository } from "../db/repositories/transactions.repository.js";
import { env } from "../config/env.js";
import { CONSTANTS } from "../config/constants.js";

export interface ResolvedDateRange {
  startDate?: string;
  endDate?: string;
}

export const DateResolver = {
  async getSystemDate(): Promise<string> {
    if (env.SYSTEM_DATE) {
      return env.SYSTEM_DATE;
    }
    
    try {
      const dbMaxDate = await TransactionsRepository.findLatestTransactionDate();
      if (dbMaxDate) {
        return dbMaxDate;
      }
    } catch (e) {
      // In case DB is not yet populated
    }

    return CONSTANTS.DEFAULT_SYSTEM_DATE;
  },

  async resolve(expression: string): Promise<ResolvedDateRange> {
    const systemDateStr = await this.getSystemDate();
    const systemDate = new Date(systemDateStr);
    const systemYear = systemDate.getFullYear();
    const systemMonth = systemDate.getMonth(); // 0-indexed

    const cleanExpr = expression.toUpperCase().trim();

    // 1. Explicit date ranges (e.g. 2024-01-01 to 2025-01-01)
    const dateRangeRegex = /(\d{4}-\d{2}-\d{2})\s*(?:TO|AND|-)?\s*(\d{4}-\d{2}-\d{2})/;
    const rangeMatch = cleanExpr.match(dateRangeRegex);
    if (rangeMatch) {
      return {
        startDate: rangeMatch[1],
        endDate: rangeMatch[2]
      };
    }

    // 2. Year to Date (YTD)
    if (cleanExpr.includes("YEAR TO DATE") || cleanExpr.includes("YTD")) {
      const startDate = `${systemYear}-01-01`;
      return { startDate, endDate: systemDateStr };
    }

    // 3. This Quarter
    if (cleanExpr.includes("THIS QUARTER")) {
      const currentQuarter = Math.floor(systemMonth / 3);
      const startMonth = currentQuarter * 3 + 1;
      const startMonthStr = startMonth.toString().padStart(2, "0");
      const startDate = `${systemYear}-${startMonthStr}-01`;
      return { startDate, endDate: systemDateStr };
    }

    // 4. Last Quarter
    if (cleanExpr.includes("LAST QUARTER")) {
      const currentQuarter = Math.floor(systemMonth / 3);
      let targetQuarter = currentQuarter - 1;
      let targetYear = systemYear;
      
      if (targetQuarter < 0) {
        targetQuarter = 3; // Q4 of prev year
        targetYear -= 1;
      }
      
      const startMonth = targetQuarter * 3 + 1;
      const endMonth = targetQuarter * 3 + 3;
      const startMonthStr = startMonth.toString().padStart(2, "0");
      const endMonthStr = endMonth.toString().padStart(2, "0");
      const lastDay = this.daysInMonth(targetYear, endMonth);
      
      return {
        startDate: `${targetYear}-${startMonthStr}-01`,
        endDate: `${targetYear}-${endMonthStr}-${lastDay}`
      };
    }

    // 5. Last Month
    if (cleanExpr.includes("LAST MONTH")) {
      let targetMonth = systemMonth - 1;
      let targetYear = systemYear;
      
      if (targetMonth < 0) {
        targetMonth = 11;
        targetYear -= 1;
      }
      
      const targetMonthOneIndexed = targetMonth + 1;
      const monthStr = targetMonthOneIndexed.toString().padStart(2, "0");
      const lastDay = this.daysInMonth(targetYear, targetMonthOneIndexed);
      
      return {
        startDate: `${targetYear}-${monthStr}-01`,
        endDate: `${targetYear}-${monthStr}-${lastDay}`
      };
    }

    // 6. Specific Quarters (e.g. Q1 2025, Q1 25, Q3 2024)
    const quarterRegex = /\b(Q[1-4])\s+(\d{2,4})\b/;
    const quarterMatch = cleanExpr.match(quarterRegex);
    if (quarterMatch) {
      const q = quarterMatch[1];
      let year = parseInt(quarterMatch[2], 10);
      if (year < 100) {
        year += 2000; // 24 -> 2024
      }
      
      const qNum = parseInt(q.substring(1), 10); // 1, 2, 3, 4
      const startMonth = (qNum - 1) * 3 + 1;
      const endMonth = (qNum - 1) * 3 + 3;
      const startMonthStr = startMonth.toString().padStart(2, "0");
      const endMonthStr = endMonth.toString().padStart(2, "0");
      const lastDay = this.daysInMonth(year, endMonth);
      
      return {
        startDate: `${year}-${startMonthStr}-01`,
        endDate: `${year}-${endMonthStr}-${lastDay}`
      };
    }

    // 7. Specific Months with Year (e.g. March 2025, Mar 25, March of 2024)
    const monthNames = [
      "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
      "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"
    ];
    const shortMonthNames = [
      "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
      "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"
    ];

    const monthWithYearRegex = /\b(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER|JAN|FEB|MAR|APR|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(?:OF\s+)?(\d{2,4})\b/;
    const monthYearMatch = cleanExpr.match(monthWithYearRegex);
    if (monthYearMatch) {
      const monthStr = monthYearMatch[1];
      let monthIndex = monthNames.indexOf(monthStr);
      if (monthIndex === -1) {
        monthIndex = shortMonthNames.indexOf(monthStr);
      }
      
      if (monthIndex !== -1) {
        let year = parseInt(monthYearMatch[2], 10);
        if (year < 100) {
          year += 2000;
        }
        const monthOneIndexed = monthIndex + 1;
        const monthStrFormatted = monthOneIndexed.toString().padStart(2, "0");
        const lastDay = this.daysInMonth(year, monthOneIndexed);
        
        return {
          startDate: `${year}-${monthStrFormatted}-01`,
          endDate: `${year}-${monthStrFormatted}-${lastDay}`
        };
      }
    }

    // 8. Specific Month name alone (e.g. "in March", default to system year)
    const monthAloneRegex = /\b(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER|JAN|FEB|MAR|APR|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/;
    const monthAloneMatch = cleanExpr.match(monthAloneRegex);
    if (monthAloneMatch) {
      const monthStr = monthAloneMatch[1];
      let monthIndex = monthNames.indexOf(monthStr);
      if (monthIndex === -1) {
        monthIndex = shortMonthNames.indexOf(monthStr);
      }
      
      if (monthIndex !== -1) {
        const monthOneIndexed = monthIndex + 1;
        const monthStrFormatted = monthOneIndexed.toString().padStart(2, "0");
        const lastDay = this.daysInMonth(systemYear, monthOneIndexed);
        
        return {
          startDate: `${systemYear}-${monthStrFormatted}-01`,
          endDate: `${systemYear}-${monthStrFormatted}-${lastDay}`
        };
      }
    }

    // 9. Specific Year alone (e.g. 2024, 2025)
    const yearOnlyRegex = /\b(20\d{2})\b/;
    const yearOnlyMatch = cleanExpr.match(yearOnlyRegex);
    if (yearOnlyMatch) {
      const year = parseInt(yearOnlyMatch[1], 10);
      return {
        startDate: `${year}-01-01`,
        endDate: `${year}-12-31`
      };
    }

    // Return empty range if no date specifications are found (so caller retrieves all data)
    return {};
  },

  daysInMonth(year: number, month: number): number {
    return new Date(year, month, 0).getDate();
  }
};
