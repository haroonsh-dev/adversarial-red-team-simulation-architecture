"""Digest-only runtime enforcement audit (no secrets, no system prompts)."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "015_runtime_enforcement_audit"
down_revision: str | None = "014_hmac_audit_event_id"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    tables = set(inspect(bind).get_table_names())
    if "runtime_enforcement_audit" in tables:
        return
    op.create_table(
        "runtime_enforcement_audit",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("session_id", sa.String(36), nullable=False, index=True),
        sa.Column("stream", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("action", sa.String(32), nullable=False, index=True),
        sa.Column("body_sha256", sa.String(64), nullable=False),
        sa.Column("findings", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    bind = op.get_bind()
    tables = set(inspect(bind).get_table_names())
    if "runtime_enforcement_audit" not in tables:
        return
    op.drop_table("runtime_enforcement_audit")
