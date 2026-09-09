"""Add digest-only operator approval requests."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "017_operator_approvals"
down_revision: str | None = "016_redacted_post_exec_events"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    if "approval_requests" not in set(inspect(bind).get_table_names()):
        op.create_table(
            "approval_requests",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("tenant_id", sa.String(255), nullable=False, index=True),
            sa.Column("session_id", sa.String(36), nullable=False, index=True),
            sa.Column("operation_sha256", sa.String(64), nullable=False, index=True),
            sa.Column("tool_name", sa.String(255), nullable=False),
            sa.Column("action", sa.String(32), nullable=False),
            sa.Column("findings", sa.JSON(), nullable=False),
            sa.Column("requester", sa.JSON(), nullable=False),
            sa.Column("status", sa.String(32), nullable=False, index=True),
            sa.Column("approver", sa.String(255), nullable=True),
            sa.Column("decision_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False, index=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )


def downgrade() -> None:
    bind = op.get_bind()
    if "approval_requests" in set(inspect(bind).get_table_names()):
        op.drop_table("approval_requests")
