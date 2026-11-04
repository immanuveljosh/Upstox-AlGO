import logging
from urllib.parse import quote
from typing import Optional, Dict, Any, List
import httpx
from backend.app.core.config import settings

logger = logging.getLogger("algo_trader.upstox")


class UpstoxAuthException(Exception):
    """Raised when Upstox authentication or token validation fails."""

    def __init__(self, message: str, status_code: int = 401, error_code: str = ""):
        super().__init__(message)
        self.status_code = status_code
        self.error_code = error_code


class UpstoxClient:
    """Async client for Upstox v2 / v3 Open API."""

    def __init__(self, base_url: str = settings.UPSTOX_BASE_URL):
        self.base_url = base_url.rstrip("/")
        self.timeout = httpx.Timeout(12.0, connect=5.0)

    def _headers(self, access_token: Optional[str] = None) -> Dict[str, str]:
        headers = {"Accept": "application/json"}
        if access_token:
            headers["Authorization"] = f"Bearer {access_token}"
        return headers

    async def exchange_token(
        self,
        code: str,
        client_id: str,
        client_secret: str,
        redirect_uri: str,
    ) -> Dict[str, Any]:
        """Exchange OAuth authorization code for access token."""
        url = f"{self.base_url}/login/authorization/token"
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
        }
        data = {
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        }
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(url, headers=headers, data=data)
            if resp.status_code != 200:
                err_msg = "OAuth token exchange rejected by Upstox"
                err_code = "UDAPI_AUTH_ERROR"
                try:
                    err_json = resp.json()
                    errors = err_json.get("errors", [])
                    if errors and isinstance(errors, list):
                        first = errors[0]
                        err_msg = first.get("message") or err_msg
                        err_code = first.get("errorCode") or first.get("error_code") or err_code
                except Exception:
                    pass
                raise UpstoxAuthException(
                    f"{err_msg} (code: {err_code})",
                    status_code=resp.status_code,
                    error_code=err_code,
                )
            return resp.json()

    async def get_profile(self, access_token: str) -> Dict[str, Any]:
        """Fetch logged-in user profile from Upstox."""
        url = f"{self.base_url}/user/profile"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(url, headers=self._headers(access_token))
            if resp.status_code != 200:
                err_msg = "Invalid token used to access API"
                err_code = "UDAPI100050"
                try:
                    err_json = resp.json()
                    errors = err_json.get("errors", [])
                    if errors and isinstance(errors, list):
                        first = errors[0]
                        err_msg = first.get("message") or err_msg
                        err_code = first.get("errorCode") or first.get("error_code") or err_code
                except Exception:
                    pass
                raise UpstoxAuthException(
                    f"{err_msg} (code: {err_code})",
                    status_code=resp.status_code,
                    error_code=err_code,
                )
            return resp.json()

    async def get_funds(self, access_token: str) -> Dict[str, Any]:
        """Fetch user funds and available margin."""
        url = f"{self.base_url}/user/get-funds-and-margin"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(url, headers=self._headers(access_token))
            resp.raise_for_status()
            return resp.json()

    async def place_order(self, access_token: str, order_payload: Dict[str, Any]) -> Dict[str, Any]:
        """Submit new order to Upstox OMS."""
        url = f"{self.base_url}/order/place"
        headers = self._headers(access_token)
        headers["Content-Type"] = "application/json"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(url, headers=headers, json=order_payload)
            resp.raise_for_status()
            return resp.json()

    async def modify_order(self, access_token: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Modify open order."""
        url = f"{self.base_url}/order/modify"
        headers = self._headers(access_token)
        headers["Content-Type"] = "application/json"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.put(url, headers=headers, json=payload)
            resp.raise_for_status()
            return resp.json()

    async def cancel_order(self, access_token: str, order_id: str) -> Dict[str, Any]:
        """Cancel an open order."""
        url = f"{self.base_url}/order/cancel"
        params = {"order_id": order_id}
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.delete(url, headers=self._headers(access_token), params=params)
            resp.raise_for_status()
            return resp.json()

    async def get_orders(self, access_token: str) -> List[Dict[str, Any]]:
        """Fetch today's order book from Upstox."""
        url = f"{self.base_url}/order/retrieve-all"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(url, headers=self._headers(access_token))
            resp.raise_for_status()
            data = resp.json()
            return data.get("data", [])

    async def get_positions(self, access_token: str) -> List[Dict[str, Any]]:
        """Fetch current positions from Upstox portfolio."""
        url = f"{self.base_url}/portfolio/short-term-positions"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(url, headers=self._headers(access_token))
            resp.raise_for_status()
            data = resp.json()
            return data.get("data", [])

    async def get_market_quote(self, access_token: str, instrument_keys: str) -> Dict[str, Any]:
        """Fetch live market quote."""
        url = f"{self.base_url}/market-quote/quotes"
        params = {"instrument_key": instrument_keys}
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(url, headers=self._headers(access_token), params=params)
            resp.raise_for_status()
            return resp.json()

    async def get_gift_nifty_quote(self, access_token: str) -> Optional[Dict[str, Any]]:
        """
        Attempt to fetch live GIFT NIFTY quote from Upstox Global Instruments
        (`GLOBAL_INDEX|SGX NIFTY`). Returns None if unavailable.
        """
        for key in ("GLOBAL_INDEX|SGX NIFTY", "GLOBAL_INDEX|GIFT NIFTY"):
            try:
                resp = await self.get_market_quote(access_token, key)
                data = resp.get("data") or {}
                if data:
                    first = list(data.values())[0]
                    if first and first.get("last_price"):
                        return first
            except Exception as exc:
                logger.debug(f"Gift Nifty quote probe ({key}): {exc}")
        return None

    async def get_option_contracts(
        self,
        access_token: str,
        instrument_key: str = "NSE_INDEX|Nifty 50",
        expiry_date: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Fetch official option contract metadata (including lot_size & freeze_quantity) from Upstox."""
        url = f"{self.base_url}/option/contract"
        params: Dict[str, Any] = {"instrument_key": instrument_key}
        if expiry_date:
            params["expiry_date"] = expiry_date
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(url, headers=self._headers(access_token), params=params)
            resp.raise_for_status()
            data = resp.json()
            return data.get("data", [])

    async def get_option_chain(
        self,
        access_token: str,
        instrument_key: str = "NSE_INDEX|Nifty 50",
        expiry_date: str = "",
    ) -> List[Dict[str, Any]]:
        """Fetch live Put/Call option chain with market data and greeks from Upstox `/v2/option/chain`."""
        url = f"{self.base_url}/option/chain"
        params = {"instrument_key": instrument_key, "expiry_date": expiry_date}
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(url, headers=self._headers(access_token), params=params)
            resp.raise_for_status()
            data = resp.json()
            return data.get("data", [])

    async def get_expired_expiries(
        self,
        access_token: str,
        instrument_key: str = "NSE_INDEX|Nifty 50",
    ) -> List[str]:
        """Fetch historical expired expiry dates from `/v2/expired-instruments/expiries`."""
        url = f"{self.base_url}/expired-instruments/expiries"
        params = {"instrument_key": instrument_key}
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(url, headers=self._headers(access_token), params=params)
            if resp.status_code == 200:
                return resp.json().get("data", []) or []
            return []

    async def get_expired_option_contracts(
        self,
        access_token: str,
        instrument_key: str = "NSE_INDEX|Nifty 50",
        expiry_date: str = "",
    ) -> List[Dict[str, Any]]:
        """Fetch expired option contracts for a specific expiry date from `/v2/expired-instruments/option/contract`."""
        url = f"{self.base_url}/expired-instruments/option/contract"
        params = {"instrument_key": instrument_key, "expiry_date": expiry_date}
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(url, headers=self._headers(access_token), params=params)
            if resp.status_code == 200:
                return resp.json().get("data", []) or []
            return []

    async def get_expired_historical_candles(
        self,
        access_token: str,
        expired_instrument_key: str,
        interval: str = "1minute",
        to_date: str = "",
        from_date: str = "",
    ) -> List[List[Any]]:
        """Fetch historical OHLC candles for an expired option contract."""
        encoded_key = quote(expired_instrument_key, safe="")
        url = f"{self.base_url}/expired-instruments/historical-candle/{encoded_key}/{interval}/{to_date}/{from_date}"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(url, headers=self._headers(access_token))
            if resp.status_code == 200:
                return resp.json().get("data", {}).get("candles", []) or []
            return []

    async def get_historical_candles(
        self,
        instrument_key: str,
        interval: str = "day",
        to_date: str = "2026-11-03",
        from_date: str = "2026-10-15",
        access_token: Optional[str] = None,
    ) -> List[List[Any]]:
        """Fetch historical V2 candles."""
        encoded_key = quote(instrument_key, safe="")
        url = f"{self.base_url}/historical-candle/{encoded_key}/{interval}/{to_date}/{from_date}"
        headers = {"Accept": "application/json"}
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                return data.get("data", {}).get("candles", [])
            return []


upstox_client = UpstoxClient()
