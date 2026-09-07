"""Structlog JSON Request Logging Middleware."""

import json
import logging
import time

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

from src.api.middleware.auth import is_devtools_probe

logger = logging.getLogger("artsa.requests")


class _QuietDevtoolsAccess(logging.Filter):
    """Drop Chrome/Cursor ``/json/version`` probes from uvicorn access logs."""

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            msg = record.getMessage()
        except Exception:
            return True
        return "/json/" not in msg and '"GET /json HTTP' not in msg


def quiet_devtools_probes() -> None:
    access = logging.getLogger("uvicorn.access")
    if not any(isinstance(f, _QuietDevtoolsAccess) for f in access.filters):
        access.addFilter(_QuietDevtoolsAccess())


class StructlogLoggingMiddleware(BaseHTTPMiddleware):
    """Logs HTTP request details in structured format."""

    async def dispatch(self, request: Request, call_next):
        start_time = time.perf_counter()
        response = await call_next(request)
        if is_devtools_probe(request.url.path):
            return response
        process_time_ms = (time.perf_counter() - start_time) * 1000
        logger.info(
            json.dumps(
                {
                    "method": request.method,
                    "path": request.url.path,
                    "status_code": response.status_code,
                    "latency_ms": round(process_time_ms, 2),
                    "client_ip": request.client.host if request.client else "unknown",
                }
            )
        )
        return response
