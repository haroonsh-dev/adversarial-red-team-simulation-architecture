"""Persist digest-only SDK post-execution event evidence."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "016_redacted_post_exec_events"
down_revision: str | None = "015_runtime_enforcement_audit"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in inspect(bind).get_columns("tool_call_events")}
    if "post_exec_redacted" not in columns:
        op.add_column(
            "tool_call_events",
            sa.Column("post_exec_redacted", sa.Boolean(), nullable=False, server_default=sa.false()),
        )
    if "response_sha256" not in columns:
        op.add_column("tool_call_events", sa.Column("response_sha256", sa.String(64), nullable=True))
    if "response_findings" not in columns:
        op.add_column(
            "tool_call_events",
            sa.Column("response_findings", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        )


def downgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in inspect(bind).get_columns("tool_call_events")}
    for name in ("response_findings", "response_sha256", "post_exec_redacted"):
        if name in columns:
            op.drop_column("tool_call_events", name)
