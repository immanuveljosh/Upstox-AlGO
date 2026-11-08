import {
  Order,
  Position,
  StrategyConfig,
  AccountStats,
  CandleData,
  PnlSummary,
  BrokerCredentials,
} from "@/types/trading";

export const initialBrokerCredentials: BrokerCredentials = {
  apiKey: process.env.NEXT_PUBLIC_UPSTOX_API_KEY || "",
  apiSecret: "",
  redirectUrl:
    process.env.NEXT_PUBLIC_UPSTOX_REDIRECT_URI ||
    "http://localhost:8000/api/v1/auth/callback",
  accessToken: process.env.NEXT_PUBLIC_UPSTOX_ACCESS_TOKEN || "",
  connectedAt: "",
  accountName: process.env.NEXT_PUBLIC_UPSTOX_ACCOUNT_NAME || "IMMANUVEL D",
  ucc: process.env.NEXT_PUBLIC_UPSTOX_UCC || "5GC3MG",
};

export const defaultStrategy: StrategyConfig = {
  id: "nifty-directional",
  name: "Nifty Directional",
  underlying: "NIFTY",
  signalSource: "Gift Nifty",
  optionSelection: "ITM 3",
  timeframe: "1 Day",
  signalThreshold: 80.0,
  description:
    "Nifty Directional: Buy NIFTY ITM 3 Call (CE) if Gift Nifty 1-Day change >= +80 pts; Buy NIFTY ITM 3 Put (PE) if <= -80 pts; No Trade between -80 and +80 pts. Trading window 09:15:00–09:17:00 IST, max 1 trade/day, Stop Loss 5% of capital, Target Profit 6% of capital.",
  status: "STOPPED",
  giftNiftyChange: null,
  giftNiftyChangePct: 0.0,
  signal: "NO_TRADE",
  signalLabel: "DATA UNAVAILABLE",
  selectedOption: "Awaiting Signal (ITM 3)",
  entryPrice: 0.0,
  totalCapital: 200000,
  stoplossPercent: 5.0,
  stoplossAmount: 10000, // 5% of ₹2,00,000
  targetPercent: 6.0,
  targetAmount: 12000, // 6% of ₹2,00,000
  windowStatus: "CLOSED",
  dailyTradeCount: 0,
  maxDailyTrades: 1,
  lotSize: 65, // 65 units per lot for NIFTY contracts
  lots: 1, // 1 lot = 65 quantity
  stoplossPoints: 154, // ₹10,000 / 65 qty
  targetPoints: 185, // ₹12,000 / 65 qty
  maxDailyLoss: 10000, // 5% of ₹2,00,000 capital
  entryWindowStart: "09:15:00",
  entryWindowEnd: "09:17:00",
  autoSquareOffTime: "15:15",
  indicator: "Gift Nifty 1-Day (>= +80 CALL / <= -80 PUT) • ITM 3",
};

export const initialActivePosition: Position | null = null;

export const initialStats: AccountStats = {
  openPnl: 0.0,
  todayPnl: 0.0,
  marginUsed: 0.0,
  marginAvailable: 0.0,
  totalCapital: 200000.0,
  winRate: 0.0,
  totalTrades: 0,
  maxDrawdown: 0.0,
  profitFactor: 0.0,
};

export const mockOrders: Order[] = [];

export const mockIntradayCandles: CandleData[] = [];

export const mockPnlData: Record<"monthly" | "sixMonth" | "yearly", PnlSummary> = {
  monthly: {
    period: "monthly",
    netPnl: 0.0,
    grossPnl: 0.0,
    brokerageTaxes: 0.0,
    winRate: 0.0,
    profitTrades: 0,
    lossTrades: 0,
    maxDrawdown: 0.0,
    maxDrawdownPct: 0.0,
    avgWin: 0.0,
    avgLoss: 0.0,
    profitFactor: 0.0,
    equityCurve: [],
    dailyPnl: [],
  },
  sixMonth: {
    period: "sixMonth",
    netPnl: 0.0,
    grossPnl: 0.0,
    brokerageTaxes: 0.0,
    winRate: 0.0,
    profitTrades: 0,
    lossTrades: 0,
    maxDrawdown: 0.0,
    maxDrawdownPct: 0.0,
    avgWin: 0.0,
    avgLoss: 0.0,
    profitFactor: 0.0,
    equityCurve: [],
    dailyPnl: [],
  },
  yearly: {
    period: "yearly",
    netPnl: 0.0,
    grossPnl: 0.0,
    brokerageTaxes: 0.0,
    winRate: 0.0,
    profitTrades: 0,
    lossTrades: 0,
    maxDrawdown: 0.0,
    maxDrawdownPct: 0.0,
    avgWin: 0.0,
    avgLoss: 0.0,
    profitFactor: 0.0,
    equityCurve: [],
    dailyPnl: [],
  },
};
