"""Unit tests for configuration schema and manager."""

import os
import tempfile
from pathlib import Path
import pytest
from pydantic import ValidationError
import yaml

from assistant.config.manager import ConfigManager, _deep_merge
from assistant.config.schema import AppConfig, AudioConfig, SystemConfig


def test_default_config_loading():
    """Tests loading the default configuration."""
    manager = ConfigManager()
    cfg = manager.config
    assert cfg.system.name in ["Assistant", "Jarvis"]
    assert "hey assistant" in [w.lower() for w in cfg.system.wake_words]
    assert cfg.audio.sample_rate == 16000
    assert cfg.audio.channels == 1
    assert cfg.stt.engine == "faster-whisper"
    assert cfg.tts.engine == "pyttsx3"
    assert cfg.llm.provider in ["rule_based", "ollama", "openai"]


def test_deep_merge():
    """Tests deep dictionary merging utility."""
    base = {
        "system": {"name": "Old", "debug": False},
        "audio": {"rate": 16000},
    }
    override = {
        "system": {"name": "New"},
        "llm": {"provider": "ollama"},
    }
    merged = _deep_merge(base, override)
    assert merged["system"]["name"] == "New"
    assert merged["system"]["debug"] is False
    assert merged["audio"]["rate"] == 16000
    assert merged["llm"]["provider"] == "ollama"


def test_env_variable_overrides():
    """Tests overriding configuration parameters via environment variables."""
    os.environ["VOICE_ASSISTANT_NAME"] = "Friday"
    os.environ["STT_MODEL_SIZE"] = "base"
    os.environ["OPENAI_API_KEY"] = "sk-test1234567890abcdefghij"

    manager = ConfigManager()
    cfg = manager.config

    assert cfg.system.name == "Friday"
    assert cfg.stt.model_size == "base"
    assert cfg.llm.openai.api_key == "sk-test1234567890abcdefghij"


def test_custom_yaml_override(tmp_path):
    """Tests overriding configuration via custom YAML file."""
    custom_yaml = tmp_path / "custom_config.yaml"
    custom_yaml.write_text(
        yaml.dump({
            "system": {"name": "HAL 9000", "debug": True},
            "tts": {"rate": 220},
        }),
        encoding="utf-8",
    )

    manager = ConfigManager(custom_config_path=str(custom_yaml))
    cfg = manager.config

    assert cfg.system.name == "HAL 9000"
    assert cfg.system.debug is True
    assert cfg.tts.rate == 220
    # Unoverridden values should retain defaults
    assert cfg.audio.sample_rate == 16000


def test_validation_constraints():
    """Tests that Pydantic enforces valid ranges."""
    # Sample rate must be within 8000-48000
    with pytest.raises(ValidationError):
        AudioConfig(sample_rate=500)

    # Volume must be 0.0 to 1.0
    with pytest.raises(ValidationError):
        from assistant.config.schema import TTSConfig
        TTSConfig(volume=1.5)


def test_save_to_file(tmp_path):
    """Tests saving active configuration to disk."""
    manager = ConfigManager()
    save_dest = tmp_path / "saved_config.yaml"
    manager.save_to_file(save_dest)

    assert save_dest.exists()
    content = yaml.safe_load(save_dest.read_text(encoding="utf-8"))
    assert "system" in content
    assert "audio" in content
