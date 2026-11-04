export type OptionType = "CE" | "PE";

export type OrderStatus = "PLACED" | "CLOSED" | "REJECTED";

export type TradingMode = "LIVE" | "BACKTEST";

export type ConnectionStatus = "CONNECTED" | "DISCONNECTED" | "RECONNECTING";

export type DirectionalSignal = "CALL" | "PUT" | "NO TRADE" | "DATA UNAVAILABLE";

export interface Order {
  id: string;
  time: string;
  symbol: string;
  strike: number;
  type: OptionType;
  lots: number;
  lotSize?: number; // 65 units per lot
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
  lotSize?: number; // 65 units per lot
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

export interface InstrumentMetadata {
  name: string;
  segment: string;
  exchange: string;
  instrumentKey: string;
  tradingSymbol: string;
  expiry: string;
  lotSize: number; // 65 units per lot
  freezeQuantity: number; // 1755 units (27 lots)
  minimumLot: number;
  tickSize: number;
  strike: number;
  optionType: OptionType;
  source: string;
}

export interface GiftNiftySnapshot {
  status: "AVAILABLE" | "DATA UNAVAILABLE";
  trade_date: string;
  change_points: number | null;
  prev_close?: number | null;
  current_value?: number | null;
  observed_at?: string | null;
  source?: string | null;
  message: string;
}

export interface StrategyLiveStatus {
  timestamp_ist: string;
  trading_date: string;
  strategy_name: string;
  gift_nifty: GiftNiftySnapshot;
  signal: DirectionalSignal;
  option_type: OptionType | null;
  selected_strike: number | null;
  window_status: "PRE_WINDOW" | "OPEN" | "CLOSED";
  window_message: string;
  today_trade_status:
    | "AWAITING_WINDOW"
    | "MONITORING"
    | "TRADE_INITIATED"
    | "NO_TRADE"
    | "DATA_UNAVAILABLE";
  today_order?: Record<string, unknown> | null;
  trades_executed_today: number;
  max_trades_per_day: number;
  engine_status: "RUNNING" | "STOPPED";
  mode: TradingMode;
  can_enter_now: boolean;
  reason: string;
  total_capital: number;
  stoploss_pct: number;
  stoploss_amount: number;
  target_pct: number;
  target_amount: number;
  lots: number;
  lot_size: number;
  quantity: number;
}

export interface StrategyConfig {
  id: string;
  name: string;
  underlying: string;
  signalSource: string;
  description: string;
  status: "RUNNING" | "STOPPED";
  optionSelection: "ITM 3";
  timeframe: string;
  signalThreshold: number; // 80.0 points
  giftNiftyChange: number | null;
  giftNiftyChangePct: number;
  signal: "BULLISH" | "BEARISH" | "NO_TRADE";
  signalLabel: DirectionalSignal;
  selectedOption: string;
  entryPrice: number;
  totalCapital: number;
  stoplossPercent: number; // 4%
  stoplossAmount: number; // ₹8,000 on ₹2L
  targetPercent: number; // 5%
  targetAmount: number; // ₹10,000 on ₹2L
  windowStatus: "OPEN" | "CLOSED" | "PRE_MARKET";
  dailyTradeCount: number; // 0 or 1
  maxDailyTrades: number; // 1
  lotSize: number; // 65 units per lot
  lots: number; // 1 lot = 65 qty
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

export type BacktestDurationCode = "1M" | "3M" | "6M" | "1Y" | "CUSTOM";

export interface BacktestDay {
  trade_date: string;
  gift_nifty_change: number | null;
  gift_nifty_source?: string | null;
  signal: DirectionalSignal;
  option_type?: OptionType | null;
  strike?: number | null;
  expiry?: string | null;
  trading_symbol?: string | null;
  instrument_key?: string | null;
  spot_at_entry?: number | null;
  entry_time?: string | null;
  entry_time_display?: string | null;
  entry_price?: number | null;
  exit_time?: string | null;
  exit_time_display?: string | null;
  exit_price?: number | null;
  lots?: number | null;
  lot_size?: number | null;
  quantity?: number | null;
  gross_pnl?: number | null;
  charges?: number | null;
  net_pnl?: number | null;
  exit_reason?: "SL" | "Target" | "Time Exit" | null;
  result: "PROFIT" | "LOSS" | "BREAK EVEN" | "NO TRADE" | "DATA UNAVAILABLE";
  note?: string | null;
}

export interface BacktestEquityPoint {
  date: string;
  equity: number;
  pnl: number;
  drawdown: number;
}

export interface BacktestSummary {
  initial_capital: number;
  final_capital: number;
  total_trading_days: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  no_trade_days: number;
  data_unavailable_days: number;
  win_rate_pct: number;
  gross_profit: number;
  gross_loss: number;
  total_charges: number;
  net_pnl: number;
  roi_pct: number;
  max_drawdown_amount: number;
  max_drawdown_pct: number;
  profit_factor: number | null;
  overall_result: "PROFIT" | "LOSS" | "BREAK EVEN" | "DATA UNAVAILABLE";
  sl_exits: number;
  target_exits: number;
  time_exits: number;
}

export interface BacktestConfigBlock {
  strategy_name: string;
  initial_capital: number;
  lots: number;
  stoploss_pct: number;
  stoploss_amount: number;
  target_pct: number;
  target_amount: number;
  option_selection: string;
  signal_threshold: number;
  trading_window: string;
  auto_square_off: string;
  charges_model: string;
}

export interface BacktestResult {
  run_id: string;
  strategy_id: string;
  strategy_name: string;
  status: "COMPLETE" | "INCOMPLETE" | "DATA UNAVAILABLE";
  duration: string;
  duration_label: string;
  duration_code: string;
  start_date: string;
  end_date: string;
  created_at: string;
  config: BacktestConfigBlock;
  summary: BacktestSummary;
  initial_capital: number;
  final_capital: number;
  total_trading_days: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  no_trade_days: number;
  data_unavailable_days: number;
  win_rate_pct: number;
  gross_profit: number;
  gross_loss: number;
  total_charges: number;
  net_pnl: number;
  roi_pct: number;
  max_drawdown_amount: number;
  max_drawdown_pct: number;
  profit_factor: number | null;
  overall_result: "PROFIT" | "LOSS" | "BREAK EVEN" | "DATA UNAVAILABLE";
  capital: number;
  lots: number;
  lot_size: number;
  total_qty: number;
  days: BacktestDay[];
  trades: BacktestDay[];
  equity_curve: BacktestEquityPoint[];
  data_issues: string[];
  message?: string;
}

export interface BacktestRunItem {
  run_id: string;
  strategy_name: string;
  duration_code: string;
  duration_label: string;
  start_date: string;
  end_date: string;
  status: string;
  initial_capital: number;
  lots: number;
  net_pnl: number;
  roi_pct: number;
  total_trades: number;
  overall_result: string;
  created_at?: string | null;
}
