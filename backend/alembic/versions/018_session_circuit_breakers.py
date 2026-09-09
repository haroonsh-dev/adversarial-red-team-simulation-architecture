"""ASI08 durable session circuit breaker."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "018_session_circuit_breakers"
down_revision: str | None = "017_operator_approvals"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    if "session_circuit_breakers" in set(inspect(op.get_bind()).get_table_names()):
        return
    op.create_table(
        "session_circuit_breakers",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("tenant_id", sa.String(255), nullable=False, index=True),
        sa.Column("session_id", sa.String(36), nullable=False, index=True),
        sa.Column("block_timestamps", sa.JSON(), nullable=False),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=True, index=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("tenant_id", "session_id", name="uq_session_breaker_tenant_session"),
    )


def downgrade() -> None:
    if "session_circuit_breakers" in set(inspect(op.get_bind()).get_table_names()):
        op.drop_table("session_circuit_breakers")
