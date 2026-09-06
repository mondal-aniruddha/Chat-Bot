"""Bridge module providing structured JSON APIs for the assistant frontend and external callers."""

import argparse
import datetime
import json
import logging
import os
import platform
import sys
from typing import Any, Dict, List

import psutil

from assistant.config.manager import get_config_manager

# Ensure log output goes to stderr so stdout is strictly JSON
logging.basicConfig(stream=sys.stderr, level=logging.INFO)
logger = logging.getLogger("Bridge")


def get_system_status() -> Dict[str, Any]:
    """Gathers real-time OS, CPU, RAM and assistant system metrics."""
    mem = psutil.virtual_memory()
    cpu_percent = psutil.cpu_percent(interval=0.1)
    
    return {
        "os": f"{platform.system()} {platform.release()} ({platform.version()})",
        "system": platform.system(),
        "release": platform.release(),
        "architecture": f"{platform.machine()} ({platform.architecture()[0]})",
        "python_version": platform.python_version(),
        "python_executable": sys.executable,
        "cpu": {
            "physical_cores": psutil.cpu_count(logical=False),
            "logical_cores": psutil.cpu_count(logical=True),
            "usage_percent": cpu_percent,
        },
        "memory": {
            "total_gb": round(mem.total / (1024**3), 2),
            "available_gb": round(mem.available / (1024**3), 2),
            "used_gb": round(mem.used / (1024**3), 2),
            "percent": mem.percent,
        },
        "timestamp": datetime.datetime.now().isoformat(),
    }


def get_audio_info() -> Dict[str, Any]:
    """Queries PortAudio and sounddevice for connected audio hardware."""
    try:
        import sounddevice as sd  # type: ignore[import-untyped, import-not-found]
        devices = sd.query_devices()
        default_in = sd.default.device[0]
        default_out = sd.default.device[1]
        
        device_list: List[Dict[str, Any]] = []
        for idx, dev in enumerate(devices):
            device_list.append({
                "index": idx,
                "name": dev.get("name", "Unknown Device"),
                "max_input_channels": dev.get("max_input_channels", 0),
                "max_output_channels": dev.get("max_output_channels", 0),
                "default_samplerate": dev.get("default_samplerate", 44100),
                "is_default_input": idx == default_in,
                "is_default_output": idx == default_out,
            })
            
        portaudio_ver = str(sd.get_portaudio_version())
        return {
            "available": True,
            "portaudio_version": portaudio_ver,
            "total_devices": len(devices),
            "default_input_index": default_in,
            "default_output_index": default_out,
            "devices": device_list,
        }
    except Exception as e:
        return {
            "available": False,
            "error": str(e),
            "devices": [],
        }


def listen_hardware_mic(duration_seconds: float = 3.0) -> Dict[str, Any]:
    """Records audio from system default microphone via sounddevice and evaluates voice amplitude."""
    try:
        import sounddevice as sd  # type: ignore[import-untyped, import-not-found]
        import numpy as np

        sample_rate = 16000
        default_in = sd.default.device[0]
        dev_info = sd.query_devices(default_in)
        dev_name = dev_info.get("name", "Default Microphone")

        frames = int(duration_seconds * sample_rate)
        recording = sd.rec(frames, samplerate=sample_rate, channels=1, dtype='float32')
        sd.wait()

        peak = float(np.max(np.abs(recording)))
        rms = float(np.sqrt(np.mean(recording**2)))
        voice_detected = peak > 0.01 or rms > 0.003

        return {
            "success": True,
            "device_index": default_in,
            "device_name": dev_name,
            "duration_seconds": duration_seconds,
            "peak_amplitude": round(peak, 5),
            "rms_energy": round(rms, 5),
            "voice_detected": voice_detected,
            "message": "Voice audio detected!" if voice_detected else "Audio recorded, but volume was low. Ensure microphone is not muted.",
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "voice_detected": False,
        }


def get_config_json() -> Dict[str, Any]:
    """Returns the validated application configuration as a dictionary."""
    mgr = get_config_manager()
    return mgr.config.model_dump()


def save_config_json(updates: Dict[str, Any]) -> Dict[str, Any]:
    """Updates configuration values and saves them."""
    from pathlib import Path
    from assistant.config.schema import AppConfig

    mgr = get_config_manager()
    current = mgr.config.model_dump()
    
    # Deep merge updates into current config
    def deep_update(base: dict, new: dict):
        for k, v in new.items():
            if isinstance(v, dict) and k in base and isinstance(base[k], dict):
                deep_update(base[k], v)
            else:
                base[k] = v
                
    deep_update(current, updates)
    new_app_config = AppConfig(**current)
    mgr._config = new_app_config
    mgr.save_to_file(Path("config.yaml"))
    return {"status": "saved", "config": current}


def read_recent_logs(max_lines: int = 50) -> List[str]:
    """Reads the last N lines from the assistant application log."""
    log_path = os.path.join(os.getcwd(), "logs", "assistant.log")
    if not os.path.exists(log_path):
        return []
    try:
        with open(log_path, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()
            return [line.strip() for line in lines[-max_lines:]]
    except Exception as e:
        return [f"Error reading logs: {e}"]


def process_chat_message(message: str) -> Dict[str, Any]:
    """Handles an interactive chat message through the rule-based intent engine and AI assistant logic."""
    cleaned = message.strip().lower()
    now = datetime.datetime.now()
    cfg = get_config_manager().config
    assistant_name = cfg.system.name

    # Intent Matching
    if any(greet in cleaned for greet in ["hello", "hi", "hey", "good morning", "good evening"]):
        response = f"Hello! I am {assistant_name}, your Windows desktop AI voice assistant. How can I assist you today?"
        intent = "greeting"
    elif "time" in cleaned or "clock" in cleaned:
        response = f"The current time is {now.strftime('%I:%M %p')}."
        intent = "query_time"
    elif "date" in cleaned or "day" in cleaned:
        response = f"Today is {now.strftime('%A, %B %d, %Y')}."
        intent = "query_date"
    elif "system" in cleaned or "spec" in cleaned or "ram" in cleaned or "cpu" in cleaned:
        mem = psutil.virtual_memory()
        response = (
            f"System status: OS {platform.system()} {platform.release()}, "
            f"CPU with {psutil.cpu_count(logical=True)} logical cores, and "
            f"{mem.available / (1024**3):.1f} GB RAM available out of {mem.total / (1024**3):.1f} GB total."
        )
        intent = "query_system"
    elif "audio" in cleaned or "mic" in cleaned or "speaker" in cleaned or "device" in cleaned:
        audio = get_audio_info()
        if audio.get("available"):
            response = (
                f"Audio backend is active with {audio.get('total_devices', 0)} devices detected. "
                f"Default input index is {audio.get('default_input_index')} and output index is {audio.get('default_output_index')}."
            )
        else:
            response = "Audio backend sounddevice is not ready or failed to query."
        intent = "query_audio"
    elif "wake word" in cleaned:
        words = ", ".join(f'"{w}"' for w in cfg.system.wake_words)
        response = f"My active wake words are: {words}. You can also click the Orb or microphone button to activate me."
        intent = "query_wake_words"
    elif "joke" in cleaned:
        jokes = [
            "Why do programmers prefer dark mode? Because light attracts bugs!",
            "There are 10 types of people in the world: those who understand binary, and those who don't.",
            "Why did the Python script crash? Because it was feeling indentation-al pressure!",
        ]
        import random
        response = random.choice(jokes)
        intent = "entertainment"
    elif "who are you" in cleaned or "what can you do" in cleaned:
        response = (
            f"I am {assistant_name}, a local-first modular desktop AI. "
            "I can monitor your hardware, route voice commands, manage configurations, and execute desktop automation tasks."
        )
        intent = "query_identity"
    else:
        # Default conversational response (can be augmented by LLM)
        response = (
            f"I received your request: '{message}'. "
            f"I am operating in {cfg.llm.provider} mode. Ready to execute your instructions or voice commands."
        )
        intent = "general_query"

    # Log the interaction
    logger.info(f"Chat interaction: query='{message}' intent='{intent}'")

    return {
        "query": message,
        "response": response,
        "intent": intent,
        "timestamp": now.isoformat(),
        "assistant_name": assistant_name,
    }


def main():
    parser = argparse.ArgumentParser(description="Assistant Bridge CLI")
    parser.add_argument("--action", required=True, choices=["status", "audio", "config", "save-config", "logs", "chat", "listen-hardware"])
    parser.add_argument("--data", default=None, help="JSON payload for actions that require input")
    parser.add_argument("--stdin", action="store_true", help="Read JSON data from standard input")
    parser.add_argument("--lines", type=int, default=50, help="Number of log lines to read")
    parser.add_argument("--duration", type=float, default=3.0, help="Duration in seconds for hardware mic listen")
    args = parser.parse_args()

    try:
        raw_data = "{}"
        if args.stdin:
            raw_data = sys.stdin.read().strip() or "{}"
        elif args.data:
            raw_data = args.data

        if args.action == "status":
            result = get_system_status()
        elif args.action == "audio":
            result = get_audio_info()
        elif args.action == "listen-hardware":
            result = listen_hardware_mic(args.duration)
        elif args.action == "config":
            result = get_config_json()
        elif args.action == "save-config":
            payload = json.loads(raw_data)
            result = save_config_json(payload)
        elif args.action == "logs":
            result = {"lines": read_recent_logs(args.lines)}
        elif args.action == "chat":
            payload = json.loads(raw_data)
            msg = payload.get("message", "")
            result = process_chat_message(msg)
        else:
            result = {"error": f"Unknown action {args.action}"}

        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
