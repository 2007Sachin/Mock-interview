import json
import logging
from datetime import UTC, datetime
from typing import Any

logger = logging.getLogger("pathwisse.voice-agent")
logging.basicConfig(level=logging.INFO, format="%(message)s")


def log_event(event: str, **fields: Any) -> None:
    logger.info(
        json.dumps(
            {
                "ts": datetime.now(UTC).isoformat(),
                "event": event,
                **fields,
            },
            default=str,
            separators=(",", ":"),
        )
    )
