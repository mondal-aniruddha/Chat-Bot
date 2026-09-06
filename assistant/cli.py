"""Command-line interface (CLI) for the Windows Desktop Voice Assistant."""

import argparse
import json
import platform
import sys
from pathlib import Path
import psutil
import yaml
from colorama import Fore, Style

from assistant import __version__
from assistant.config.manager import get_config_manager
from assistant.core.event_bus import Event, EventType, get_event_bus
from assistant.core.state import AssistantState, StateManager
from assistant.utils.logging import get_logger, setup_logging

logger = get_logger("CLI")


def print_banner():
    """Prints the application banner."""
    print(Fore.CYAN + Style.BRIGHT + r"""
   __      __        _              ___           _        _                 _   
   \ \    / /__  _  (_) __  ___    /   \  ___ ___(_) ___  | |_  __ _  _ _   | |_ 
    \ \/\/ // _ \| | | |/ _|/ -_)  / - \ (_-<(_-<| |(_-<  |  _|/ _` || ' \  |  _|
     \_/\_/ \___/|_| |_|\__|\___| /_ _ _\/__//__/|_|/__/   \__|\__/_||_||_|  \__|
    """ + Style.RESET_ALL)
    print(Fore.LIGHTBLACK_EX + f"   Windows Desktop AI Voice Assistant v{__version__}" + Style.RESET_ALL)
    print(Fore.LIGHTBLACK_EX + "   Local-first, Modular, Extensible Desktop AI" + Style.RESET_ALL)
    print()


def cmd_info(args):
    """Displays comprehensive diagnostic and environment information."""
    print_banner()
    cfg_mgr = get_config_manager(args.config)
    cfg = cfg_mgr.config

    print(Fore.YELLOW + Style.BRIGHT + "== System & Environment ==" + Style.RESET_ALL)
    print(f"  - OS:              {platform.system()} {platform.release()} ({platform.version()})")
    print(f"  - Architecture:    {platform.machine()} ({platform.architecture()[0]})")
    print(f"  - Python:          {platform.python_version()} ({sys.executable})")
    print(f"  - CPU Cores:       {psutil.cpu_count(logical=False)} physical / {psutil.cpu_count(logical=True)} logical")
    mem = psutil.virtual_memory()
    print(f"  - System RAM:      {mem.total / (1024**3):.1f} GB total ({mem.available / (1024**3):.1f} GB available)")

    print("\n" + Fore.YELLOW + Style.BRIGHT + "== Audio Capabilities ==" + Style.RESET_ALL)
    try:
        import sounddevice as sd  # type: ignore[import-untyped, import-not-found]
        devices = sd.query_devices()
        default_in = sd.default.device[0]
        default_out = sd.default.device[1]
        print(f"  - Audio Backend:   sounddevice (PortAudio {sd.get_portaudio_version()})")
        print(f"  - Total Devices:   {len(devices)}")
        if default_in is not None and default_in >= 0:
            in_dev = devices[default_in]
            print(f"  - Default Mic:     [{default_in}] {in_dev['name']} ({in_dev['max_input_channels']} channels)")
        else:
            print("  - Default Mic:     No default input detected")

        if default_out is not None and default_out >= 0:
            out_dev = devices[default_out]
            print(f"  - Default Speaker: [{default_out}] {out_dev['name']} ({out_dev['max_output_channels']} channels)")
        else:
            print("  - Default Speaker: No default output detected")
    except ImportError:
        print(Fore.LIGHTBLACK_EX + "  - sounddevice is not yet installed (will be enabled in Phase 3)" + Style.RESET_ALL)
    except Exception as e:
        print(Fore.RED + f"  - Error querying audio devices: {e}" + Style.RESET_ALL)

    print("\n" + Fore.YELLOW + Style.BRIGHT + "== Active Assistant Configuration ==" + Style.RESET_ALL)
    print(f"  - Assistant Name:  {cfg.system.name}")
    print(f"  - Wake Words:      {', '.join(cfg.system.wake_words)}")
    print(f"  - STT Engine:      {cfg.stt.engine} ({cfg.stt.model_size}) on {cfg.stt.device}")
    print(f"  - TTS Engine:      {cfg.tts.engine} (rate: {cfg.tts.rate} wpm, vol: {cfg.tts.volume})")
    print(f"  - LLM Provider:    {cfg.llm.provider} (fallback to rules: {cfg.llm.fallback_to_rules})")
    print(f"  - Log File:        {cfg.logging.log_file} (level: {cfg.logging.level})")
    print()


def cmd_config(args):
    """Outputs or validates current configuration."""
    cfg_mgr = get_config_manager(args.config)
    cfg = cfg_mgr.config

    if args.json:
        print(json.dumps(cfg.model_dump(), indent=2))
    else:
        print(yaml.dump(cfg.model_dump(), sort_keys=False))

    print(Fore.GREEN + "Configuration validated successfully!" + Style.RESET_ALL)


def cmd_test_core(args):
    """Runs a live verification of StateManager and EventBus."""
    print_banner()
    print(Fore.CYAN + "Running Core Subsystem Verification...\n" + Style.RESET_ALL)

    # 1. Test Event Bus
    bus = get_event_bus()
    received_events = []

    def on_event(ev: Event):
        received_events.append(ev)

    bus.subscribe(EventType.STATE_CHANGED, on_event)
    bus.subscribe(EventType.USER_MESSAGE, on_event)

    # 2. Test State Manager
    state_mgr = StateManager(AssistantState.IDLE)
    assert state_mgr.current_state == AssistantState.IDLE
    print(Fore.GREEN + f"  [PASS] Initial state: {state_mgr.current_state.value}" + Style.RESET_ALL)

    # Transition to LISTENING
    state_mgr.set_state(AssistantState.LISTENING, reason="User triggered manual listen")
    bus.emit(EventType.STATE_CHANGED, {"state": AssistantState.LISTENING.value}, source="test")
    assert state_mgr.is_listening

    # Emit message event
    bus.emit(EventType.USER_MESSAGE, {"text": "Hello Assistant"}, source="cli_test")

    # Transition to THINKING -> SPEAKING -> IDLE
    state_mgr.set_state(AssistantState.THINKING)
    state_mgr.set_state(AssistantState.SPEAKING)
    state_mgr.set_state(AssistantState.IDLE)

    assert len(received_events) == 2
    print(Fore.GREEN + f"  [PASS] EventBus received {len(received_events)} test events correctly" + Style.RESET_ALL)
    print(Fore.GREEN + f"  [PASS] Final State: {state_mgr.current_state.value}" + Style.RESET_ALL)
    print("\n" + Fore.GREEN + Style.BRIGHT + "All core verification checks passed!" + Style.RESET_ALL)


def main():
    """Main CLI entrypoint parser."""
    parser = argparse.ArgumentParser(
        prog="assistant",
        description="Windows Desktop Voice Assistant CLI",
    )
    parser.add_argument(
        "-c", "--config", type=str, default=None, help="Path to custom config.yaml file"
    )
    parser.add_argument(
        "--debug", action="store_true", help="Enable verbose debug logging"
    )

    subparsers = parser.add_subparsers(dest="command", help="Assistant Commands")

    # Command: info
    p_info = subparsers.add_parser("info", help="Show system environment and diagnostic information")
    p_info.set_defaults(func=cmd_info)

    # Command: config
    p_config = subparsers.add_parser("config", help="View or validate configuration")
    p_config.add_argument("--json", action="store_true", help="Output configuration as JSON instead of YAML")
    p_config.set_defaults(func=cmd_config)

    # Command: test-core
    p_test = subparsers.add_parser("test-core", help="Run self-test of Core EventBus and StateManager")
    p_test.set_defaults(func=cmd_test_core)

    args = parser.parse_args()

    # Setup initial logging
    log_level = "DEBUG" if args.debug else "INFO"
    setup_logging(level_name=log_level)

    if not args.command:
        parser.print_help()
        sys.exit(0)

    try:
        args.func(args)
    except KeyboardInterrupt:
        print("\n" + Fore.YELLOW + "Operation cancelled by user." + Style.RESET_ALL)
        sys.exit(0)
    except Exception as e:
        logger.error(f"Command execution error: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
