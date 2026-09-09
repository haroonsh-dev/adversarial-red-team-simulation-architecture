"""Make encrypted provider aliases tenant-scoped.

Existing installations receive the explicitly transitional ``default_org``
assignment.  Operators must reassign those records before enabling production
tenant isolation.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "019_tenant_scoped_providers"
down_revision: str | None = "018_session_circuit_breakers"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    if "providers" not in set(inspect(bind).get_table_names()):
        return
    if bind.dialect.name == "sqlite":
        # SQLite does not expose a stable name for inline ``UNIQUE(name)``.
        # Rebuild explicitly so the legacy global uniqueness cannot survive.
        op.create_table(
            "providers_tenant_migration",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("tenant_id", sa.String(255), nullable=False),
            sa.Column("name", sa.String(64), nullable=False),
            sa.Column("provider_type", sa.String(64), nullable=False),
            sa.Column("api_key", sa.Text(), nullable=False),
            sa.Column("base_url", sa.String(1024), nullable=True),
            sa.Column("default_model", sa.String(128), nullable=True),
            sa.Column("enabled", sa.Boolean(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("tenant_id", "name", name="uq_providers_tenant_name"),
        )
        op.execute(
            "INSERT INTO providers_tenant_migration "
            "(id, tenant_id, name, provider_type, api_key, base_url, default_model, enabled, created_at, updated_at) "
            "SELECT id, 'default_org', name, provider_type, api_key, base_url, default_model, enabled, created_at, updated_at FROM providers"
        )
        op.drop_table("providers")
        op.rename_table("providers_tenant_migration", "providers")
        op.create_index("ix_providers_tenant_id", "providers", ["tenant_id"])
        op.create_index("ix_providers_name", "providers", ["name"])
        return
    with op.batch_alter_table("providers") as batch:
        batch.add_column(sa.Column("tenant_id", sa.String(255), nullable=True))
    op.execute("UPDATE providers SET tenant_id = 'default_org' WHERE tenant_id IS NULL OR tenant_id = ''")
    with op.batch_alter_table("providers") as batch:
        batch.alter_column("tenant_id", nullable=False, server_default="default_org")
        for constraint in inspect(bind).get_unique_constraints("providers"):
            columns = constraint.get("column_names") or []
            if columns == ["name"] and constraint.get("name"):
                batch.drop_constraint(constraint["name"], type_="unique")
        batch.create_unique_constraint("uq_providers_tenant_name", ["tenant_id", "name"])
        batch.create_index("ix_providers_tenant_id", ["tenant_id"])


def downgrade() -> None:
    bind = op.get_bind()
    if "providers" not in set(inspect(bind).get_table_names()):
        return
    with op.batch_alter_table("providers") as batch:
        batch.drop_constraint("uq_providers_tenant_name", type_="unique")
        batch.drop_index("ix_providers_tenant_id")
        batch.create_unique_constraint("uq_providers_name", ["name"])
        batch.drop_column("tenant_id")
