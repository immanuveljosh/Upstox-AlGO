import logging
import sys
from datetime import datetime


def setup_logging():
    log_format = "%(asctime)s | %(levelname)-8s | %(name)s:%(lineno)d - %(message)s"
    logging.basicConfig(
        level=logging.INFO,
        format=log_format,
        handlers=[
            logging.StreamHandler(sys.stdout),
        ],
    )
    # Set quiet level for external libraries
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.INFO)


logger = logging.getLogger("algo_trader")


def log_critical_action(action: str, details: dict):
    """Structured audit logging for mission-critical trading operations."""
    timestamp = datetime.utcnow().isoformat()
    logger.warning(
        f"[AUDIT-TRAIL] Action: {action.upper()} | Timestamp: {timestamp} | Details: {details}"
    )

