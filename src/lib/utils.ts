import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatINR(val: number, showSign = false): string {
  const absVal = Math.abs(val);
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(absVal);

  if (val > 0) {
    return showSign ? `+₹${formatted}` : `₹${formatted}`;
  } else if (val < 0) {
    return `-₹${formatted}`;
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

