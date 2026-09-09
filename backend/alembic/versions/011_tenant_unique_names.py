"""Phase 4.7: per-tenant unique integration names + agent-baseline composite PK.

Previously ``custom_integrations.name`` was globally UNIQUE (a second tenant
could not have a connector named "slack") and ``agent_baselines`` keyed on a
globally-unique ``agent_id`` PK. This migration makes integration names unique
PER TENANT and baselines unique per (tenant_id, agent_id).

Runs defensively: only tables that exist (Postgres prod) are altered, and
constraint drops tolerate an already-absent constraint so re-runs are safe.
"""

from collections.abc import Sequence

from alembic import op
from sqlalchemy import inspect, text

revision: str = "011_tenant_unique_names"
down_revision: str | None = "010_tenant_users"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    existing = set(inspect(bind).get_table_names())

    # SQLite cannot ALTER constraints.  The runtime ORM already declares the
    # intended composite constraints for newly-created tables; old SQLite
    # databases get a composite unique index without blocking migrations.
    if bind.dialect.name == "sqlite":
        if "custom_integrations" in existing:
            names = {row[1] for row in bind.execute(text("PRAGMA index_list(custom_integrations)"))}
            if "uq_custom_integrations_tenant_name" not in names:
                op.create_index(
                    "uq_custom_integrations_tenant_name",
                    "custom_integrations",
                    ["tenant_id", "name"],
                    unique=True,
                )
        if "agent_baselines" in existing:
            names = {row[1] for row in bind.execute(text("PRAGMA index_list(agent_baselines)"))}
            if "uq_agent_baselines_tenant_agent" not in names:
                op.create_index(
                    "uq_agent_baselines_tenant_agent",
                    "agent_baselines",
                    ["tenant_id", "agent_id"],
                    unique=True,
                )
        return

    # ── custom_integrations: global name-unique → per-tenant unique ─────────
    if "custom_integrations" in existing:
        # Drop any unique constraint covering only `name` (auto-named by
        # SQLAlchemy when the column had unique=True).
        inspector = inspect(bind)
        dropped = False
        for con in inspector.get_unique_constraints("custom_integrations"):
            cols = [str(c).lower() for c in (con.get("column_names") or [])]
            if cols == ["name"] and con.get("name"):
                op.drop_constraint(con["name"], "custom_integrations", type_="unique")
                dropped = True
        if dropped or not any(
            {"tenant_id", "name"} <= {str(c).lower() for c in (c.get("column_names") or [])}
            for c in inspector.get_unique_constraints("custom_integrations")
        ):
            op.create_unique_constraint(
                "uq_custom_integrations_tenant_name",
                "custom_integrations",
                ["tenant_id", "name"],
            )

    # ── agent_baselines: agent_id PK → (tenant_id, agent_id) composite PK ──
    if "agent_baselines" in existing:
        inspector = inspect(bind)
        pk = inspector.get_pk_constraint("agent_baselines")
        if pk and pk.get("name"):
            op.drop_constraint(pk["name"], "agent_baselines", type_="primary")
        op.create_primary_key(
            "pk_agent_baselines_tenant_agent",
            "agent_baselines",
            ["tenant_id", "agent_id"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    existing = set(inspect(bind).get_table_names())
    if "custom_integrations" in existing:
        op.drop_constraint(
            "uq_custom_integrations_tenant_name", "custom_integrations", type_="unique"
        )
        op.create_unique_constraint("uq_custom_integrations_name", "custom_integrations", ["name"])
    if "agent_baselines" in existing:
        op.drop_constraint("pk_agent_baselines_tenant_agent", "agent_baselines", type_="primary")
        op.create_primary_key("agent_baselines_pkey", "agent_baselines", ["agent_id"])
