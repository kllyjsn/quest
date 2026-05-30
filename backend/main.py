"""Quant Edge — FastAPI backend entry point for deployment."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from app.main import app  # noqa: E402, F401

__all__ = ["app"]
