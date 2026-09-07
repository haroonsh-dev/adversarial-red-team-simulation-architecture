"""API Key Authentication Middleware."""

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from src.core.auth_credentials import (
    any_static_api_key_configured,
    extract_bearer_token,
    resolve_auth_method,
    resolve_credentials,
)
from src.core.config import settings

_PUBLIC_PATHS = {
    "/",
    "/health",
    "/ready",
    "/api/v1/health",
    "/v1/health",
    "/api/v1/ready",
    "/v1/ready",
    "/api/v1/metrics/prometheus",
    "/v1/metrics/prometheus",
    "/api/v1/config/me",
    "/v1/config/me",
    "/api/v1/auth/login",
    "/v1/auth/login",
    "/api/v1/auth/register",
    "/v1/auth/register",
    "/api/v1/auth/status",
    "/v1/auth/status",
    "/docs",
    "/openapi.json",
    "/redoc",
}


def is_devtools_probe(path: str) -> bool:
    """Chrome/Cursor probes localhost ports for ``/json/version`` (CDP)."""
    return path == "/json" or path.startswith("/json/")


def is_public_path(path: str) -> bool:
    """Paths that skip API-key / OIDC checks."""
    return path in _PUBLIC_PATHS or is_devtools_probe(path)


class APIKeyAuthMiddleware(BaseHTTPMiddleware):
    """Validates X-API-Key or OIDC Bearer token when auth is required."""

    async def dispatch(self, request: Request, call_next):
        # Browser CORS preflight must not require credentials — otherwise
        # clients (e.g. Harness on :3080) see opaque "Failed to fetch".
        if request.method == "OPTIONS":
            return await call_next(request)

        path = request.url.path
        if is_public_path(path):
            return await call_next(request)

        api_key = request.headers.get("X-API-Key")
        bearer = extract_bearer_token(request.headers.get("Authorization"))

        if settings.auth_required or any_static_api_key_configured() or settings.ARTSA_OIDC_ENABLED:
            if settings.auth_required and not any_static_api_key_configured() and not settings.ARTSA_OIDC_ENABLED:
                return JSONResponse(
                    status_code=503,
                    content={"detail": "Server misconfigured: configure API keys or enable OIDC"},
                )

            role = resolve_credentials(api_key, bearer)
            if role is None:
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Invalid or missing credentials (X-API-Key or Bearer token)"},
                )
            request.state.role = role.value
            request.state.auth_method = resolve_auth_method(api_key, bearer)

        return await call_next(request)
