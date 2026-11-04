import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatIndianNumber(val: number, decimals = 0): string {
  if (isNaN(val) || val === null || val === undefined) return "0";
  const isNegative = val < 0;
  const abs = Math.abs(val);
  const fixed = abs.toFixed(decimals);
  const [intPartRaw, decPart] = fixed.split(".");

  const lastThree = intPartRaw.substring(intPartRaw.length - 3);
  const otherNumbers = intPartRaw.substring(0, intPartRaw.length - 3);
  const intPart =
    otherNumbers !== ""
      ? otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + lastThree
      : lastThree;

  const result = decPart ? `${intPart}.${decPart}` : intPart;
  return isNegative ? `-${result}` : result;
}

export function formatINR(val: number, showSign = false): string {
  const isPositive = val > 0;
  const isNegative = val < 0;
  const formatted = formatIndianNumber(val, 2);

  if (isPositive && showSign) {
    return `+₹${formatted}`;
  } else if (isNegative) {
    return `-₹${formatted.replace("-", "")}`;
  }
  return `₹${formatted}`;
}

export function formatINRInteger(val: number, showSign = false): string {
  const isPositive = val > 0;
  const isNegative = val < 0;
  const formatted = formatIndianNumber(val, 0);

  if (isPositive && showSign) {
    return `+₹${formatted}`;
  } else if (isNegative) {
    return `-₹${formatted.replace("-", "")}`;
  }
  return `₹${formatted}`;
}

export function formatPoints(val: number, showSign = false): string {
  const absVal = Math.abs(val);
  const formatted = absVal.toFixed(2);
  if (val > 0) {
    return showSign ? `+${formatted}` : formatted;
  } else if (val < 0) {
    return `-${formatted}`;
  }
  return formatted;
}

export function formatPercent(val: number, showSign = true): string {
  const sign = val > 0 && showSign ? "+" : "";
  return `${sign}${val.toFixed(2)}%`;
}

