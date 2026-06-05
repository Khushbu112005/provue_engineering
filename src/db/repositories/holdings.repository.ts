import { db } from "../../config/database.js";
import { holdings, funds, Holding } from "../schema.js";
import { RequestContext } from "../../context/request-context.js";
import { eq } from "drizzle-orm";

export interface HoldingWithFund {
  id: number;
  fundId: string;
  fundName: string;
  fundCategory: string;
  units: number;
  purchaseDate: string;
  purchaseNav: number;
}

export const HoldingsRepository = {
  async findAll(): Promise<HoldingWithFund[]> {
    RequestContext.logTableRead("holdings");
    RequestContext.logTableRead("funds");
    const startTime = Date.now();

    try {
      const results = await db
        .select({
          id: holdings.id,
          fundId: holdings.fundId,
          fundName: funds.name,
          fundCategory: funds.category,
          units: holdings.units,
          purchaseDate: holdings.purchaseDate,
          purchaseNav: holdings.purchaseNav
        })
        .from(holdings)
        .innerJoin(funds, eq(holdings.fundId, funds.id));

      return results;
    } finally {
      RequestContext.addDatabaseQueryTime(Date.now() - startTime);
    }
  }
};
