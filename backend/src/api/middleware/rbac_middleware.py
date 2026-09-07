"""RBAC middleware — enforces role permissions after authentication."""

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from src.core.auth_credentials import (
    any_static_api_key_configured,
    extract_bearer_token,
    resolve_credentials,
)
from src.core.config import settings
from src.api.middleware.auth import is_public_path
from src.core.rbac import is_allowed, normalize_path

_PUBLIC_PATHS = {
    "/",
    "/health",
    "/ready",
    "/config/me",
    "/auth/login",
    "/auth/register",
    "/auth/status",
    "/docs",
    "/openapi.json",
    "/redoc",
    "/metrics/prometheus",
}


class RBACMiddleware(BaseHTTPMiddleware):
    """Deny requests when the resolved role lacks permission for method+path."""

    async def dispatch(self, request: Request, call_next):
        # CORS preflight is unauthenticated; RBAC applies to the real request.
        if request.method == "OPTIONS":
            return await call_next(request)

        path = normalize_path(request.url.path)
        if path in _PUBLIC_PATHS or is_public_path(request.url.path):
            return await call_next(request)

        if not settings.auth_required and not any_static_api_key_configured() and not settings.ARTSA_OIDC_ENABLED:
            return await call_next(request)

        api_key = request.headers.get("X-API-Key")
        bearer = extract_bearer_token(request.headers.get("Authorization"))
        role = resolve_credentials(api_key, bearer)
        if role is None:
            return JSONResponse(status_code=401, content={"detail": "Invalid or missing credentials"})

        if not is_allowed(role, request.method, request.url.path):
            return JSONResponse(
                status_code=403,
                content={"detail": f"Role '{role.value}' cannot {request.method} {path}"},
            )

        request.state.role = role.value
        return await call_next(request)
