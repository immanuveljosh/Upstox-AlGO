---
name: upstox-algo-strategy
description: Institutional trading rules, architecture standards, and execution constraints for the Upstox Algo Trading Desk (Next.js, FastAPI, Upstox v2 API, and Nifty Directional strategy).
---

# Upstox Algo Strategy & Architecture Skill

This skill contains the domain rules, trading constraints, and architecture guidelines for the **Upstox Algo Trading Desk** (`https://github.com/immanuveljosh/Upstox-AlGO`).

## 1. System Architecture

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Lucide React icons. Running on port `3005`.
  - Dark institutional terminal theme (`#030712`, `#0b1120`, emerald/rose accents).
  - State managed via `TradingContext.tsx`.
  - Pages: Dashboard (`/`), Strategy Overview (`/strategy`), Strategy Backtest (`/backtest`), Orders (`/orders`), P&L (`/pnl`), Settings (`/settings`).
- **Backend**: Python 3.11, FastAPI, Uvicorn, Async SQLAlchemy, SQLite (`upstox_algo.db`), Pydantic v2 schemas. Running on port `8000`.
  - Prefix: `/api/v1`
  - Routes: `/market`, `/strategy`, `/orders`, `/auth`, `/pnl`, `/risk`.
- **Broker Integration**: Upstox v2 Open API (`https://api.upstox.com/v2`).
  - OAuth 2.0 authorization code flow & manual bearer access token fallback.
  - Redirect URI: `http://localhost:8000/api/v1/auth/callback` (must exact-match Upstox Developer Console).

---

## 2. Default Trading Strategy: Nifty Directional

All algorithmic trading in this repository revolves around the **Nifty Directional** default strategy (`nifty-directional`).

### Entry Signal Logic (Points, NOT %)
- **Source**: Gift Nifty 1-Day change in net POINTS.
- **Call (CE) Entry**: `Gift Nifty change >= +80.00 points` -> Generate **CALL (BUY CALL, CE)** signal.
- **Put (PE) Entry**: `Gift Nifty change <= -80.00 points` -> Generate **PUT (BUY PUT, PE)** signal.
- **Neutral / No Trade**: Values between `-79.99` and `+79.99` points -> **NO TRADE**.

### Trading Window Rules
- **Allowed Window**: Strictly **09:15:00 AM (inclusive) to 09:17:00 AM (exclusive) IST** (`Asia/Kolkata` timezone).
- **Execution**: When threshold is reached within the window, entry order triggers immediately.
- **Cut-off**: At **09:17:00 AM IST**, new entries are hard-blocked for the day.
- **Daily Trade Limit**: Strictly **maximum 1 trade per calendar trading day**. Daily rollover resets eligibility at midnight IST.

### Option Strike Selection (ITM 3 Dynamically from Option Chain)
- Underlying: **NIFTY 50** only (`NSE_INDEX|Nifty 50`).
- ATM Strike is the option chain strike nearest to current NIFTY spot price.
- **CE Signal**: Select **ITM 3 Call** (3 strikes below ATM in the option chain).
- **PE Signal**: Select **ITM 3 Put** (3 strikes above ATM in the option chain).
- **Expiry**: Nearest weekly/monthly NIFTY expiry.
- **Lot Size & Sizing**:
  - Current NIFTY contract lot size = **65 units** per lot.
  - Sizing = `Lots × Lot Size` (e.g., 1 lot = 65 qty, 2 lots = 130 qty).
  - Validate against Upstox instrument metadata API before order dispatch.
  - NSE Freeze Limit = **1,755 units** (27 lots).

### Risk Management (Capital-Based Limits)
Risk limits are calculated from **TOTAL STRATEGY CAPITAL** (default ₹2,00,000), including statutory F&O charges:
- **Stop Loss**: **-5.0% of Total Strategy Capital** (e.g., on ₹2,00,000 capital, SL = -₹10,000).
- **Target Profit**: **+6.0% of Total Strategy Capital** (e.g., on ₹2,00,000 capital, Target = +₹12,000).
- **Auto Square-Off**: Open intraday positions automatically exit at **15:15 IST**.

---

## 3. Mode Isolation: BACKTEST vs LIVE

1. **BACKTEST Mode**:
   - Historical strategy checking across 1M, 3M, 6M, 1Y, and Custom Date Ranges.
   - Uses real historical NIFTY 50 & option candle data from Upstox.
   - Never invents option premiums or fabricates trades; shows `DATA UNAVAILABLE` when historical option data is missing.
   - Never places live broker orders.
2. **LIVE Mode**:
   - Routes real orders to the Upstox Order Management System (OMS).
   - Requires valid Upstox OAuth session and explicit user confirmation popup.
