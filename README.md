# Windows Desktop Voice Assistant

A modular, local-first voice-controlled AI assistant for Windows desktop.

## Installation

```powershell
# Create and activate virtual environment
python -m venv .venv
.venv\Scripts\Activate.ps1

# Install core dependencies in editable mode
pip install -e .

# Install with optional dependencies (audio, dev, etc.)
pip install -e ".[audio,dev]"
```

## Quick Start

```powershell
# Run system diagnostics & audio check
python -m assistant.cli info

# Validate configuration
python -m assistant.cli validate-config
```
