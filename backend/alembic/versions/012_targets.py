"""Target registry — the stable identity a campaign runs against.

Adds the ``targets`` table so a campaign can reference a persisted AI system
instead of an ad-hoc request body. Regression and benchmark comparison both
need "the same target, tested again", which requires this identity plus the
``version`` label.

Runs defensively so re-runs and fresh SQLite databases both work.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "012_targets"
down_revision: str | None = "011_tenant_unique_names"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    if "targets" in set(inspect(bind).get_table_names()):
        return

    op.create_table(
        "targets",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("tenant_id", sa.String(255), nullable=False, server_default="default_org"),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("kind", sa.String(32), nullable=False, server_default="llm"),
        sa.Column("version", sa.String(64), nullable=False, server_default="v1"),
        sa.Column("description", sa.String(1024), nullable=True),
        sa.Column("provider", sa.String(64), nullable=False, server_default=""),
        sa.Column("model", sa.String(128), nullable=False, server_default=""),
        sa.Column("base_url", sa.String(1024), nullable=True),
        sa.Column("system_prompt", sa.Text(), nullable=True),
        sa.Column(
            "authorized", sa.Boolean(), nullable=False, server_default=sa.text("0")
        ),
        sa.Column("tags", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("config", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("surface", sa.JSON(), nullable=True),
        sa.Column("discovered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("tenant_id", "name", name="uq_targets_tenant_name"),
    )
    op.create_index("ix_targets_tenant_id", "targets", ["tenant_id"])
    op.create_index("ix_targets_name", "targets", ["name"])


def downgrade() -> None:
    bind = op.get_bind()
    if "targets" not in set(inspect(bind).get_table_names()):
        return
    op.drop_index("ix_targets_name", table_name="targets")
    op.drop_index("ix_targets_tenant_id", table_name="targets")
    op.drop_table("targets")
