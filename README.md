# Upstox Algo Trading Desk &bull; Nifty Intraday Index Option Terminal

A modern, institutional-grade dark-theme algorithmic trading dashboard built for **Nifty Intraday Index Option Directional Trading** (Call / Put), powered by Next.js 14 (App Router), React, TypeScript, and Tailwind CSS.

---

## ⚡ Key Highlights & Core Features

### 1. **Login & Upstox Auth Flow** (`/login`)
- Clean, focused institutional dark theme login terminal.
- Primary **"Connect with Upstox"** OAuth action with instant session handshake.
- Fast sandbox bypass option to explore the dashboard immediately in backtest mode.
- System safeguards overview (256-bit encryption, 18ms WebSocket stream, Kill switch readiness).

### 2. **Master Layout & Top Bar**
- **Live Nifty 50 Ticker**: Spot index price with real-time green/red tick updates and percentage changes.
- **Mode Switch (Backtest | Live)**: High-contrast toggle switch. Live mode activates real-time broker stream; Backtest mode displays replay sandbox indicators and historical testing banners.
- **Connection Status Badge**: Dynamic badge showing `Connected` (with latency counter) or `Connection Lost` (with pulse alert and 1-click reconnect trigger).
- **Kill Switch (Prominent Red)**: Always accessible in the top bar. Guarded by a two-step confirmation modal requiring explicit acknowledgment. Disabled automatically when disconnected to prevent orphaned requests.

### 3. **Dashboard Home** (`/`)
- **Quick Stats Panel**: Real-time Open P&L, Today's Net Realized P&L, Margin Used / Available, and Win Rate.
- **Interactive Nifty Spot Chart**: SVG candlestick chart with timeframe selector (1m, 5m, 15m, 1h), VWAP indicator toggle, active strike crosshair markers, and timeline axis.
- **Active Position Card**: Directional Call / Put position monitor with real-time unrealized P&L, stoploss, trailing stoploss, target, and 1-click square-off.
- **Active Strategy Card**: Shows active strategy status (Running / Stopped), lot size, and 5-min trend confluence.
- **Directional Manual Order Panel**: Instant 1-click ATM Call / Put execution with automatic strike selection (rounded to nearest 50 points), lot multiplier selector, and estimated margin preview.

### 4. **Orders Page** (`/orders`)
- Filter tabs: **Placed Orders**, **Closed Orders**, and **Rejected Orders**.
- Search query filter by symbol or order ID.
- Tabular details: Execution Time, Order ID, Symbol, Type (CE/PE), Qty / Lots, Execution & Exit Price, Status badges, and Realized P&L.

### 5. **P&L Analytics & Equity Curve** (`/pnl`)
- Period tabs: **Monthly**, **6 Months**, and **Yearly**.
- Institutional metrics: Net Realized P&L, Gross P&L, Win Rate (W/L breakdown), Profit Factor, Max Drawdown (% and ₹), and Avg Win/Loss.
- **Dynamic Equity Curve**: SVG cumulative equity curve with gradient shading, drawdown fill, and interactive inspection nodes.
- **Session Journal Ledger**: Daily breakdown table listing profit/drawdown status and session P&L.

### 6. **Strategy Configuration** (`/strategy`)
- Default Strategy: *"Directional Nifty Intraday – Buy Call or Put based on trend"*.
- Interactive Lot Size Multiplier with quick `+/-` adjustments and automatic share quantity conversion.
- Live Start / Stop automation controls with engine status telemetry.
- Detailed logic architecture: 5-min Supertrend (10, 2) + 15-min EMA 20 confluence rules and 1:2 R:R guidelines.
- 12-month backtest benchmark statistics.

### 7. **Broker & Risk Settings** (`/settings`)
- **Upstox API Connection**: API Key, API Secret (with toggleable visibility), Redirect URL (with 1-click clipboard copy), and reconnect action.
- **Risk Management**: Configurable Stoploss points / %, and Maximum Daily Loss circuit breaker.
- **Kill Switch Safeguards**: Emergency exit panel and automated stoploss protection toggle.

### 8. **Connection Lost Handling & Data Integrity**
- When broker connection is lost:
  - Clear **"Connection Lost"** alert pill displayed in the top bar.
  - Dedicated **"No Data Available &bull; Upstox Disconnected"** state displayed across Dashboard, Orders, P&L, and Chart views.
  - **No fake or simulated numbers are displayed when disconnected.**
  - Order execution and Kill switch triggers are disabled with descriptive guidance.

---

## 🛠️ Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS (`bg-slate-950`, `bg-slate-900`, `border-slate-800`, emerald/rose accents)
- **Icons**: Lucide React
- **State Management**: React Context (`TradingContext`) with real-time mock price ticking, order routing simulation, and interactive connection toggles.

---

## 🚀 Running the Development Server

```bash
# Install dependencies (if not already installed)
npm install

# Start development server
npm run dev
```

Open [http://localhost:3005](http://localhost:3005) with your browser.
To view the login screen directly, visit [http://localhost:3005/login](http://localhost:3005/login).

