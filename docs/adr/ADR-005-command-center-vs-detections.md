# ADR-005: Command Center is strategic; Detections is tactical

**Status:** Accepted  
**Date:** 2026-09-06

Command Center and Detections were overlapping (severity rails, raw event tables). That duplicates the analyst desk and hides the thesis chart.

**Command Center** (`/command-center`) is strategic: six-agent chain health, HMAC/trust story, detection-rate-over-time, ASI coverage (ASI08 as a visible gap), active campaigns. It links out to Detections. It does not own severity triage or the live activity table.

**Detections** (`/red-team/monitor`) is tactical: Critical/High/Medium/Low counts, per-event investigation, raw live-activity table.

Rejected: a single dashboard that mixes both, and a second severity summary on Command Center.
