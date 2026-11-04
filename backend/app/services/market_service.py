from datetime import datetime
from typing import Dict, Any, List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.services.broker_service import broker_service
from backend.app.services.upstox_client import upstox_client
from backend.app.services.strategy_service import strategy_service, format_ist_display
from backend.app.strategy.nifty_directional import (
    IST,
    ITM_DEPTH,
    SIGNAL_CALL,
    SIGNAL_PUT,
    SIGNAL_NO_TRADE,
    classify_signal,
    select_atm_strike,
    select_itm_strike,
    ist_now,
)
from backend.app.core.logging import logger


class MarketService:
    """Provides Nifty spot quotes, Gift Nifty 1-Day telemetry, and ITM 3 option contracts."""

    async def get_nifty_spot(self, db: AsyncSession) -> Dict[str, Any]:
        """Fetch real-time Nifty 50 spot price directly from Upstox OMS. Returns connection_lost if offline."""
        is_connected, msg, _, _ = await broker_service.verify_connection(db)
        if not is_connected:
            return {
                "connection_status": "connection_lost",
                "data": None,
                "message": msg or "Broker connection lost. No market data available.",
            }

        token_record = await broker_service.get_or_create_token_record(db)

        try:
            quote_resp = await upstox_client.get_market_quote(
                token_record.access_token, "NSE_INDEX|Nifty 50"
            )
            quote_data = quote_resp.get("data", {}).get("NSE_INDEX:Nifty 50", {})
            if not quote_data or not quote_data.get("last_price"):
                return {
                    "connection_status": "connection_lost",
                    "data": None,
                    "message": "Live quote unavailable from Upstox.",
                }

            spot_price = float(quote_data.get("last_price"))
            change = float(quote_data.get("net_change") or 0.0)
            ohlc = quote_data.get("ohlc", {})
            prev_close = float(ohlc.get("close") or (spot_price - change))
            change_pct = round((change / prev_close) * 100, 2) if prev_close else 0.0
            atm_strike = int(round(spot_price / 50.0) * 50)

            return {
                "connection_status": "connected",
                "data": {
                    "symbol": "NIFTY 50",
                    "spot_price": spot_price,
                    "change": change,
                    "change_pct": change_pct,
                    "timestamp": format_ist_display(ist_now()) or "",
                    "atm_strike": atm_strike,
                },
                "message": "Nifty spot quote retrieved.",
            }
        except Exception as exc:
            logger.warning(f"Error fetching live Upstox quote: {str(exc)}")
            return {
                "connection_status": "connection_lost",
                "data": None,
                "message": f"Error fetching live quote: {str(exc)}",
            }

    async def get_gift_nifty_1day(self, db: AsyncSession) -> Dict[str, Any]:
        """
        Fetch actual Gift Nifty 1-Day value and day change in points.
        Never fabricates Gift Nifty values.
        """
        snap = await strategy_service.get_gift_nifty_snapshot(db)
        pts = snap.get("change_points")
        prev_c = snap.get("prev_close")
        curr_v = snap.get("current_value")
        sig = classify_signal(pts, 80.0)

        if pts is None:
            sig_status = "DATA_UNAVAILABLE"
            pct = None
        else:
            if sig == SIGNAL_CALL:
                sig_status = "CALL_TRIGGER_ACTIVE"
            elif sig == SIGNAL_PUT:
                sig_status = "PUT_TRIGGER_ACTIVE"
            else:
                sig_status = "NEUTRAL_WAIT"
            pct = round((pts / prev_c) * 100.0, 2) if (prev_c and prev_c > 0) else None

        return {
            "connection_status": "connected" if snap.get("status") == "AVAILABLE" else "connection_lost",
            "data": {
                "symbol": "GIFT NIFTY",
                "timeframe": "1 Day",
                "status": snap.get("status", "DATA UNAVAILABLE"),
                "current_value": curr_v,
                "prev_close": prev_c,
                "day_change_points": pts,
                "day_change_pct": pct,
                "threshold_pts": 80.0,
                "signal": sig,
                "signal_status": sig_status,
                "source": snap.get("source"),
                "timestamp": snap.get("observed_at") or (format_ist_display(ist_now()) or ""),
            },
            "message": snap.get("message", "Gift Nifty status retrieved."),
        }

    async def get_itm3_option_chain(self, db: AsyncSession) -> Dict[str, Any]:
        """
        Fetch Option Chain specifically filtered for the required ITM 3 strikes directly from Upstox API.
        Never uses fake spot prices or fake option premiums.
        """
        is_connected, msg, _, _ = await broker_service.verify_connection(db)
        if not is_connected:
            return {
                "connection_status": "connection_lost",
                "data": None,
                "message": msg or "Broker connection lost. Option chain unavailable.",
            }

        spot_res = await self.get_nifty_spot(db)
        spot_data = spot_res.get("data")
        if not spot_data or not spot_data.get("spot_price"):
            return {
                "connection_status": "connection_lost",
                "data": None,
                "message": "Live NIFTY 50 spot price unavailable from Upstox.",
            }

        spot_price = float(spot_data["spot_price"])
        token_record = await broker_service.get_or_create_token_record(db)

        try:
            contracts = await upstox_client.get_option_contracts(
                token_record.access_token, "NSE_INDEX|Nifty 50"
            )
            now_str = ist_now().strftime("%Y-%m-%d")
            valid = [c for c in contracts if c.get("expiry") and c.get("expiry") >= now_str]
            valid.sort(key=lambda x: str(x.get("expiry")))
            nearest_expiry = valid[0].get("expiry") if valid else None

            if not nearest_expiry:
                return {
                    "connection_status": "connection_lost",
                    "data": None,
                    "message": "No active NIFTY option expiry returned by Upstox.",
                }

            exp_contracts = [c for c in valid if c.get("expiry") == nearest_expiry]
            chain_strikes = sorted({float(c.get("strike_price", 0)) for c in exp_contracts if c.get("strike_price")})

            atm_strike = int(round(select_atm_strike(chain_strikes, spot_price)))
            call_itm3_f = select_itm_strike(chain_strikes, spot_price, "CE", depth=ITM_DEPTH)
            put_itm3_f = select_itm_strike(chain_strikes, spot_price, "PE", depth=ITM_DEPTH)

            call_itm3_strike = int(round(call_itm3_f)) if call_itm3_f is not None else strategy_service.calculate_itm3_strike(spot_price, "CE")
            put_itm3_strike = int(round(put_itm3_f)) if put_itm3_f is not None else strategy_service.calculate_itm3_strike(spot_price, "PE")

            c_ce = next(
                (
                    c for c in exp_contracts
                    if int(round(float(c.get("strike_price", 0)))) == call_itm3_strike
                    and str(c.get("instrument_type", "")).upper() == "CE"
                ),
                None,
            )
            c_pe = next(
                (
                    c for c in exp_contracts
                    if int(round(float(c.get("strike_price", 0)))) == put_itm3_strike
                    and str(c.get("instrument_type", "")).upper() == "PE"
                ),
                None,
            )

            call_contract: Optional[Dict[str, Any]] = None
            put_contract: Optional[Dict[str, Any]] = None
            keys_to_quote: List[str] = []

            if c_ce:
                keys_to_quote.append(c_ce["instrument_key"])
                call_contract = {
                    "strike": call_itm3_strike,
                    "option_type": "CE",
                    "moneyness": "ITM 3",
                    "symbol": c_ce.get("trading_symbol", f"NIFTY {call_itm3_strike} CE"),
                    "instrument_key": c_ce["instrument_key"],
                    "expiry": nearest_expiry,
                    "lot_size": int(c_ce.get("lot_size") or 65),
                    "freeze_quantity": int(float(c_ce.get("freeze_quantity") or 1755)),
                    "ltp": None,
                    "bid": None,
                    "ask": None,
                    "open_interest": 0,
                    "volume": 0,
                }
            if c_pe:
                keys_to_quote.append(c_pe["instrument_key"])
                put_contract = {
                    "strike": put_itm3_strike,
                    "option_type": "PE",
                    "moneyness": "ITM 3",
                    "symbol": c_pe.get("trading_symbol", f"NIFTY {put_itm3_strike} PE"),
                    "instrument_key": c_pe["instrument_key"],
                    "expiry": nearest_expiry,
                    "lot_size": int(c_pe.get("lot_size") or 65),
                    "freeze_quantity": int(float(c_pe.get("freeze_quantity") or 1755)),
                    "ltp": None,
                    "bid": None,
                    "ask": None,
                    "open_interest": 0,
                    "volume": 0,
                }

            if keys_to_quote:
                quotes_resp = await upstox_client.get_market_quote(
                    token_record.access_token, ",".join(keys_to_quote)
                )
                qdata = quotes_resp.get("data", {})
                for _, q in qdata.items():
                    itoken = q.get("instrument_token")
                    target = (
                        call_contract
                        if (call_contract and itoken == call_contract["instrument_key"])
                        else (put_contract if (put_contract and itoken == put_contract["instrument_key"]) else None)
                    )
                    if target is not None:
                        target["ltp"] = float(q["last_price"]) if q.get("last_price") else None
                        target["open_interest"] = int(q.get("oi") or 0)
                        target["volume"] = int(q.get("volume") or 0)
                        depth = q.get("depth", {})
                        bids = depth.get("buy", [])
                        asks = depth.get("sell", [])
                        target["bid"] = float(bids[0]["price"]) if (bids and bids[0].get("price")) else None
                        target["ask"] = float(asks[0]["price"]) if (asks and asks[0].get("price")) else None

            return {
                "connection_status": "connected",
                "data": {
                    "underlying": "NIFTY 50",
                    "spot_price": spot_price,
                    "atm_strike": atm_strike,
                    "expiry": nearest_expiry,
                    "call_itm3": call_contract,
                    "put_itm3": put_contract,
                    "selection_rule": "ITM 3 dynamically calculated from live NIFTY option chain",
                },
                "message": "ITM 3 option contracts retrieved from Upstox.",
            }
        except Exception as exc:
            logger.warning(f"Error resolving real Upstox ITM 3 quotes: {exc}")
            return {
                "connection_status": "connection_lost",
                "data": None,
                "message": f"Error resolving option chain: {str(exc)}",
            }

    async def get_funds(self, db: AsyncSession) -> Dict[str, Any]:
        """Fetch real-time funds and margin from Upstox."""
        is_connected, msg, _, _ = await broker_service.verify_connection(db)
        if not is_connected:
            return {
                "connection_status": "connection_lost",
                "data": None,
                "message": msg or "Broker connection lost.",
            }

        token_record = await broker_service.get_or_create_token_record(db)
        try:
            funds_resp = await upstox_client.get_funds(token_record.access_token)
            data = funds_resp.get("data", {})
            eq = data.get("equity", {})
            return {
                "connection_status": "connected",
                "data": {
                    "available_margin": float(eq.get("available_margin") or 0.0),
                    "used_margin": float(eq.get("used_margin") or 0.0),
                    "payin_amount": float(eq.get("payin_amount") or 0.0),
                    "span_margin": float(eq.get("span_margin") or 0.0),
                    "exposure_margin": float(eq.get("exposure_margin") or 0.0),
                    "raw": data,
                },
                "message": "Upstox funds retrieved.",
            }
        except Exception as exc:
            return {
                "connection_status": "connection_lost",
                "data": None,
                "message": str(exc),
            }

    async def get_historical_candles(
        self,
        db: AsyncSession,
        interval: str = "day",
        to_date: str = "2026-11-03",
        from_date: str = "2026-10-15",
    ) -> Dict[str, Any]:
        """Fetch historical candles for NIFTY 50."""
        token_record = await broker_service.get_or_create_token_record(db)
        access_token = token_record.access_token if (token_record and token_record.access_token) else None
        raw_candles = await upstox_client.get_historical_candles(
            "NSE_INDEX|Nifty 50", interval, to_date, from_date, access_token=access_token
        )

        formatted_candles = []
        for c in raw_candles:
            if len(c) >= 6:
                formatted_candles.append({
                    "time": str(c[0]),
                    "open": float(c[1]),
                    "high": float(c[2]),
                    "low": float(c[3]),
                    "close": float(c[4]),
                    "volume": int(c[5]),
                })

        return {
            "connection_status": "connected" if formatted_candles else "connection_lost",
            "data": formatted_candles,
            "message": f"Retrieved {len(formatted_candles)} historical candles.",
        }


market_service = MarketService()
