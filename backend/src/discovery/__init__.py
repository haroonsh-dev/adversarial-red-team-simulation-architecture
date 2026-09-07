"""Target discovery — maps an AI system before any attack is planned."""

from src.discovery.engine import TargetNotAuthorizedError, discover_target

__all__ = ["TargetNotAuthorizedError", "discover_target"]
