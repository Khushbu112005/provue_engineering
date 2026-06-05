import { z } from "zod";

// Zod schemas for validation
export const TransactionInputSchema = z.object({
  id: z.string().min(1, "Transaction ID cannot be empty"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format, must be YYYY-MM-DD"),
  merchant: z.string().min(1, "Merchant cannot be empty"),
  category: z.string().min(1, "Category cannot be empty"),
  amount: z.number({ required_error: "Amount must be a number" }),
  currency: z.string().length(3, "Currency must be a 3-letter code"),
  memo: z.string().default("")
});

export const NAVInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format, must be YYYY-MM-DD"),
  value: z.number({ required_error: "NAV value must be a number" }).positive("NAV value must be positive")
});

export const FundInputSchema = z.object({
  id: z.string().min(1, "Fund ID cannot be empty"),
  name: z.string().min(1, "Fund name cannot be empty"),
  category: z.string().min(1, "Category cannot be empty"),
  nav: z.array(NAVInputSchema).min(1, "Fund must have at least one NAV record")
});

export const HoldingInputSchema = z.object({
  fund_id: z.string().min(1, "Fund ID cannot be empty"),
  fund_name: z.string().min(1, "Fund name cannot be empty"),
  units: z.number({ required_error: "Units must be a number" }).nonnegative("Units cannot be negative"),
  purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format, must be YYYY-MM-DD"),
  purchase_nav: z.number({ required_error: "Purchase NAV must be a number" }).positive("Purchase NAV must be positive")
});

export interface IngestionValidationResult {
  isValid: boolean;
  warnings: string[];
  errors: string[];
}

export function validateIngestionData(
  rawTxns: any[],
  rawFunds: any[],
  rawHoldings: any[]
): IngestionValidationResult {
  const result: IngestionValidationResult = {
    isValid: true,
    warnings: [],
    errors: []
  };

  const transactionIds = new Set<string>();
  const fundIds = new Set<string>();

  // 1. Validate Funds
  if (!Array.isArray(rawFunds) || rawFunds.length === 0) {
    result.errors.push("Funds file is empty or not an array");
    result.isValid = false;
  } else {
    rawFunds.forEach((f, index) => {
      const parse = FundInputSchema.safeParse(f);
      if (!parse.success) {
        result.errors.push(`Fund at index ${index} failed schema validation: ${parse.error.message}`);
        result.isValid = false;
        return;
      }

      const fund = parse.data;
      if (fundIds.has(fund.id)) {
        result.errors.push(`Duplicate Fund ID found: ${fund.id}`);
        result.isValid = false;
      } else {
        fundIds.add(fund.id);
      }

      // Check duplicate dates within NAV history
      const navDates = new Set<string>();
      fund.nav.forEach((nav, navIndex) => {
        if (navDates.has(nav.date)) {
          result.warnings.push(`Fund ${fund.id} has duplicate NAV date record: ${nav.date} at index ${navIndex}`);
        } else {
          navDates.add(nav.date);
        }
      });
    });
  }

  // 2. Validate Holdings
  if (!Array.isArray(rawHoldings)) {
    result.errors.push("Holdings is not an array");
    result.isValid = false;
  } else {
    rawHoldings.forEach((h, index) => {
      const parse = HoldingInputSchema.safeParse(h);
      if (!parse.success) {
        result.errors.push(`Holding at index ${index} failed schema validation: ${parse.error.message}`);
        result.isValid = false;
        return;
      }

      const holding = parse.data;
      if (!fundIds.has(holding.fund_id)) {
        result.errors.push(`Holding at index ${index} references missing Fund ID: ${holding.fund_id}`);
        result.isValid = false;
      }
    });
  }

  // 3. Validate Transactions
  if (!Array.isArray(rawTxns) || rawTxns.length === 0) {
    result.errors.push("Transactions file is empty or not an array");
    result.isValid = false;
  } else {
    rawTxns.forEach((t, index) => {
      const parse = TransactionInputSchema.safeParse(t);
      if (!parse.success) {
        result.errors.push(`Transaction at index ${index} failed schema validation: ${parse.error.message}`);
        result.isValid = false;
        return;
      }

      const txn = parse.data;
      if (transactionIds.has(txn.id)) {
        result.errors.push(`Duplicate Transaction ID found: ${txn.id}`);
        result.isValid = false;
      } else {
        transactionIds.add(txn.id);
      }
    });
  }

  return result;
}
