# Upstox Algo Trading Engine &bull; Gift Nifty Directional

Production-grade asynchronous FastAPI backend engineered for **Nifty Intraday Index Option Directional Trading** based on the **Gift Nifty Directional** strategy with native Upstox v2 API integration, dual-mode execution (Live & Backtest), and strict broker disconnection safety protocols.

---

## 🎯 Default Strategy: Gift Nifty Directional

The system comes pre-configured with the **Gift Nifty Directional** strategy:

| Rule | Specification |
| :--- | :--- |
| **Underlying** | NIFTY only |
| **Timeframe** | Gift Nifty 1-Day |
| **Signal Logic** | &bull; Gift Nifty &ge; **+80 pts** &rarr; **Buy Call Option**<br>&bull; Gift Nifty &le; **-80 pts** &rarr; **Buy Put Option**<br>&bull; Between -80 and +80 &rarr; **Neutral / Wait** |
| **Option Selection** | **Only ITM 3** (In-The-Money 3rd strike: Call = ATM - 150, Put = ATM + 150) |
| **Trading Window** | **09:15 AM to 09:17 AM IST** strictly |
| **Frequency** | **Maximum 1 trade per day** |
| **Risk Management** | &bull; **Stop Loss = 5% of total capital** (&minus;₹10,000 on ₹2,00,000)<br>&bull; **Target = 6% of total capital** (&plus;₹12,000 on ₹2,00,000) |
| **Product** | **MIS / I (Intraday)** |
| **Complexity** | Simple Call / Put directional only. **No multi-leg, no hedges, no complex spreads.** |

---

## ⚡ Mission-Critical Architectural Principles

1. **Strict Connection-First Telemetry**:
   Every market, order, position, and P&L endpoint checks the live broker connection before serving data. When the Upstox access token is invalid, expired, or disconnected:
   ```json
   {
     "connection_status": "connection_lost",
     "data": null,
     "message": "Broker connection lost. No data available."
   }
   ```
   **Zero cached, simulated, or fake numbers are ever returned when disconnected.**

2. **No Simulated Fills & Clean Separation of Modes**:
   - **`LIVE` Mode**: Real Upstox OMS order dispatching, real tick quotes, and live order-book management.
   - **`BACKTEST` Mode**: Read-only historical data analysis (historical candles & indicators). **Order placement is strictly rejected** to ensure integrity.

3. **Institutional Safeguards & Kill Switch**:
   - `POST /risk/kill-switch` routes instant market square-off orders for all open intraday positions and cancels pending limit orders.
   - Kill Switch is locked when disconnected to prevent orphaned commands.
   - Max daily loss circuit breaker automatically halts automated execution.

---

## 📡 REST API Reference

| Module | Method | Endpoint | Description |
| :--- | :--- | :--- | :--- |
| **Broker** | `GET` | `/broker/status` | Central token validation & connection telemetry |
| **Auth** | `GET` | `/auth/login` | Returns Upstox OAuth2 authorization URL |
| | `GET` | `/auth/callback` | Exchanges code for access_token & persists session |
| | `POST` | `/auth/token` | Manual access token update |
| | `GET` | `/auth/me` | Logged-in Upstox user profile (UCC & name) |
| **Orders** | `POST` | `/orders/place` | Place directional order (`CE` or `PE`, auto ITM 3) |
| | `POST` | `/orders/exit-all` | Emergency exit all open positions |
| | `GET` | `/orders/open` | Retrieve Placed / Open orders |
| | `GET` | `/orders/closed` | Retrieve Executed / Closed orders |
| | `GET` | `/orders/rejected` | Retrieve Rejected orders |
| | `DELETE`| `/orders/{order_id}` | Cancel an open order |
| **P&L** | `GET` | `/pnl/monthly` | Realized 30-day monthly P&L and equity curve |
| | `GET` | `/pnl/six-months`| Realized 6-month P&L and equity curve |
| | `GET` | `/pnl/yearly` | Realized 12-month yearly P&L and equity curve |
| **Strategy** | `GET` | `/strategy` | Gift Nifty Directional strategy parameters |
| | `POST`| `/strategy/start` | Start automated scanner (09:15-09:17 AM window) |
| | `POST`| `/strategy/stop` | Stop automated execution |
| | `PUT` | `/strategy/settings`| Configure Lot size, SL % (5%), Target % (6%), Capital |
| | `POST`| `/strategy/evaluate`| Evaluates +80/-80 signal, time window & 1-trade limit |
| | `POST`| `/strategy/mode` | Switch mode (`LIVE` vs `BACKTEST`) |
| **Risk** | `POST`| `/risk/kill-switch`| **Emergency exit all positions & cancel orders** |
| | `GET` | `/risk/limits` | Retrieve 5% SL & 6% Target capital parameters |
| | `PUT` | `/risk/limits` | Configure capital and risk thresholds |
| **Market** | `GET` | `/market/nifty` | Live Nifty 50 spot price & ATM strike |
| | `GET` | `/market/gift-nifty` | Gift Nifty 1-Day value & +/-80 pts signal status |
| | `GET` | `/market/option-chain`| Filtered ITM 3 Call & Put option contracts |
| | `GET` | `/market/historical-candles`| Historical candles for backtesting |
| **Settings**| `GET` | `/settings/all` | System-wide configuration |
| | `PUT` | `/settings/broker` | Update API Key, Secret & Redirect URI |

---

## 🚀 Running the Stack

Both services are ready to run:
- Double click **`start.bat`** to start both Backend (`http://localhost:8000`) and Frontend (`http://localhost:3005`).
- Double click **`stop.bat`** to stop all services.

Interactive OpenAPI Swagger UI is available at:
👉 **[http://localhost:8000/docs](http://localhost:8000/docs)**
