"""Filesystem layout for the GUI's own state.

Kept separate from `tradingagents/`'s home directory so a `rm -rf
~/.tradingagents-gui` never touches the user's decision log or checkpoints.
Override the base with ``TRADINGAGENTS_GUI_DIR`` for tests and for container
deployment.
"""

from __future__ import annotations

import os
from pathlib import Path


def gui_dir() -> Path:
    base = os.environ.get("TRADINGAGENTS_GUI_DIR")
    if base:
        return Path(base).expanduser()
    return Path.home() / ".tradingagents-gui"


def db_path() -> Path:
    return gui_dir() / "runs.db"


def snapshots_dir() -> Path:
    return gui_dir() / "snapshots"


def ensure_dirs() -> None:
    gui_dir().mkdir(parents=True, exist_ok=True)
    snapshots_dir().mkdir(parents=True, exist_ok=True)
