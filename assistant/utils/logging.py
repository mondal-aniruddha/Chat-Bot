"""Structured, component-tagged logging system with secret redaction and rotation."""

import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import re
import sys
import time
from typing import Optional
from colorama import Fore, Style, init as colorama_init

# Initialize colorama for Windows ANSI escape sequence support
colorama_init(autoreset=True)

# Secret patterns to redact automatically
SECRET_PATTERNS = [
    re.compile(r"sk-[a-zA-Z0-9_-]{16,}", re.IGNORECASE),
    re.compile(r"(api[_-]?key\s*[:=]\s*['\"]?)([\w\-]{8,})(['\"]?)", re.IGNORECASE),
    re.compile(r"(bearer\s+)([\w\-\.]{10,})", re.IGNORECASE),
    re.compile(r"(password\s*[:=]\s*['\"]?)([^'\"\s]{4,})(['\"]?)", re.IGNORECASE),
    re.compile(r"(secret\s*[:=]\s*['\"]?)([^'\"\s]{4,})(['\"]?)", re.IGNORECASE),
]


def redact_secrets(message: str) -> str:
    """Sanitizes sensitive tokens, passwords, and API keys from log strings."""
    if not isinstance(message, str):
        message = str(message)

    redacted = message
    for pattern in SECRET_PATTERNS:
        # If the pattern has capture groups for key name, preserve the key name and redact the value
        if pattern.groups == 3:
            redacted = pattern.sub(r"\1[REDACTED]\3", redacted)
        elif pattern.groups == 2:
            redacted = pattern.sub(r"\1[REDACTED]", redacted)
        else:
            redacted = pattern.sub("[REDACTED]", redacted)
    return redacted


class RedactingFilter(logging.Filter):
    """Logging filter that scrubs sensitive strings from all log records."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = redact_secrets(record.msg)
        if record.args:
            if isinstance(record.args, dict):
                record.args = {k: redact_secrets(str(v)) for k, v in record.args.items()}
            elif isinstance(record.args, (list, tuple)):
                record.args = tuple(redact_secrets(str(arg)) for arg in record.args)
        return True


class ColoredConsoleFormatter(logging.Formatter):
    """Colorized console formatter with component tag highlighting."""

    COLORS = {
        logging.DEBUG: Fore.CYAN,
        logging.INFO: Fore.GREEN,
        logging.WARNING: Fore.YELLOW,
        logging.ERROR: Fore.RED,
        logging.CRITICAL: Fore.MAGENTA + Style.BRIGHT,
    }

    def format(self, record: logging.LogRecord) -> str:
        color = self.COLORS.get(record.levelno, Fore.WHITE)
        timestamp = self.formatTime(record, "%H:%M:%S")
        level_name = f"{record.levelname:<7}"
        component = getattr(record, "component", record.name)
        message = record.getMessage()

        # Format: HH:MM:SS [LEVEL  ] [Component] Message
        prefix = f"{Fore.LIGHTBLACK_EX}{timestamp}{Style.RESET_ALL} {color}[{level_name}]{Style.RESET_ALL}"
        comp_tag = f"{Fore.BLUE}[{component}]{Style.RESET_ALL}"
        formatted = f"{prefix} {comp_tag} {message}"

        if record.exc_info:
            formatted += "\n" + self.formatException(record.exc_info)
        return formatted


class FileLogFormatter(logging.Formatter):
    """Standard uncolored formatter for log files."""

    def format(self, record: logging.LogRecord) -> str:
        timestamp = self.formatTime(record, "%Y-%m-%d %H:%M:%S")
        component = getattr(record, "component", record.name)
        message = record.getMessage()
        formatted = f"{timestamp} [{record.levelname:<7}] [{component}] {message}"
        if record.exc_info:
            formatted += "\n" + self.formatException(record.exc_info)
        return formatted


class ComponentLogger(logging.LoggerAdapter):
    """Logger adapter that automatically attaches a component tag to every log entry."""

    def process(self, msg: str, kwargs: dict):
        extra = kwargs.get("extra", {})
        extra["component"] = self.extra.get("component", "General")
        kwargs["extra"] = extra
        return msg, kwargs


_initialized = False


def setup_logging(
    level_name: str = "INFO",
    log_file_path: Optional[str] = "logs/assistant.log",
    max_bytes: int = 10485760,
    backup_count: int = 5,
) -> None:
    """Configures root logger with console and rotating file handlers."""
    global _initialized

    root_logger = logging.getLogger()
    level = getattr(logging, level_name.upper(), logging.INFO)
    root_logger.setLevel(level)

    # Clear existing handlers
    root_logger.handlers.clear()

    # Redacting filter
    redactor = RedactingFilter()

    # Console Handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(level)
    console_handler.setFormatter(ColoredConsoleFormatter())
    console_handler.addFilter(redactor)
    root_logger.addHandler(console_handler)

    # Rotating File Handler
    if log_file_path:
        log_path = Path(log_file_path)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        file_handler = RotatingFileHandler(
            filename=str(log_path),
            maxBytes=max_bytes,
            backupCount=backup_count,
            encoding="utf-8",
        )
        file_handler.setLevel(level)
        file_handler.setFormatter(FileLogFormatter())
        file_handler.addFilter(redactor)
        root_logger.addHandler(file_handler)

    _initialized = True


def get_logger(component_name: str = "Assistant") -> ComponentLogger:
    """Returns a component-tagged logger."""
    if not _initialized:
        setup_logging()
    base_logger = logging.getLogger("assistant")
    return ComponentLogger(base_logger, {"component": component_name})


class TimedOperation:
    """Context manager for logging execution duration of operations."""

    def __init__(self, logger: ComponentLogger, operation_name: str, level: int = logging.DEBUG):
        self.logger = logger
        self.operation_name = operation_name
        self.level = level
        self.start_time: float = 0.0

    def __enter__(self):
        self.start_time = time.perf_counter()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        duration_ms = (time.perf_counter() - self.start_time) * 1000.0
        if exc_type:
            self.logger.log(
                logging.ERROR,
                f"{self.operation_name} failed after {duration_ms:.1f}ms: {exc_val}",
            )
        else:
            self.logger.log(
                self.level,
                f"{self.operation_name} completed in {duration_ms:.1f}ms",
            )
