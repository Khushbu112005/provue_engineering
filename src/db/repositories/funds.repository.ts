import { db } from "../../config/database.js";
import { funds, fundNavs, Fund, FundNav } from "../schema.js";
import { RequestContext } from "../../context/request-context.js";
import { eq, and, sql, desc, asc } from "drizzle-orm";
import { CONSTANTS } from "../../config/constants.js";

export interface FundNAVResult {
  navValue: number;
  navDate: string;
  gapDays: number;
}

export const FundsRepository = {
  async findAll(): Promise<Fund[]> {
    RequestContext.logTableRead("funds");
    const startTime = Date.now();
    try {
      return await db.select().from(funds);
    } finally {
      RequestContext.addDatabaseQueryTime(Date.now() - startTime);
    }
  },

  async findByIdOrName(idOrName: string): Promise<Fund | null> {
    RequestContext.logTableRead("funds");
    const startTime = Date.now();
    try {
      const matchUpper = idOrName.toUpperCase();
      const res = await db
        .select()
        .from(funds)
        .where(
          sql`(${funds.id} = ${idOrName} OR UPPER(${funds.name}) = ${matchUpper} OR UPPER(${funds.name}) LIKE ${"%" + matchUpper + "%"})`
        )
        .limit(1);
      return res[0] || null;
    } finally {
      RequestContext.addDatabaseQueryTime(Date.now() - startTime);
    }
  },

  async findNAVOnDate(fundId: string, targetDate: string): Promise<FundNav | null> {
    RequestContext.logTableRead("fund_navs");
    const startTime = Date.now();
    try {
      const res = await db
        .select()
        .from(fundNavs)
        .where(and(eq(fundNavs.fundId, fundId), eq(fundNavs.navDate, targetDate)))
        .limit(1);
      return res[0] || null;
    } finally {
      RequestContext.addDatabaseQueryTime(Date.now() - startTime);
    }
  },

  async findClosestPreviousNAV(fundId: string, targetDate: string): Promise<FundNav | null> {
    RequestContext.logTableRead("fund_navs");
    const startTime = Date.now();
    try {
      const res = await db
        .select()
        .from(fundNavs)
        .where(and(eq(fundNavs.fundId, fundId), sql`${fundNavs.navDate} <= ${targetDate}`))
        .orderBy(desc(fundNavs.navDate))
        .limit(1);
      return res[0] || null;
    } finally {
      RequestContext.addDatabaseQueryTime(Date.now() - startTime);
    }
  },

  async findClosestNextNAV(fundId: string, targetDate: string): Promise<FundNav | null> {
    RequestContext.logTableRead("fund_navs");
    const startTime = Date.now();
    try {
      const res = await db
        .select()
        .from(fundNavs)
        .where(and(eq(fundNavs.fundId, fundId), sql`${fundNavs.navDate} >= ${targetDate}`))
        .orderBy(asc(fundNavs.navDate))
        .limit(1);
      return res[0] || null;
    } finally {
      RequestContext.addDatabaseQueryTime(Date.now() - startTime);
    }
  },

  async findNAVWithFallback(fundId: string, targetDate: string): Promise<FundNAVResult | null> {
    // 1. Exact match
    const exact = await this.findNAVOnDate(fundId, targetDate);
    if (exact) {
      return {
        navValue: exact.navValue,
        navDate: exact.navDate,
        gapDays: 0
      };
    }

    // 2. Closest previous date
    const prev = await this.findClosestPreviousNAV(fundId, targetDate);
    if (prev) {
      const gapDays = Math.abs(
        (new Date(prev.navDate).getTime() - new Date(targetDate).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (gapDays <= CONSTANTS.MAX_NAV_GAP_DAYS) {
        return {
          navValue: prev.navValue,
          navDate: prev.navDate,
          gapDays
        };
      }
    }

    // 3. Closest next date
    const next = await this.findClosestNextNAV(fundId, targetDate);
    if (next) {
      const gapDays = Math.abs(
        (new Date(next.navDate).getTime() - new Date(targetDate).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (gapDays <= CONSTANTS.MAX_NAV_GAP_DAYS) {
        return {
          navValue: next.navValue,
          navDate: next.navDate,
          gapDays
        };
      }
    }

    return null;
  },

  async findLatestNAV(fundId: string): Promise<FundNav | null> {
    RequestContext.logTableRead("fund_navs");
    const startTime = Date.now();
    try {
      const res = await db
        .select()
        .from(fundNavs)
        .where(eq(fundNavs.fundId, fundId))
        .orderBy(desc(fundNavs.navDate))
        .limit(1);
      return res[0] || null;
    } finally {
      RequestContext.addDatabaseQueryTime(Date.now() - startTime);
    }
  }
};
