"""Pytest test suite configuration and fixtures."""

import os
import sys
from pathlib import Path
import pytest

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


@pytest.fixture(autouse=True)
def clean_env():
    """Ensures test environment is isolated from ambient env variables."""
    overrides = [
        "VOICE_ASSISTANT_NAME",
        "VOICE_ASSISTANT_LOG_LEVEL",
        "VOICE_ASSISTANT_CONFIG",
        "STT_MODEL_SIZE",
        "OPENAI_API_KEY",
        "OLLAMA_BASE_URL",
    ]
    original = {}
    for k in overrides:
        if k in os.environ:
            original[k] = os.environ.pop(k)

    yield

    # Restore
    for k in overrides:
        if k in os.environ:
            del os.environ[k]
    for k, v in original.items():
        os.environ[k] = v
