"""Pydantic schemas and validation for application configuration."""

from typing import List, Optional
from pydantic import BaseModel, Field


class SystemConfig(BaseModel):
    name: str = Field(default="Assistant", description="Display name of the assistant")
    wake_words: List[str] = Field(
        default_factory=lambda: ["hey assistant", "hey jarvis"],
        description="List of trigger phrases for wake-word activation",
    )
    language: str = Field(default="en", description="Primary interaction language")
    debug: bool = Field(default=False, description="Enable debug mode and verbose logs")


class AudioConfig(BaseModel):
    input_device_index: Optional[int] = Field(
        default=None, description="Index of input microphone device, None for default"
    )
    output_device_index: Optional[int] = Field(
        default=None, description="Index of output speaker device, None for default"
    )
    sample_rate: int = Field(
        default=16000, ge=8000, le=48000, description="Sampling rate in Hz (16kHz standard for Whisper)"
    )
    channels: int = Field(default=1, ge=1, le=2, description="Number of audio channels (1=mono)")
    chunk_size: int = Field(default=1024, ge=256, le=8192, description="Audio buffer chunk size in frames")
    vad_energy_threshold: float = Field(
        default=0.015, gt=0.0, le=1.0, description="RMS energy threshold for speech activity detection"
    )
    vad_silence_duration_seconds: float = Field(
        default=1.2, ge=0.3, le=5.0, description="Seconds of trailing silence to finalize speech"
    )


class STTConfig(BaseModel):
    engine: str = Field(
        default="faster-whisper", description="STT engine to use: 'faster-whisper' or 'mock'"
    )
    model_size: str = Field(
        default="tiny", description="Whisper model size: 'tiny', 'base', 'small', 'medium'"
    )
    device: str = Field(default="cpu", description="Execution device: 'cpu' or 'cuda'")
    compute_type: str = Field(
        default="int8", description="Computation precision: 'int8', 'float16', 'float32'"
    )


class TTSConfig(BaseModel):
    engine: str = Field(default="pyttsx3", description="TTS engine name: 'pyttsx3'")
    rate: int = Field(default=190, ge=100, le=350, description="Speech rate in words per minute")
    volume: float = Field(default=1.0, ge=0.0, le=1.0, description="Speech volume from 0.0 to 1.0")
    voice_id: Optional[str] = Field(default=None, description="Specific system voice ID, None for default")


class OllamaConfig(BaseModel):
    base_url: str = Field(default="http://localhost:11434", description="Ollama API base URL")
    model: str = Field(default="llama3.2", description="Local model name in Ollama")
    timeout: int = Field(default=15, ge=1, le=120, description="Request timeout in seconds")


class OpenAIConfig(BaseModel):
    base_url: str = Field(default="https://api.openai.com/v1", description="OpenAI-compatible API base URL")
    api_key: Optional[str] = Field(default=None, description="API Key for OpenAI or compatible service")
    model: str = Field(default="gpt-4o-mini", description="Model name")
    timeout: int = Field(default=15, ge=1, le=120, description="Request timeout in seconds")


class GeminiConfig(BaseModel):
    api_key: Optional[str] = Field(default=None, description="API Key for Google Gemini (AI Studio)")
    model: str = Field(default="gemini-2.0-flash", description="Gemini model name: 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'")
    base_url: str = Field(
        default="https://generativelanguage.googleapis.com/v1beta",
        description="Google Gemini API endpoint URL"
    )
    timeout: int = Field(default=15, ge=1, le=120, description="Request timeout in seconds")


class ClaudeConfig(BaseModel):
    api_key: Optional[str] = Field(default=None, description="API Key for Anthropic Claude")
    model: str = Field(default="claude-3-5-haiku-20241022", description="Claude model name: 'claude-3-5-haiku-20241022', 'claude-3-7-sonnet-20250219'")
    base_url: str = Field(default="https://api.anthropic.com/v1", description="Anthropic API base URL")
    timeout: int = Field(default=15, ge=1, le=120, description="Request timeout in seconds")


class OpenRouterConfig(BaseModel):
    api_key: Optional[str] = Field(default=None, description="API Key for OpenRouter (Free models available)")
    model: str = Field(
        default="google/gemini-2.0-flash-exp:free",
        description="OpenRouter model name (e.g. 'google/gemini-2.0-flash-exp:free', 'deepseek/deepseek-r1:free', 'meta-llama/llama-3.3-70b-instruct:free')"
    )
    base_url: str = Field(default="https://openrouter.ai/api/v1", description="OpenRouter API base URL")
    timeout: int = Field(default=20, ge=1, le=120, description="Request timeout in seconds")


class ConfiguredModel(BaseModel):
    """A model exposed to the chat UI from local configuration.

    ``id`` is a stable, UI-facing selection key. ``model`` is the provider's
    actual API model identifier, which lets a friendly catalog name differ
    from the identifier sent to the provider.
    """

    id: str = Field(description="Unique model selection ID, for example 'openai:gpt-4o-mini'")
    provider: str = Field(description="Configured provider key, for example 'openai'")
    model: str = Field(description="Provider API model identifier")
    name: Optional[str] = Field(default=None, description="Friendly name shown in the UI")
    context_window: Optional[int] = Field(default=None, ge=1, description="Optional context window size")
    capabilities: List[str] = Field(default_factory=lambda: ["text"], description="Supported capabilities")
    enabled: bool = Field(default=True, description="Whether this model can be selected")


class LLMConfig(BaseModel):
    provider: str = Field(
        default="internet",
        description="Active reasoning engine: 'internet', 'gemini', 'openrouter', 'openai', 'claude', 'ollama', 'rule_based'"
    )
    fallback_to_rules: bool = Field(
        default=True, description="Fallback to offline rule matcher if external LLM fails"
    )
    fallback_to_internet: bool = Field(
        default=True, description="Fallback to DuckDuckGo/Wikipedia knowledge if LLM key is absent or fails"
    )
    ollama: OllamaConfig = Field(default_factory=OllamaConfig)
    openai: OpenAIConfig = Field(default_factory=OpenAIConfig)
    gemini: GeminiConfig = Field(default_factory=GeminiConfig)
    claude: ClaudeConfig = Field(default_factory=ClaudeConfig)
    openrouter: OpenRouterConfig = Field(default_factory=OpenRouterConfig)
    models: List[ConfiguredModel] = Field(
        default_factory=list,
        description="Configured LLM catalog exposed through the model-discovery API",
    )


class ConversationConfig(BaseModel):
    max_history_turns: int = Field(
        default=20, ge=1, le=100, description="Maximum conversation turns to retain in context"
    )
    system_prompt: str = Field(
        default=(
            "You are a helpful, concise, and friendly Windows desktop voice assistant. "
            "Provide direct, conversational responses suitable for voice output. "
            "Keep your spoken answers brief (1-3 sentences) unless the user asks for details."
        ),
        description="System prompt guiding assistant tone and constraints",
    )


class SecurityConfig(BaseModel):
    require_confirmation_for_medium_risk: bool = Field(
        default=True, description="Require user confirmation before executing medium risk tools"
    )
    disallow_high_risk: bool = Field(
        default=True, description="Block high-risk actions such as arbitrary shell execution"
    )
    audit_log_path: str = Field(
        default="logs/audit.log", description="Path to write security audit entries"
    )


class LoggingConfig(BaseModel):
    level: str = Field(default="INFO", description="Logging level: DEBUG, INFO, WARNING, ERROR")
    log_file: str = Field(default="logs/assistant.log", description="File path for rotating application logs")
    max_bytes: int = Field(default=10485760, ge=1024, description="Max log file size in bytes before rotating (10MB)")
    backup_count: int = Field(default=5, ge=1, le=20, description="Number of rotated backup log files to preserve")


class AppConfig(BaseModel):
    """Top-level application configuration model."""

    system: SystemConfig = Field(default_factory=SystemConfig)
    audio: AudioConfig = Field(default_factory=AudioConfig)
    stt: STTConfig = Field(default_factory=STTConfig)
    tts: TTSConfig = Field(default_factory=TTSConfig)
    llm: LLMConfig = Field(default_factory=LLMConfig)
    conversation: ConversationConfig = Field(default_factory=ConversationConfig)
    security: SecurityConfig = Field(default_factory=SecurityConfig)
    logging: LoggingConfig = Field(default_factory=LoggingConfig)
