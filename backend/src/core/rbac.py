"""Role-based access control for ARTSA API."""

from __future__ import annotations

from enum import Enum

from src.core.config import settings


class Role(str, Enum):
    ADMIN = "admin"
    ANALYST = "analyst"
    REDTEAM = "redteam"
    READONLY = "readonly"


# HTTP method + path prefix permissions
_ROLE_PERMISSIONS: dict[Role, frozenset[str]] = {
    Role.ADMIN: frozenset({"*"}),
    Role.ANALYST: frozenset(
        {
            "GET:",
            "POST:/ingest",
            "POST:/situations",
            "POST:/forensics",
            "POST:/sessions",
            "PATCH:/auth",
            "POST:/auth",
        }
    ),
    Role.REDTEAM: frozenset(
        {
            "GET:",
            "POST:/ingest",
            "POST:/situations",
            "POST:/campaigns",
            "POST:/benchmark",
            # Registering a target and probing it are red-team operations:
            # discovery sends live traffic at the target.
            "POST:/targets",
            "PATCH:/targets",
            "DELETE:/targets",
            "PATCH:/auth",
            "POST:/auth",
        }
    ),
    Role.READONLY: frozenset({"GET:"}),
}


def resolve_role(api_key: str | None) -> Role | None:
    """Map API key to role. Returns None if key invalid when auth is enforced."""
    if not api_key:
        return None

    if settings.ARTSA_API_KEY and api_key == settings.ARTSA_API_KEY:
        return Role.ADMIN
    if settings.ARTSA_ANALYST_API_KEY and api_key == settings.ARTSA_ANALYST_API_KEY:
        return Role.ANALYST
    if settings.ARTSA_REDTEAM_API_KEY and api_key == settings.ARTSA_REDTEAM_API_KEY:
        return Role.REDTEAM
    if settings.ARTSA_READONLY_API_KEY and api_key == settings.ARTSA_READONLY_API_KEY:
        return Role.READONLY

    # Partner / Lakera-style keys issued from Settings → API Setup
    from src.services.partner_key_registry import resolve as resolve_partner_key

    partner_role = resolve_partner_key(api_key)
    if partner_role is not None:
        return partner_role

    if settings.ARTSA_API_KEY and settings.is_key_configured("ARTSA_API_KEY"):
        return None

    from src.services.partner_key_registry import has_any as partner_keys_exist

    if partner_keys_exist():
        return None

    return Role.ADMIN


def normalize_path(path: str) -> str:
    """Strip /api/v1 or /v1 prefix for permission matching."""
    for prefix in ("/api/v1", "/v1"):
        if path.startswith(prefix):
            return path[len(prefix) :] or "/"
    return path


def is_allowed(role: Role, method: str, path: str) -> bool:
    """Check if role may access method+path."""
    perms = _ROLE_PERMISSIONS.get(role, frozenset())
    if "*" in perms:
        return True

    route = normalize_path(path)
    key = f"{method.upper()}:{route}"

    for perm in perms:
        if perm.endswith(":") and perm.startswith(method.upper() + ":"):
            return True
        if perm == key:
            return True
        if perm.endswith("*") and route.startswith(perm[:-1]):
            return True
        # Prefix match e.g. POST:/campaigns matches POST:/campaigns/run
        perm_method, _, perm_path = perm.partition(":")
        if perm_method == method.upper() and route.startswith(perm_path):
            return True

    return False


def role_capabilities(role: Role) -> dict[str, bool]:
    """Frontend-friendly capability flags derived from RBAC rules."""
    return {
        "can_ingest": is_allowed(role, "POST", "/api/v1/ingest"),
        "can_run_campaigns": is_allowed(role, "POST", "/api/v1/campaigns/run"),
        "can_run_benchmark": is_allowed(role, "POST", "/api/v1/benchmark/run"),
        "can_run_ablation": is_allowed(role, "POST", "/api/v1/benchmark/ablation"),
        "can_manage_policies": is_allowed(role, "PUT", "/api/v1/policies"),
        "can_manage_providers": is_allowed(role, "POST", "/api/v1/providers"),
        "can_manage_integrations": is_allowed(role, "POST", "/api/v1/integrations"),
        "can_manage_targets": is_allowed(role, "POST", "/api/v1/targets"),
        "read_only": role == Role.READONLY,
    }
