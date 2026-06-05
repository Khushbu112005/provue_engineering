import { CONSTANTS } from "../config/constants.js";

export interface GroundedCurrency {
  value: number;
  currency: string;
  formatted: string;
}

export interface GroundedPercentage {
  value: number;
  formatted: string;
}

export const AnswerGrounding = {
  formatCurrency(value: number, currencyCode: string = "INR"): GroundedCurrency {
    const roundedValue = Number(value.toFixed(CONSTANTS.ROUNDING_DECIMALS));
    
    // Custom Indian Rupee / standard currency formatter
    let formatted = "";
    if (currencyCode === "INR") {
      const isNegative = roundedValue < 0;
      const absoluteValue = Math.abs(roundedValue);
      
      // Split integer and decimal parts
      const parts = absoluteValue.toFixed(CONSTANTS.ROUNDING_DECIMALS).split(".");
      const integerPart = parts[0];
      const decimalPart = parts[1];
      
      // Indian numbering format (e.g. 12,34,567.89)
      let lastThree = integerPart.substring(integerPart.length - 3);
      const otherParts = integerPart.substring(0, integerPart.length - 3);
      if (otherParts !== "") {
        lastThree = "," + lastThree;
      }
      const formattedInteger = otherParts.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + lastThree;
      
      formatted = `${isNegative ? "-" : ""}₹${formattedInteger}.${decimalPart}`;
    } else {
      // Fallback standard currency formatter
      const isNegative = roundedValue < 0;
      const absValueStr = Math.abs(roundedValue).toLocaleString("en-US", {
        minimumFractionDigits: CONSTANTS.ROUNDING_DECIMALS,
        maximumFractionDigits: CONSTANTS.ROUNDING_DECIMALS
      });
      formatted = `${isNegative ? "-" : ""}${currencyCode} ${absValueStr}`;
    }

    return {
      value: roundedValue,
      currency: currencyCode,
      formatted
    };
  },

  formatPercentage(value: number): GroundedPercentage {
    const roundedValue = Number(value.toFixed(CONSTANTS.ROUNDING_DECIMALS));
    const formatted = `${roundedValue >= 0 ? "+" : ""}${roundedValue.toFixed(CONSTANTS.ROUNDING_DECIMALS)}%`;
    
    return {
      value: roundedValue,
      formatted
    };
  }
};
