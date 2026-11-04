# AI Agent Guidelines & Installed Skills — Upstox-AlGO

This document serves as the index and rulebook for AI coding agents working on the **Upstox Algo Trading Desk** (`https://github.com/immanuveljosh/Upstox-AlGO`).

## Installed Agent Skills (`.agents/skills/`)

| Skill Name | Source Repository | Domain & Purpose |
|---|---|---|
| [`upstox-algo-strategy`](.agents/skills/upstox-algo-strategy/SKILL.md) | Project Specific | System default rules: Nifty Directional, ITM 3 strike, 65 lot size, 09:15-09:17 window, 4% SL / 5% Target. |
| [`upstox`](.agents/skills/upstox/SKILL.md) | `upstox/upstox-skills` | Official Upstox Python SDK v2, instruments, quotes, option chain, order placement, websocket feed. |
| [`fastapi`](.agents/skills/fastapi/SKILL.md) | `fastapi/fastapi` | FastAPI backend patterns, async endpoints, dependency injection, Pydantic v2 schemas. |
| [`vercel-react-best-practices`](.agents/skills/vercel-react-best-practices/SKILL.md) | `vercel-labs/agent-skills` | Next.js App Router, React 18 hooks, memoization, hydration best practices. |
| [`web-design-guidelines`](.agents/skills/web-design-guidelines/SKILL.md) | `vercel-labs/agent-skills` | Institutional trading desk styling, dark theme design, Tailwind typography, tabular numbers. |
| [`position-sizing`](.agents/skills/position-sizing/SKILL.md) | `marian2js/trading-skills` | Capital-at-risk position sizing, lot size calculations, contract freeze validation. |
| [`risk-reward-sanity-check`](.agents/skills/risk-reward-sanity-check/SKILL.md) | `marian2js/trading-skills` | Pre-trade risk validation, stop loss and target verification, P&L sanity check. |
| [`execution-plan-check`](.agents/skills/execution-plan-check/SKILL.md) | `marian2js/trading-skills` | Pre-execution safety checklist, order state validation, duplicate-fill prevention. |
| [`webapp-testing`](.agents/skills/webapp-testing/SKILL.md) | `anthropics/skills` | Web UI validation, API integration testing, automated verification. |

---

## Core Trading Rules & Invariants

1. **Strategy**: Nifty Directional (`nifty-directional`).
   - Signal: Gift Nifty 1-Day change in points (`>= +80` for Call / CE, `<= -80` for Put / PE, between `-80` and `+80` = NO TRADE).
   - Strike: **ITM 3 strictly** (calculated dynamically from the option chain).
   - Time Window: **09:15:00 to 09:17:00 AM IST** (`09:15:00` inclusive, `09:17:00` exclusive).
   - Max Trades: **1 trade per calendar trading day**.
2. **Lot Size**: NIFTY contract lot size = **65 units** (1 lot = 65, 2 lots = 130). Always validate against actual Upstox metadata.
3. **Risk Management**: Total strategy capital-based limits:
   - Stop Loss = **-4.0% of total strategy capital**.
   - Target Profit = **+5.0% of total strategy capital**.
   - Auto square-off at **15:15 IST**.
4. **Trading Modes**:
   - `BACKTEST` (Historical strategy checking with real historical candles, zero live orders).
   - `LIVE` (Real Upstox OMS routing with explicit user confirmation).
5. **Upstox OAuth**:
   - Callback URL: `http://localhost:8000/api/v1/auth/callback` (must exact-match developer.upstox.com).
