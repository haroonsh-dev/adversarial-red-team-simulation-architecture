# ADR-006: In-memory attack graph now; Apache AGE later

**Status:** Accepted  
**Date:** 2026-09-06

Pathfinding for the attack graph stays in-process (NetworkX / in-memory structures). Neo4j would add an operational store the FYP does not need at current scale.

Apache AGE on Postgres is the deferred upgrade if path queries outgrow memory. Do not treat Neo4j, AGE, or a knowledge-graph service as the current store.
