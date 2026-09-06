"""Thread-safe publish/subscribe event bus for inter-component communication."""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import threading
import time
from typing import Any, Callable, Dict, List, Optional
from assistant.utils.logging import get_logger

logger = get_logger("EventBus")


class EventType(str, Enum):
    """Event types emitted across the assistant subsystem."""

    # Lifecycle & State
    STATE_CHANGED = "state_changed"
    ERROR_OCCURRED = "error_occurred"

    # Audio & Voice Processing
    AUDIO_LEVEL = "audio_level"  # RMS level for waveform visualizer
    WAKE_WORD_DETECTED = "wake_word_detected"
    SPEECH_STARTED = "speech_started"
    SPEECH_ENDED = "speech_ended"
    TRANSCRIPTION_READY = "transcription_ready"

    # Conversation & Reasoning
    USER_MESSAGE = "user_message"
    ASSISTANT_RESPONSE = "assistant_response"

    # Tool Execution
    TOOL_CALL_STARTED = "tool_call_started"
    TOOL_CALL_FINISHED = "tool_call_finished"

    # Speech Synthesis & Interruption
    SPEECH_SYNTHESIS_STARTED = "speech_synthesis_started"
    SPEECH_SYNTHESIS_FINISHED = "speech_synthesis_finished"
    INTERRUPT_REQUESTED = "interrupt_requested"


@dataclass
class Event:
    """Event payload passed through the EventBus."""

    event_type: EventType
    data: Dict[str, Any] = field(default_factory=dict)
    source: str = "core"
    timestamp: float = field(default_factory=time.time)

    @property
    def formatted_time(self) -> str:
        return datetime.fromtimestamp(self.timestamp).strftime("%H:%M:%S.%f")[:-3]


EventHandler = Callable[[Event], None]


class EventBus:
    """Thread-safe Pub/Sub event bus."""

    def __init__(self):
        self._subscribers: Dict[EventType, List[EventHandler]] = {}
        self._all_subscribers: List[EventHandler] = []
        self._lock = threading.RLock()

    def subscribe(self, event_type: EventType, handler: EventHandler) -> None:
        """Subscribes a callback handler to a specific event type."""
        with self._lock:
            if event_type not in self._subscribers:
                self._subscribers[event_type] = []
            if handler not in self._subscribers[event_type]:
                self._subscribers[event_type].append(handler)

    def subscribe_all(self, handler: EventHandler) -> None:
        """Subscribes a callback handler to ALL published events."""
        with self._lock:
            if handler not in self._all_subscribers:
                self._all_subscribers.append(handler)

    def unsubscribe(self, event_type: EventType, handler: EventHandler) -> None:
        """Unsubscribes a handler from a specific event type."""
        with self._lock:
            if event_type in self._subscribers and handler in self._subscribers[event_type]:
                self._subscribers[event_type].remove(handler)

    def unsubscribe_all(self, handler: EventHandler) -> None:
        """Unsubscribes a global handler."""
        with self._lock:
            if handler in self._all_subscribers:
                self._all_subscribers.remove(handler)

    def publish(self, event: Event) -> None:
        """Publishes an event to all registered subscribers."""
        with self._lock:
            handlers = list(self._subscribers.get(event.event_type, []))
            all_handlers = list(self._all_subscribers)

        # Execute handlers outside lock
        for handler in handlers:
            try:
                handler(event)
            except Exception as e:
                logger.error(
                    f"Error in handler {handler.__name__ if hasattr(handler, '__name__') else handler} "
                    f"for event {event.event_type.value}: {e}",
                    exc_info=True,
                )

        for handler in all_handlers:
            try:
                handler(event)
            except Exception as e:
                logger.error(
                    f"Error in global handler for event {event.event_type.value}: {e}",
                    exc_info=True,
                )

    def emit(self, event_type: EventType, data: Optional[Dict[str, Any]] = None, source: str = "core") -> None:
        """Convenience method to construct and publish an Event."""
        event = Event(event_type=event_type, data=data or {}, source=source)
        self.publish(event)


# Global singleton event bus
_bus_instance: Optional[EventBus] = None


def get_event_bus() -> EventBus:
    """Returns the global EventBus singleton."""
    global _bus_instance
    if _bus_instance is None:
        _bus_instance = EventBus()
    return _bus_instance
