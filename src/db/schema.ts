import { pgTable, text, doublePrecision, date, serial } from "drizzle-orm/pg-core";

export const funds = pgTable("funds", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull()
});

export const fundNavs = pgTable("fund_navs", {
  id: serial("id").primaryKey(),
  fundId: text("fund_id").notNull().references(() => funds.id),
  navDate: date("nav_date").notNull(),
  navValue: doublePrecision("nav_value").notNull()
});

export const holdings = pgTable("holdings", {
  id: serial("id").primaryKey(),
  fundId: text("fund_id").notNull().references(() => funds.id),
  units: doublePrecision("units").notNull(),
  purchaseDate: date("purchase_date").notNull(),
  purchaseNav: doublePrecision("purchase_nav").notNull()
});

export const transactions = pgTable("transactions", {
  id: text("id").primaryKey(),
  date: date("date").notNull(),
  merchant: text("merchant").notNull(),
  normalizedMerchant: text("normalized_merchant").notNull(),
  merchantFamily: text("merchant_family").notNull(),
  canonicalMerchant: text("canonical_merchant").notNull(),
  category: text("category").notNull(),
  amount: doublePrecision("amount").notNull(),
  currency: text("currency").notNull(),
  memo: text("memo").notNull()
});
export type Transaction = typeof transactions.$inferSelect;
export type Fund = typeof funds.$inferSelect;
export type FundNav = typeof fundNavs.$inferSelect;
export type Holding = typeof holdings.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type NewFund = typeof funds.$inferInsert;
export type NewFundNav = typeof fundNavs.$inferInsert;
export type NewHolding = typeof holdings.$inferInsert;
