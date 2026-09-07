"""HMAC audit: unique attempt id, envelope event_id as a column.

Replay / second-verify failures must persist without colliding on the
envelope event_id primary key.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect, text

revision: str = "014_hmac_audit_event_id"
down_revision: str | None = "013_hmac_handoff_audit"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    tables = set(inspect(bind).get_table_names())
    if "hmac_handoff_audit" not in tables:
        return
    cols = {c["name"] for c in inspect(bind).get_columns("hmac_handoff_audit")}
    if "event_id" in cols:
        return
    op.add_column(
        "hmac_handoff_audit",
        sa.Column("event_id", sa.String(64), nullable=False, server_default=""),
    )
    bind.execute(text("UPDATE hmac_handoff_audit SET event_id = id WHERE event_id = ''"))
    op.create_index("ix_hmac_handoff_audit_event_id", "hmac_handoff_audit", ["event_id"])


def downgrade() -> None:
    bind = op.get_bind()
    tables = set(inspect(bind).get_table_names())
    if "hmac_handoff_audit" not in tables:
        return
    cols = {c["name"] for c in inspect(bind).get_columns("hmac_handoff_audit")}
    if "event_id" not in cols:
        return
    op.drop_index("ix_hmac_handoff_audit_event_id", table_name="hmac_handoff_audit")
    op.drop_column("hmac_handoff_audit", "event_id")
