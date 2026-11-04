"""
Nifty Directional — pure strategy core.

This module contains ONLY deterministic, side-effect-free logic so that the live
engine and the historical backtest engine share exactly the same rules:

* Signal classification from the Gift Nifty 1-day change (points, inclusive thresholds)
* Entry window check (09:15:00 inclusive – 09:17:00 exclusive, Asia/Kolkata)
* ITM 3 strike selection from the strikes that actually exist in an option chain
* Capital-based stop loss / target limits
* Dated Upstox F&O option charges
* Intraday exit resolution against real 1-minute option candles

Nothing in this module talks to the broker, the database or the network.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from typing import Any, Dict, List, Optional, Sequence, Tuple

import pytz

IST = pytz.timezone("Asia/Kolkata")

STRATEGY_ID = "nifty-directional"
STRATEGY_NAME = "Nifty Directional"
UNDERLYING = "NIFTY"
UNDERLYING_INSTRUMENT_KEY = "NSE_INDEX|Nifty 50"
SIGNAL_SOURCE = "GIFT NIFTY"
SIGNAL_TIMEFRAME = "1 Day"
OPTION_SELECTION = "ITM 3"
ITM_DEPTH = 3

DEFAULT_SIGNAL_THRESHOLD = 80.0
DEFAULT_STOPLOSS_CAPITAL_PCT = 4.0
DEFAULT_TARGET_CAPITAL_PCT = 5.0
DEFAULT_TOTAL_CAPITAL = 200000.0
DEFAULT_LOTS = 1
MAX_TRADES_PER_DAY = 1

ENTRY_WINDOW_START = time(9, 15, 0)   # inclusive
ENTRY_WINDOW_END = time(9, 17, 0)     # exclusive
AUTO_SQUARE_OFF = time(15, 15, 0)

SIGNAL_CALL = "CALL"
SIGNAL_PUT = "PUT"
SIGNAL_NO_TRADE = "NO TRADE"
SIGNAL_DATA_UNAVAILABLE = "DATA UNAVAILABLE"

EXIT_SL = "SL"
EXIT_TARGET = "TARGET"
EXIT_TIME = "TIME_EXIT"

TICK_SIZE = 0.05


# --------------------------------------------------------------------------- #
# Signal & window
# --------------------------------------------------------------------------- #
def classify_signal(change_points: Optional[float], threshold: float = DEFAULT_SIGNAL_THRESHOLD) -> str:
    """
    Gift Nifty daily change in POINTS -> signal.
      change >= +threshold  -> CALL
      change <= -threshold  -> PUT
      otherwise             -> NO TRADE
      None                  -> DATA UNAVAILABLE
    """
    if change_points is None:
        return SIGNAL_DATA_UNAVAILABLE
    value = float(change_points)
    if value >= threshold:
        return SIGNAL_CALL
    if value <= -threshold:
        return SIGNAL_PUT
    return SIGNAL_NO_TRADE


def option_type_for_signal(signal: str) -> Optional[str]:
    if signal == SIGNAL_CALL:
        return "CE"
    if signal == SIGNAL_PUT:
        return "PE"
    return None


def is_within_entry_window(t: time) -> bool:
    """09:15:00 is inclusive, 09:17:00 is exclusive."""
    return ENTRY_WINDOW_START <= t < ENTRY_WINDOW_END


def window_status(t: time) -> Tuple[str, str]:
    stamp = t.strftime("%H:%M:%S")
    if t < ENTRY_WINDOW_START:
        return "PRE_WINDOW", f"Entry window opens at 09:15:00 IST (now {stamp} IST)."
    if t < ENTRY_WINDOW_END:
        return "OPEN", f"Entry window OPEN 09:15:00–09:17:00 IST (now {stamp} IST)."
    return "CLOSED", f"Entry window closed at 09:17:00 IST (now {stamp} IST). No new entries today."


# --------------------------------------------------------------------------- #
# Strike selection
# --------------------------------------------------------------------------- #
def select_atm_strike(strikes: Sequence[float], spot: float) -> float:
    """Strike from the real chain that is closest to spot (ties -> lower strike)."""
    if not strikes:
        raise ValueError("Option chain has no strikes.")
    ordered = sorted({float(s) for s in strikes})
    return min(ordered, key=lambda s: (abs(s - spot), s))


def select_itm_strike(
    strikes: Sequence[float],
    spot: float,
    option_type: str,
    depth: int = ITM_DEPTH,
) -> Optional[float]:
    """
    Select the ITM-`depth` strike dynamically from the strikes that exist in the chain.

    ATM = available strike closest to spot.
      CE: ITM strikes are below ATM -> the `depth`-th strike below ATM.
      PE: ITM strikes are above ATM -> the `depth`-th strike above ATM.
    Returns None when the chain does not contain enough strikes.
    """
    opt = option_type.upper()
    if opt not in ("CE", "PE"):
        raise ValueError(f"Invalid option type {option_type!r}; expected CE or PE.")
    ordered = sorted({float(s) for s in strikes})
    if not ordered:
        return None
    atm = select_atm_strike(ordered, spot)
    idx = ordered.index(atm)
    target_idx = idx - depth if opt == "CE" else idx + depth
    if target_idx < 0 or target_idx >= len(ordered):
        return None
    return ordered[target_idx]


def nearest_expiry_on_or_after(expiries: Sequence[str], trade_date: str) -> Optional[str]:
    candidates = sorted(e for e in expiries if e and e >= trade_date)
    return candidates[0] if candidates else None


# --------------------------------------------------------------------------- #
# Risk limits & quantity
# --------------------------------------------------------------------------- #
def capital_risk_limits(
    total_capital: float,
    stoploss_pct: float = DEFAULT_STOPLOSS_CAPITAL_PCT,
    target_pct: float = DEFAULT_TARGET_CAPITAL_PCT,
) -> Tuple[float, float]:
    """(stop_loss_amount, target_amount) in rupees, from TOTAL strategy capital."""
    return (
        round(total_capital * stoploss_pct / 100.0, 2),
        round(total_capital * target_pct / 100.0, 2),
    )


def order_quantity(lots: int, lot_size: int) -> int:
    if lots < 1:
        raise ValueError("Lots must be >= 1.")
    if lot_size < 1:
        raise ValueError("Lot size must come from contract metadata and be >= 1.")
    return int(lots) * int(lot_size)


# --------------------------------------------------------------------------- #
# Charges (Upstox F&O options, dated statutory schedule)
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class ChargeRates:
    brokerage_per_order: float
    stt_sell_pct: float          # % of sell premium turnover
    exchange_txn_pct: float      # % of premium turnover (both legs)
    sebi_per_crore: float        # ₹ per crore of turnover
    stamp_buy_pct: float         # % of buy premium turnover
    gst_pct: float               # on brokerage + exchange txn + SEBI fee


def charge_rates_for(trade_date: str) -> ChargeRates:
    """
    Statutory rates for NSE index options by date:
      * STT on option sell premium: 0.05% (< 2023-04-01), 0.0625% (< 2024-10-01), 0.1% after.
      * NSE transaction charge on premium: 0.0495% (< 2024-10-01), 0.03503% after.
      * SEBI turnover fee ₹10/crore, stamp duty 0.003% on buy, GST 18%.
      * Upstox brokerage ₹20 per executed order.
    """
    d = str(trade_date)[:10]
    if d < "2023-04-01":
        stt = 0.05
    elif d < "2024-10-01":
        stt = 0.0625
    else:
        stt = 0.1
    txn = 0.0495 if d < "2024-10-01" else 0.03503
    return ChargeRates(
        brokerage_per_order=20.0,
        stt_sell_pct=stt,
        exchange_txn_pct=txn,
        sebi_per_crore=10.0,
        stamp_buy_pct=0.003,
        gst_pct=18.0,
    )


def calculate_option_charges(
    entry_price: float,
    exit_price: float,
    quantity: int,
    trade_date: str,
) -> Dict[str, float]:
    """Round-trip (BUY then SELL) charges for an intraday long option position."""
    r = charge_rates_for(trade_date)
    buy_value = entry_price * quantity
    sell_value = exit_price * quantity
    turnover = buy_value + sell_value

    brokerage = 2 * r.brokerage_per_order
    stt = sell_value * r.stt_sell_pct / 100.0
    txn = turnover * r.exchange_txn_pct / 100.0
    sebi = turnover * r.sebi_per_crore / 1e7
    stamp = buy_value * r.stamp_buy_pct / 100.0
    gst = (brokerage + txn + sebi) * r.gst_pct / 100.0
    total = brokerage + stt + txn + sebi + stamp + gst
    return {
        "brokerage": round(brokerage, 2),
        "stt": round(stt, 2),
        "exchange_txn": round(txn, 2),
        "sebi": round(sebi, 2),
        "stamp_duty": round(stamp, 2),
        "gst": round(gst, 2),
        "total": round(total, 2),
    }


def net_pnl_at(entry_price: float, price: float, quantity: int, trade_date: str) -> float:
    gross = (price - entry_price) * quantity
    return gross - calculate_option_charges(entry_price, price, quantity, trade_date)["total"]


def price_for_net_pnl(entry_price: float, quantity: int, trade_date: str, target_net: float) -> float:
    """
    Exit price at which round-trip NET P&L (after charges) equals `target_net`.

    Charges are linear in the exit price:
        charges(px) = C0 + k * px * qty
    where C0 holds brokerage(+GST) and buy-leg charges and k the sell-leg rates, so
        (px - entry) * qty - C0 - k * px * qty = target_net
        px = (target_net + entry * qty + C0) / (qty * (1 - k))
    """
    r = charge_rates_for(trade_date)
    g = r.gst_pct / 100.0
    buy_value = entry_price * quantity
    c0 = (
        2 * r.brokerage_per_order * (1 + g)
        + buy_value * (r.exchange_txn_pct / 100.0) * (1 + g)
        + buy_value * (r.sebi_per_crore / 1e7) * (1 + g)
        + buy_value * r.stamp_buy_pct / 100.0
    )
    k = (
        r.stt_sell_pct / 100.0
        + (r.exchange_txn_pct / 100.0) * (1 + g)
        + (r.sebi_per_crore / 1e7) * (1 + g)
    )
    return (target_net + buy_value + c0) / (quantity * (1 - k))


def round_to_tick(price: float, tick: float = TICK_SIZE) -> float:
    return round(round(price / tick) * tick, 2)


# --------------------------------------------------------------------------- #
# Candles & intraday exit simulation
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class Candle:
    ts: datetime  # candle START time, tz-aware IST
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0


def parse_candles(raw: Sequence[Sequence[Any]]) -> List[Candle]:
    """Upstox candle rows: [timestamp, open, high, low, close, volume, oi]. Sorted ascending."""
    out: List[Candle] = []
    for row in raw or []:
        if not row or len(row) < 5:
            continue
        ts = datetime.fromisoformat(str(row[0]))
        if ts.tzinfo is None:
            ts = IST.localize(ts)
        else:
            ts = ts.astimezone(IST)
        out.append(
            Candle(
                ts=ts,
                open=float(row[1]),
                high=float(row[2]),
                low=float(row[3]),
                close=float(row[4]),
                volume=float(row[5]) if len(row) > 5 and row[5] is not None else 0.0,
            )
        )
    out.sort(key=lambda c: c.ts)
    return out


def entry_candle(candles: Sequence[Candle]) -> Optional[Candle]:
    """First candle that STARTS inside the entry window (09:15:00 <= t < 09:17:00)."""
    for c in candles:
        if is_within_entry_window(c.ts.timetz().replace(tzinfo=None)):
            return c
    return None


@dataclass
class ExitResult:
    exit_time: datetime
    exit_price: float
    exit_reason: str
    note: Optional[str] = None


def resolve_exit(
    candles: Sequence[Candle],
    entry: Candle,
    entry_price: float,
    quantity: int,
    trade_date: str,
    stoploss_amount: float,
    target_amount: float,
    square_off: time = AUTO_SQUARE_OFF,
) -> Optional[ExitResult]:
    """
    Walk real 1-minute option candles from the entry candle onwards.

    * SL when NET P&L (after charges) <= -stoploss_amount.
    * TARGET when NET P&L >= +target_amount.
    * TIME_EXIT at the 15:15 candle open (or the last candle close before it).
    * Gap through a level at a candle open -> fill at that open (realistic slippage).
    * Both SL and TARGET touched inside one candle -> SL assumed first (conservative).
    Only data at or after the entry timestamp is used (no look-ahead).
    """
    sl_price = price_for_net_pnl(entry_price, quantity, trade_date, -stoploss_amount)
    tgt_price = price_for_net_pnl(entry_price, quantity, trade_date, target_amount)

    last_before_close: Optional[Candle] = None
    for c in candles:
        if c.ts < entry.ts:
            continue
        c_time = c.ts.timetz().replace(tzinfo=None)
        if c_time >= square_off:
            return ExitResult(c.ts, round_to_tick(c.open), EXIT_TIME)

        is_entry_candle = c.ts == entry.ts
        if not is_entry_candle:
            if sl_price > 0 and c.open <= sl_price:
                return ExitResult(c.ts, round_to_tick(c.open), EXIT_SL, "Gap through stop loss at candle open.")
            if c.open >= tgt_price:
                return ExitResult(c.ts, round_to_tick(c.open), EXIT_TARGET, "Gap through target at candle open.")

        hit_sl = sl_price > 0 and c.low <= sl_price
        hit_tgt = c.high >= tgt_price
        if hit_sl and hit_tgt:
            return ExitResult(
                c.ts, round_to_tick(sl_price), EXIT_SL,
                "SL and target both inside one 1-minute candle; SL assumed first (conservative).",
            )
        if hit_sl:
            return ExitResult(c.ts, round_to_tick(sl_price), EXIT_SL)
        if hit_tgt:
            return ExitResult(c.ts, round_to_tick(tgt_price), EXIT_TARGET)
        last_before_close = c

    if last_before_close is not None:
        return ExitResult(
            last_before_close.ts + timedelta(minutes=1),
            round_to_tick(last_before_close.close),
            EXIT_TIME,
            "No 15:15 candle; exited at close of last available candle.",
        )
    return None


def classify_result(net_pnl: float) -> str:
    if net_pnl > 0:
        return "PROFIT"
    if net_pnl < 0:
        return "LOSS"
    return "BREAK EVEN"


# --------------------------------------------------------------------------- #
# Aggregation
# --------------------------------------------------------------------------- #
@dataclass
class BacktestSummary:
    initial_capital: float
    final_capital: float
    total_trading_days: int
    total_trades: int
    winning_trades: int
    losing_trades: int
    breakeven_trades: int
    no_trade_days: int
    data_unavailable_days: int
    win_rate_pct: float
    gross_profit: float
    gross_loss: float
    total_charges: float
    net_pnl: float
    roi_pct: float
    max_drawdown_amount: float
    max_drawdown_pct: float
    profit_factor: Optional[float]
    overall_result: str
    equity_curve: List[Dict[str, Any]] = field(default_factory=list)

    def as_dict(self) -> Dict[str, Any]:
        d = dict(self.__dict__)
        d.pop("equity_curve", None)
        return d


TRADE_RESULTS = ("PROFIT", "LOSS", "BREAK EVEN")


def summarize(days: Sequence[Dict[str, Any]], initial_capital: float, start_date: str) -> BacktestSummary:
    trades = [d for d in days if d.get("result") in TRADE_RESULTS]
    wins = [t for t in trades if t["net_pnl"] > 0]
    losses = [t for t in trades if t["net_pnl"] < 0]
    evens = [t for t in trades if t["net_pnl"] == 0]

    gross_profit = round(sum(t["gross_pnl"] for t in trades if t["gross_pnl"] > 0), 2)
    gross_loss = round(abs(sum(t["gross_pnl"] for t in trades if t["gross_pnl"] < 0)), 2)
    total_charges = round(sum(t["charges"] for t in trades), 2)
    net = round(sum(t["net_pnl"] for t in trades), 2)

    equity = initial_capital
    peak = initial_capital
    max_dd = 0.0
    max_dd_pct = 0.0
    curve: List[Dict[str, Any]] = [{"date": start_date, "equity": round(initial_capital, 2), "drawdown": 0.0}]
    for d in days:
        if d.get("result") in TRADE_RESULTS:
            equity += d["net_pnl"]
        peak = max(peak, equity)
        dd = peak - equity
        if dd > max_dd:
            max_dd = dd
            max_dd_pct = (dd / peak * 100.0) if peak > 0 else 0.0
        curve.append({"date": d["trade_date"], "equity": round(equity, 2), "drawdown": round(dd, 2)})

    net_wins = sum(t["net_pnl"] for t in wins)
    net_losses = abs(sum(t["net_pnl"] for t in losses))
    profit_factor = round(net_wins / net_losses, 2) if net_losses > 0 else None

    no_trade = sum(1 for d in days if d.get("result") == "NO TRADE")
    unavailable = sum(1 for d in days if d.get("result") == SIGNAL_DATA_UNAVAILABLE)

    if not trades and unavailable and unavailable == len(days):
        overall = SIGNAL_DATA_UNAVAILABLE
    else:
        overall = classify_result(net)

    return BacktestSummary(
        initial_capital=round(initial_capital, 2),
        final_capital=round(initial_capital + net, 2),
        total_trading_days=len(days),
        total_trades=len(trades),
        winning_trades=len(wins),
        losing_trades=len(losses),
        breakeven_trades=len(evens),
        no_trade_days=no_trade,
        data_unavailable_days=unavailable,
        win_rate_pct=round(len(wins) / len(trades) * 100.0, 2) if trades else 0.0,
        gross_profit=gross_profit,
        gross_loss=gross_loss,
        total_charges=total_charges,
        net_pnl=net,
        roi_pct=round(net / initial_capital * 100.0, 2) if initial_capital else 0.0,
        max_drawdown_amount=round(max_dd, 2),
        max_drawdown_pct=round(max_dd_pct, 2),
        profit_factor=profit_factor,
        overall_result=overall,
        equity_curve=curve,
    )


def ist_now() -> datetime:
    return datetime.now(IST)


def ist_iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = IST.localize(dt)
    return dt.astimezone(IST).isoformat(timespec="seconds")


def parse_date(value: str) -> date:
    return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()

