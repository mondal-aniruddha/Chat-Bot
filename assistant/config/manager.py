"""Configuration manager for loading, merging, and accessing application settings."""

import os
from pathlib import Path
from typing import Any, Dict, Optional
import yaml

from assistant.config.schema import AppConfig


def _deep_merge(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    """Recursively merges dictionary override into base dictionary."""
    result = dict(base)
    for key, value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result


class ConfigManager:
    """Manages application configuration lifecycle, file loading, and environment variable overrides."""

    DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent.parent.parent / "config" / "default_config.yaml"
    USER_CONFIG_FILENAMES = ["config.yaml", "config.yml"]

    def __init__(self, custom_config_path: Optional[str] = None):
        self._custom_config_path = Path(custom_config_path) if custom_config_path else None
        self._config: Optional[AppConfig] = None
        self.load()

    @property
    def config(self) -> AppConfig:
        """Returns the loaded AppConfig instance."""
        if self._config is None:
            self.load()
        return self._config

    def load(self) -> AppConfig:
        """Loads configuration by layering defaults, custom/user file, and environment variables."""
        merged_data: Dict[str, Any] = {}

        # 1. Load default configuration if file exists, else use Pydantic defaults
        if self.DEFAULT_CONFIG_PATH.exists():
            try:
                with open(self.DEFAULT_CONFIG_PATH, "r", encoding="utf-8") as f:
                    content = yaml.safe_load(f) or {}
                    if isinstance(content, dict):
                        merged_data = content
            except Exception as e:
                print(f"[ConfigManager] Warning: Failed to read default config at {self.DEFAULT_CONFIG_PATH}: {e}")

        # 2. Look for user config overrides
        user_path = self._resolve_user_config_path()
        if user_path and user_path.exists():
            try:
                with open(user_path, "r", encoding="utf-8") as f:
                    user_data = yaml.safe_load(f) or {}
                    if isinstance(user_data, dict):
                        merged_data = _deep_merge(merged_data, user_data)
            except Exception as e:
                print(f"[ConfigManager] Warning: Failed to read user config at {user_path}: {e}")

        # 3. Apply Environment Variable overrides
        self._apply_env_overrides(merged_data)

        # 4. Validate through Pydantic
        self._config = AppConfig(**merged_data)
        return self._config

    def _resolve_user_config_path(self) -> Optional[Path]:
        """Resolves the user config path from explicit parameter, env var, or current directory."""
        if self._custom_config_path and self._custom_config_path.exists():
            return self._custom_config_path

        env_cfg = os.environ.get("VOICE_ASSISTANT_CONFIG")
        if env_cfg:
            p = Path(env_cfg)
            if p.exists():
                return p

        # Check in current working directory
        cwd = Path.cwd()
        for fname in self.USER_CONFIG_FILENAMES:
            candidate = cwd / fname
            if candidate.exists():
                return candidate

        return None

    def _apply_env_overrides(self, data: Dict[str, Any]) -> None:
        """Applies environment variable overrides to the raw dictionary."""
        # System overrides
        if "VOICE_ASSISTANT_NAME" in os.environ:
            data.setdefault("system", {})["name"] = os.environ["VOICE_ASSISTANT_NAME"]

        # Logging overrides
        if "VOICE_ASSISTANT_LOG_LEVEL" in os.environ:
            data.setdefault("logging", {})["level"] = os.environ["VOICE_ASSISTANT_LOG_LEVEL"]

        # STT overrides
        if "STT_MODEL_SIZE" in os.environ:
            data.setdefault("stt", {})["model_size"] = os.environ["STT_MODEL_SIZE"]

        # LLM overrides
        if "OLLAMA_BASE_URL" in os.environ:
            data.setdefault("llm", {}).setdefault("ollama", {})["base_url"] = os.environ["OLLAMA_BASE_URL"]
        if "OLLAMA_MODEL" in os.environ:
            data.setdefault("llm", {}).setdefault("ollama", {})["model"] = os.environ["OLLAMA_MODEL"]
        if "OPENAI_API_KEY" in os.environ:
            data.setdefault("llm", {}).setdefault("openai", {})["api_key"] = os.environ["OPENAI_API_KEY"]
        if "OPENAI_BASE_URL" in os.environ:
            data.setdefault("llm", {}).setdefault("openai", {})["base_url"] = os.environ["OPENAI_BASE_URL"]
        if "OPENAI_MODEL" in os.environ:
            data.setdefault("llm", {}).setdefault("openai", {})["model"] = os.environ["OPENAI_MODEL"]

    def save_to_file(self, path: Path) -> None:
        """Saves current configuration to a YAML file."""
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            yaml.dump(self.config.model_dump(), f, default_flow_style=False, sort_keys=False)


# Module-level singleton helper
_instance: Optional[ConfigManager] = None


def get_config_manager(custom_config_path: Optional[str] = None) -> ConfigManager:
    """Gets or initializes the global ConfigManager instance."""
    global _instance
    if _instance is None or custom_config_path is not None:
        _instance = ConfigManager(custom_config_path=custom_config_path)
    return _instance


def get_config() -> AppConfig:
    """Convenience function to get the current AppConfig."""
    return get_config_manager().config
