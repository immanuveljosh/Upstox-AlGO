import base64
import hashlib
from typing import Optional
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import Text, TypeDecorator
from backend.app.core.config import settings

ENCRYPTED_PREFIX = "enc:v1:"


def _get_fernet() -> Fernet:
    """
    Derive a valid 32-byte URL-safe base64 Fernet key from configured
    TOKEN_ENCRYPTION_KEY or JWT_SECRET_KEY.
    """
    raw_secret = getattr(settings, "TOKEN_ENCRYPTION_KEY", "") or settings.JWT_SECRET_KEY
    digest = hashlib.sha256(raw_secret.encode("utf-8")).digest()
    fernet_key = base64.urlsafe_b64encode(digest)
    return Fernet(fernet_key)


def encrypt_token(plaintext: Optional[str]) -> Optional[str]:
    """Encrypt a token string at rest using Fernet (AES-128-CBC + HMAC-SHA256)."""
    if plaintext is None:
        return None
    cleaned = plaintext.strip()
    if not cleaned:
        return ""
    if cleaned.startswith(ENCRYPTED_PREFIX):
        return cleaned
    fernet = _get_fernet()
    encrypted_bytes = fernet.encrypt(cleaned.encode("utf-8"))
    return f"{ENCRYPTED_PREFIX}{encrypted_bytes.decode('utf-8')}"


def decrypt_token(stored_value: Optional[str]) -> Optional[str]:
    """
    Decrypt an encrypted token string.
    Gracefully handles legacy unencrypted tokens for seamless migration.
    """
    if stored_value is None:
        return None
    cleaned = stored_value.strip()
    if not cleaned:
        return None
    if not cleaned.startswith(ENCRYPTED_PREFIX):
        return cleaned
    cipher_part = cleaned[len(ENCRYPTED_PREFIX):]
    try:
        fernet = _get_fernet()
        decrypted_bytes = fernet.decrypt(cipher_part.encode("utf-8"))
        return decrypted_bytes.decode("utf-8")
    except (InvalidToken, Exception):
        return None


def is_encrypted_at_rest(raw_db_value: Optional[str]) -> bool:
    """Verify whether a raw database value is encrypted with the v1 Fernet prefix."""
    return bool(raw_db_value and raw_db_value.startswith(ENCRYPTED_PREFIX))


def hash_token(token: str) -> str:
    """Generate SHA-256 digest of a token for idempotency tracking without storing plaintext."""
    return hashlib.sha256(token.strip().encode("utf-8")).hexdigest()


def mask_token(token: Optional[str]) -> str:
    """Safely mask a token for UI display without exposing sensitive characters."""
    if not token:
        return ""
    t = token.strip()
    if len(t) > 16:
        return f"{t[:6]}••••••••{t[-4:]}"
    return "••••••••••••"


class EncryptedText(TypeDecorator):
    """SQLAlchemy column type that transparently encrypts values at rest and decrypts on load."""

    impl = Text
    cache_ok = True

    def process_bind_param(self, value: Optional[str], dialect) -> Optional[str]:
        if value is None:
            return None
        return encrypt_token(value)

    def process_result_value(self, value: Optional[str], dialect) -> Optional[str]:
        if value is None:
            return None
        return decrypt_token(value)
