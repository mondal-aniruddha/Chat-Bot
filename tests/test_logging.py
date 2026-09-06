"""Unit tests for logging system and secret redaction."""

import logging
from pathlib import Path
from assistant.utils.logging import (
    TimedOperation,
    get_logger,
    redact_secrets,
    setup_logging,
)


def test_secret_redaction_strings():
    """Verifies that API keys, passwords, and tokens are scrubbed."""
    # OpenAI style keys
    msg1 = "Using key sk-abcdef1234567890abcdef for connection"
    assert redact_secrets(msg1) == "Using key [REDACTED] for connection"

    # API key key-value pairs
    msg2 = "Config: api_key='secret_token_12345' loaded"
    assert "secret_token_12345" not in redact_secrets(msg2)
    assert "[REDACTED]" in redact_secrets(msg2)

    # Bearer tokens
    msg3 = "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.test"
    assert "eyJhbGciOiJIUzI1NiJ9.test" not in redact_secrets(msg3)
    assert "[REDACTED]" in redact_secrets(msg3)

    # Passwords
    msg4 = "login with password='superSecretPassword123'"
    assert "superSecretPassword123" not in redact_secrets(msg4)


def test_logger_file_output_and_redaction(tmp_path):
    """Verifies that log records written to file have sensitive information redacted."""
    log_file = tmp_path / "test_assistant.log"
    setup_logging(level_name="DEBUG", log_file_path=str(log_file))

    logger = get_logger("TestComp")
    logger.info("Initializing provider with sk-1234567890abcdefghijk")
    logger.debug("Normal debug message without secrets")

    # Flush handlers
    for handler in logging.getLogger().handlers:
        handler.flush()

    assert log_file.exists()
    content = log_file.read_text(encoding="utf-8")
    assert "sk-1234567890abcdefghijk" not in content
    assert "[REDACTED]" in content
    assert "[TestComp]" in content
    assert "Normal debug message without secrets" in content


def test_timed_operation(caplog):
    """Verifies execution time measurement context manager."""
    logger = get_logger("TimerTest")
    with caplog.at_level(logging.DEBUG):
        with TimedOperation(logger, "Data processing", level=logging.INFO):
            pass

    assert any("Data processing completed in" in record.message for record in caplog.records)
