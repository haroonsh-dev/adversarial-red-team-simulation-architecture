"""ARTSA backend entry point — starts the live FastAPI server.

NOTE: This file used to run a one-shot campaign (scripts/run_campaign) and then
exit, which looked like the backend "stopping". The campaign CLI still exists:
    python scripts/run_campaign.py

Server defaults match the container (port 8000). Override via env:
    ARTSA_HOST=0.0.0.0 ARTSA_PORT=8000 ARTSA_RELOAD=true python run.py
"""

import os
import sys
from pathlib import Path

import uvicorn

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

from src.compat.langchain_globals import patch_langchain_globals  # noqa: E402

patch_langchain_globals()

HOST = os.getenv("ARTSA_HOST", "127.0.0.1")
PORT = int(os.getenv("ARTSA_PORT", "8000"))
RELOAD = os.getenv("ARTSA_RELOAD", "false").lower() in ("1", "true", "yes")

if __name__ == "__main__":
    print(f"🧠 Starting ARTSA Backend API on http://{HOST}:{PORT} ...")
    uvicorn.run(
        "src.api.main:app",
        host=HOST,
        port=PORT,
        reload=RELOAD,
        # Test edits should not restart the API — avoids 503s on dashboard polls.
        reload_excludes=["tests/*", "**/tests/**", "**/__pycache__/**"],
    )
