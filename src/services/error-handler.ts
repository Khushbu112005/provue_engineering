import { ErrorCode } from "../types/error-codes.js";

export interface ErrorResponse {
  success: false;
  errorCode: ErrorCode;
  errorMessage: string;
  userMessage: string;
}

export const ErrorHandler = {
  handle(error: any, contextMsg: string = "An error occurred"): ErrorResponse {
    console.error(`❌ [${contextMsg}] error details:`, error);

    let errorCode = ErrorCode.INTERNAL_ERROR;
    let errorMessage = error instanceof Error ? error.message : String(error);
    let userMessage = "Sorry, I encountered an internal error. Please try again later.";

    if (errorMessage.includes("DATABASE_URL") || errorMessage.includes("connection") || errorMessage.includes("Pool")) {
      errorCode = ErrorCode.DATABASE_ERROR;
      userMessage = "I am currently unable to connect to the database. Please verify the connection settings.";
    } else if (errorMessage.includes("NAV") || errorMessage.includes("NAV_DATA_UNAVAILABLE")) {
      errorCode = ErrorCode.NAV_DATA_UNAVAILABLE;
      userMessage = "I could not find sufficient Net Asset Value (NAV) data to compute returns for the requested dates.";
    } else if (errorMessage.includes("date") || errorMessage.includes("range") || errorMessage.includes("INVALID_DATE_RANGE")) {
      errorCode = ErrorCode.INVALID_DATE_RANGE;
      userMessage = "The requested date range appears to be invalid or unsupported by the dataset.";
    } else if (errorMessage.includes("fund") || errorMessage.includes("holding") || errorMessage.includes("INVALID_FUND")) {
      errorCode = ErrorCode.INVALID_FUND;
      userMessage = "I could not locate the requested mutual fund or holding in your portfolio.";
    } else if (errorMessage.includes("data") || errorMessage.includes("empty") || errorMessage.includes("DATA_NOT_FOUND")) {
      errorCode = ErrorCode.DATA_NOT_FOUND;
      userMessage = "I could not find any records matching your request in the database.";
    }

    return {
      success: false,
      errorCode,
      errorMessage,
      userMessage
    };
  }
};
export class FinanceServiceError extends Error {
  public errorCode: ErrorCode;
  constructor(errorCode: ErrorCode, message: string) {
    super(message);
    this.name = "FinanceServiceError";
    this.errorCode = errorCode;
  }
}
