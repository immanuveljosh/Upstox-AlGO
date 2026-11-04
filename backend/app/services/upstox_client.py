import logging
from typing import Optional, Dict, Any, List
import httpx
from backend.app.core.config import settings

logger = logging.getLogger("algo_trader.upstox")


class UpstoxClient:
    """Async client for Upstox v2 Open API."""

    def __init__(self, base_url: str = settings.UPSTOX_BASE_URL):
        self.base_url = base_url.rstrip("/")
        self.timeout = httpx.Timeout(10.0, connect=5.0)

    def _headers(self, access_token: str) -> Dict[str, str]:
        return {
            "Accept": "application/json",
            "Authorization": f"Bearer {access_token}",
        }

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
            resp.raise_for_status()
            return resp.json()

    async def get_profile(self, access_token: str) -> Dict[str, Any]:
        """Fetch logged-in user profile from Upstox."""
        url = f"{self.base_url}/user/profile"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(url, headers=self._headers(access_token))
            resp.raise_for_status()
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

    async def get_historical_candles(
        self,
        instrument_key: str,
        interval: str = "5minute",
        to_date: str = "2026-11-03",
        from_date: str = "2026-10-15",
    ) -> List[List[Any]]:
        """Fetch historical V2 candles."""
        url = f"{self.base_url}/historical-candle/{instrument_key}/{interval}/{to_date}/{from_date}"
        headers = {"Accept": "application/json"}
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                return data.get("data", {}).get("candles", [])
            return []


upstox_client = UpstoxClient()

