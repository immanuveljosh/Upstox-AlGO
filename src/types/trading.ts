export type OptionType = "CE" | "PE";

export type OrderStatus = "PLACED" | "CLOSED" | "REJECTED";

export type TradingMode = "LIVE" | "BACKTEST";

export type ConnectionStatus = "CONNECTED" | "DISCONNECTED" | "RECONNECTING";

export interface Order {
  id: string;
  time: string;
  symbol: string;
  strike: number;
  type: OptionType;
  lots: number;
  qty: number;
  price: number;
  status: OrderStatus;
  pnl?: number;
  exitPrice?: number;
  exitTime?: string;
  rejectReason?: string;
}

export interface Position {
  symbol: string;
  strike: number;
  type: OptionType;
  lots: number;
  qty: number;
  buyPrice: number;
  ltp: number;
  pnl: number;
  pnlPercent: number;
  stoploss: number;
  target: number;
  trailingSl: number;
  entryTime: string;
}

export interface StrategyConfig {
  id: string;
  name: string;
  underlying: string;
  description: string;
  status: "RUNNING" | "STOPPED";
  optionSelection: "ITM 3";
  timeframe: string;
  giftNiftyChange: number; // e.g. +92.5
  giftNiftyChangePct: number; // e.g. +0.38
  signal: "BULLISH" | "BEARISH" | "NO_TRADE";
  selectedOption: string; // e.g. "NIFTY 24700 CE"
  entryPrice: number;
  totalCapital: number;
  stoplossPercent: number; // 5%
  stoplossAmount: number; // ₹10,000 on ₹2L
  targetPercent: number; // 6%
  targetAmount: number; // ₹12,000 on ₹2L
  windowStatus: "OPEN" | "CLOSED" | "PRE_MARKET";
  dailyTradeCount: number; // 0 or 1
  maxDailyTrades: number; // 1
  lotSize: number; // e.g. 25 shares per lot
  lots: number; // e.g. 2 lots = 50 qty
  stoplossPoints: number;
  targetPoints: number;
  maxDailyLoss: number;
  entryWindowStart: string;
  entryWindowEnd: string;
  autoSquareOffTime: string;
  indicator: string;
}

export interface AccountStats {
  openPnl: number;
  todayPnl: number;
  marginUsed: number;
  marginAvailable: number;
  totalCapital: number;
  winRate: number;
  totalTrades: number;
  maxDrawdown: number;
  profitFactor: number;
}

export interface CandleData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  vwap: number;
  volume: number;
}

export interface PnlSummary {
  period: "monthly" | "sixMonth" | "yearly";
  netPnl: number;
  grossPnl: number;
  brokerageTaxes: number;
  winRate: number;
  profitTrades: number;
  lossTrades: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  equityCurve: { date: string; equity: number; drawdown: number }[];
  dailyPnl: { date: string; pnl: number; trades: number }[];
}

export interface BrokerCredentials {
  apiKey: string;
  apiSecret: string;
  redirectUrl: string;
  accessToken: string;
  connectedAt?: string;
  accountName: string;
  ucc: string;
}

