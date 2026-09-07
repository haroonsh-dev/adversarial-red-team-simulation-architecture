"""HMAC handoff audit table."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "013_hmac_handoff_audit"
down_revision: str | None = "012_targets"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    if "hmac_handoff_audit" in set(inspect(bind).get_table_names()):
        return

    op.create_table(
        "hmac_handoff_audit",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("sender", sa.String(64), nullable=False),
        sa.Column("receiver", sa.String(64), nullable=False),
        sa.Column("campaign_id", sa.String(64), nullable=False),
        sa.Column("round_id", sa.String(32), nullable=True),
        sa.Column("nonce_sha256", sa.String(64), nullable=False),
        sa.Column("body_sha256", sa.String(64), nullable=False),
        sa.Column("hmac_state", sa.String(16), nullable=False),
        sa.Column("signature_status", sa.String(16), nullable=False),
        sa.Column("verification_result", sa.String(64), nullable=False),
        sa.Column("replay_detected", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("containment_result", sa.String(32), nullable=True),
        sa.Column("tenant_id", sa.String(255), nullable=False, server_default="default_org"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_hmac_handoff_audit_campaign_id", "hmac_handoff_audit", ["campaign_id"])
    op.create_index("ix_hmac_handoff_audit_nonce_sha256", "hmac_handoff_audit", ["nonce_sha256"])
    op.create_index("ix_hmac_handoff_audit_tenant_id", "hmac_handoff_audit", ["tenant_id"])


def downgrade() -> None:
    bind = op.get_bind()
    if "hmac_handoff_audit" not in set(inspect(bind).get_table_names()):
        return
    op.drop_index("ix_hmac_handoff_audit_tenant_id", table_name="hmac_handoff_audit")
    op.drop_index("ix_hmac_handoff_audit_nonce_sha256", table_name="hmac_handoff_audit")
    op.drop_index("ix_hmac_handoff_audit_campaign_id", table_name="hmac_handoff_audit")
    op.drop_table("hmac_handoff_audit")
