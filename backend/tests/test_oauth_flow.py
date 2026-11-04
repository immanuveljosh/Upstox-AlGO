import asyncio
import os
import sys
import pytest
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, os.path.abspath("."))

from backend.app.core.config import settings
from backend.app.core.database import AsyncSessionLocal
from backend.app.services.broker_service import broker_service


@pytest.mark.asyncio
async def test_oauth_url_construction():
    async with AsyncSessionLocal() as db:
        token_record = await broker_service.get_or_create_token_record(db)
        client_id = token_record.api_key or settings.UPSTOX_API_KEY
        redirect_uri = token_record.redirect_uri or settings.UPSTOX_REDIRECT_URI

        assert client_id, "Client ID must not be empty"
        assert redirect_uri, "Redirect URI must not be empty"

        # Check URL parameters
        from urllib.parse import urlencode

        params = {
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": redirect_uri,
        }
        auth_url = f"{settings.UPSTOX_BASE_URL}/login/authorization/dialog?{urlencode(params)}"
        
        parsed = urlparse(auth_url)
        assert parsed.scheme == "https"
        assert parsed.netloc == "api.upstox.com"
        assert parsed.path == "/v2/login/authorization/dialog"
        
        qs = parse_qs(parsed.query)
        assert qs["response_type"] == ["code"]
        assert qs["client_id"] == [client_id]
        assert qs["redirect_uri"] == [redirect_uri]
        print(f"[TEST PASSED] OAuth Dialog URL constructed correctly: {auth_url}")


if __name__ == "__main__":
    asyncio.run(test_oauth_url_construction())

