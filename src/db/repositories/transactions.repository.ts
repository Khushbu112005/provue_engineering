import { db } from "../../config/database.js";
import { transactions, Transaction } from "../schema.js";
import { RequestContext } from "../../context/request-context.js";
import { and, eq, gte, lte, ne, desc, asc, sql } from "drizzle-orm";

export interface TransactionFilter {
  category?: string;
  merchant?: string; // matches raw, normalized, family, or canonical merchant
  startDate?: string;
  endDate?: string;
  excludeTransfers?: boolean;
}

export interface SpendingAggregate {
  label: string; // category, merchant, or month
  totalSpend: number;
  transactionCount: number;
}

export const TransactionsRepository = {
  async findFiltered(filter: TransactionFilter, options: { limit?: number; offset?: number; sortBy?: 'date' | 'amount'; sortOrder?: 'asc' | 'desc' } = {}): Promise<Transaction[]> {
    RequestContext.logTableRead("transactions");
    const startTime = Date.now();

    try {
      const conditions = [];

      if (filter.category) {
        conditions.push(eq(transactions.category, filter.category));
      }

      if (filter.merchant) {
        const merchantUpper = filter.merchant.toUpperCase();
        conditions.push(
          sql`(${transactions.merchant} = ${filter.merchant} OR 
                ${transactions.normalizedMerchant} = ${merchantUpper} OR 
                ${transactions.merchantFamily} = ${merchantUpper} OR 
                ${transactions.canonicalMerchant} = ${merchantUpper})`
        );
      }

      if (filter.startDate) {
        conditions.push(gte(transactions.date, filter.startDate));
      }

      if (filter.endDate) {
        conditions.push(lte(transactions.date, filter.endDate));
      }

      if (filter.excludeTransfers !== false) {
        conditions.push(ne(transactions.category, "transfer"));
      }

      let query = db.select().from(transactions).where(and(...conditions));

      const sortCol = options.sortBy === "amount" ? transactions.amount : transactions.date;
      const orderFn = options.sortOrder === "desc" ? desc : asc;
      query = query.orderBy(orderFn(sortCol)) as any;

      if (options.limit) {
        query = query.limit(options.limit) as any;
      }
      if (options.offset) {
        query = query.offset(options.offset) as any;
      }

      const results = await query;
      return results;
    } finally {
      RequestContext.addDatabaseQueryTime(Date.now() - startTime);
    }
  },

  async aggregateSpending(
    filter: TransactionFilter,
    groupBy: "category" | "merchant" | "month"
  ): Promise<SpendingAggregate[]> {
    RequestContext.logTableRead("transactions");
    const startTime = Date.now();

    try {
      const conditions = [];

      if (filter.category) {
        conditions.push(eq(transactions.category, filter.category));
      }

      if (filter.merchant) {
        const merchantUpper = filter.merchant.toUpperCase();
        conditions.push(
          sql`(${transactions.merchant} = ${filter.merchant} OR 
                ${transactions.normalizedMerchant} = ${merchantUpper} OR 
                ${transactions.merchantFamily} = ${merchantUpper} OR 
                ${transactions.canonicalMerchant} = ${merchantUpper})`
        );
      }

      if (filter.startDate) {
        conditions.push(gte(transactions.date, filter.startDate));
      }

      if (filter.endDate) {
        conditions.push(lte(transactions.date, filter.endDate));
      }

      if (filter.excludeTransfers !== false) {
        conditions.push(ne(transactions.category, "transfer"));
      }

      let groupByField;
      if (groupBy === "category") {
        groupByField = transactions.category;
      } else if (groupBy === "merchant") {
        groupByField = transactions.canonicalMerchant;
      } else {
        // group by month (YYYY-MM)
        groupByField = sql`to_char(${transactions.date}, 'YYYY-MM')`;
      }

      const results = await db
        .select({
          label: groupByField,
          totalSpend: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
          transactionCount: sql<number>`COUNT(*)::int`
        })
        .from(transactions)
        .where(and(...conditions))
        .groupBy(groupByField)
        .orderBy(groupByField);

      return results.map((r) => ({
        label: r.label as string,
        totalSpend: Number(r.totalSpend),
        transactionCount: r.transactionCount
      }));
    } finally {
      RequestContext.addDatabaseQueryTime(Date.now() - startTime);
    }
  },

  async getUniqueCategoriesAndMerchants(): Promise<{ categories: string[]; merchants: string[] }> {
    RequestContext.logTableRead("transactions");
    const startTime = Date.now();
    try {
      const catsQuery = db.selectDistinct({ category: transactions.category }).from(transactions);
      const mersQuery = db.selectDistinct({ merchant: transactions.canonicalMerchant }).from(transactions);
      
      const [cats, mers] = await Promise.all([catsQuery, mersQuery]);
      return {
        categories: cats.map(c => c.category.toLowerCase()).filter(Boolean),
        merchants: mers.map(m => m.merchant.toLowerCase()).filter(Boolean)
      };
    } finally {
      RequestContext.addDatabaseQueryTime(Date.now() - startTime);
    }
  },

  async findLatestTransactionDate(): Promise<string | null> {
    RequestContext.logTableRead("transactions");
    const startTime = Date.now();

    try {
      const res = await db
        .select({ maxDate: sql<string>`MAX(${transactions.date})` })
        .from(transactions);
      return res[0]?.maxDate || null;
    } finally {
      RequestContext.addDatabaseQueryTime(Date.now() - startTime);
    }
  }
};
