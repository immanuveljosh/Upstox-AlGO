# Bug Hunter Report

- Findings reviewed: 8
- Confirmed: 8
- Dismissed: 0
- Manual review: 0
- Unreviewed: 0

## Confirmed Bugs
- BUG-1 | High | backend/app/api/v1/auth.py | Unauthenticated SSRF vulnerability in webhook validation endpoint with disabled TLS verification allows probing internal networks.
  Confidence: 92 (high) | INDEPENDENTLY_VERIFIED
  Analysis: High: unauthenticated SSRF vulnerability. Endpoint POST /api/v1/auth/webhook/validate in backend/app/api/v1/auth.py:363-425 accepts arbitrary user-supplied URLs without authentication and tests connectivity with verify=False, only blocking literal localhost string matches without resolving IP addresses or filtering private/link-local IPv4/IPv6 networks.
- BUG-2 | High | backend/app/services/order_service.py | Order cancellation passes internal client_order_id to Upstox API instead of Upstox order_id, causing Upstox OMS order cancellation to fail silently while marking order as cancelled locally.
  Confidence: 96 (high) | INDEPENDENTLY_VERIFIED
  Analysis: High: API contract and state desynchronization defect. In backend/app/services/order_service.py:350, cancel_order sends the local client_order_id ('UPX-...') to Upstox's /order/cancel API, which expects Upstox's OMS order_id. Upstox rejects the cancellation, the error is swallowed, and the local DB unconditionally sets status='CANCELLED', creating a false cancellation state while the order remains live with Upstox.
- BUG-3 | High | backend/app/services/order_service.py | Race condition in daily trade limit check allows multiple concurrent order placements, violating the strategy invariant of maximum 1 trade per day.
  Confidence: 90 (high) | INDEPENDENTLY_VERIFIED
  Analysis: High: concurrency race condition on strategy execution bounds. In backend/app/services/order_service.py:38-46 and 124-126, place_directional_order checks and updates config.trades_executed_today without synchronization or row-level locking. Multiple rapid requests can execute concurrently, exceeding the strict 1 trade per day invariant.
- BUG-4 | Medium | src/app/login/page.tsx | Hardcoded Upstox Client ID in frontend login fallback leaks credential into client bundle.
  Confidence: 88 (high) | INDEPENDENTLY_VERIFIED
  Analysis: Medium: hard-coded credential / API identifier. In src/app/login/page.tsx:44 and 50, a specific client_id '22e100c2-59e7-4d4d-98a0-d69ae3b08c87' is hardcoded in the client bundle as an offline fallback, exposing application metadata and bypassing dynamic backend settings.
- BUG-5 | High | src/app/login/page.tsx | Client-side authentication bypass routes unauthenticated users to connected dashboard upon backend network or API failure.
  Confidence: 95 (high) | INDEPENDENTLY_VERIFIED
  Analysis: High: client-side authentication bypass / state spoofing. In src/app/login/page.tsx:77-82, the catch block of handleManualTokenSubmit silently invokes router.push('/?auth=connected') whenever the backend verification fails or throws an exception, placing unverified sessions into connected state.
- BUG-6 | Critical | backend/app/services/strategy_service.py | Automated position square-off passes invalid instrument_token to Upstox OMS and swallows order rejection, leaving live positions unclosed while marking them CLOSED locally.
  Confidence: 97 (high) | INDEPENDENTLY_VERIFIED
  Analysis: Critical: silent failure on position square-off path leading to unmanaged market risk. In backend/app/services/strategy_service.py:1029, the automated stop loss and target exit order is formatted with '"instrument_token": f"NSE_FO|{open_order.symbol}"' which is rejected by Upstox OMS. The exception is swallowed in line 1037 and the order is marked CLOSED locally, leaving live positions unprotected against further losses.
- BUG-7 | High | backend/app/services/strategy_service.py | Position monitoring queries live option quotes using trading symbol instead of instrument key, preventing real-time Stop Loss and Target tracking.
  Confidence: 94 (high) | INDEPENDENTLY_VERIFIED
  Analysis: High: API contract violation preventing real-time Stop Loss and Target tracking. In backend/app/services/strategy_service.py:995, run_monitoring_tick calls upstox_client.get_market_quote with open_order.symbol instead of a valid instrument_key (e.g. 'NSE_FO|52345'). Upstox returns empty/error, preventing current_ltp from updating and disabling automated risk limit checks.
- BUG-8 | High | src/components/settings/KillSwitchSettings.tsx | KillSwitchSettings calls non-existent endpoint /api/v1/strategy/square-off causing emergency square-off requests to fail with HTTP 404.
  Confidence: 96 (high) | INDEPENDENTLY_VERIFIED
  Analysis: High: dead API route causes emergency liquidation to fail with HTTP 404. In src/components/settings/KillSwitchSettings.tsx:17, handleEmergencySquareOff calls POST /api/v1/strategy/square-off, which is not implemented by the backend router. The real endpoints are /api/v1/risk/kill-switch and /api/v1/orders/exit-all.

## Manual Review
- None

## Dismissed Findings
- None

## Unreviewed Findings
- None
