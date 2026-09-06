"""Assistant state definitions and state management."""

from enum import Enum
import threading
from typing import Callable, List, Optional
from assistant.utils.logging import get_logger

logger = get_logger("State")


class AssistantState(str, Enum):
    """Lifecycle states of the voice assistant."""

    IDLE = "idle"
    WAKE_WORD_DETECTED = "wake_word_detected"
    LISTENING = "listening"
    THINKING = "thinking"
    SPEAKING = "speaking"
    ERROR = "error"


class StateManager:
    """Thread-safe state manager with change notifications."""

    def __init__(self, initial_state: AssistantState = AssistantState.IDLE):
        self._current_state = initial_state
        self._previous_state = initial_state
        self._lock = threading.RLock()
        self._listeners: List[Callable[[AssistantState, AssistantState], None]] = []

    @property
    def current_state(self) -> AssistantState:
        with self._lock:
            return self._current_state

    @property
    def previous_state(self) -> AssistantState:
        with self._lock:
            return self._previous_state

    @property
    def is_idle(self) -> bool:
        return self.current_state == AssistantState.IDLE

    @property
    def is_listening(self) -> bool:
        return self.current_state == AssistantState.LISTENING

    @property
    def is_thinking(self) -> bool:
        return self.current_state == AssistantState.THINKING

    @property
    def is_speaking(self) -> bool:
        return self.current_state == AssistantState.SPEAKING

    def add_listener(self, callback: Callable[[AssistantState, AssistantState], None]) -> None:
        """Subscribes a listener to state transition events."""
        with self._lock:
            if callback not in self._listeners:
                self._listeners.append(callback)

    def remove_listener(self, callback: Callable[[AssistantState, AssistantState], None]) -> None:
        """Removes a previously registered listener."""
        with self._lock:
            if callback in self._listeners:
                self._listeners.remove(callback)

    def set_state(self, new_state: AssistantState, reason: Optional[str] = None) -> bool:
        """Transitions to a new state if different from current state.

        Returns True if transition occurred, False if state was already active.
        """
        with self._lock:
            if self._current_state == new_state:
                return False

            old_state = self._current_state
            self._previous_state = old_state
            self._current_state = new_state

            desc = f"State transition: {old_state.value} -> {new_state.value}"
            if reason:
                desc += f" (reason: {reason})"
            logger.info(desc)

            listeners_copy = list(self._listeners)

        # Notify outside the lock to avoid deadlock in callbacks
        for listener in listeners_copy:
            try:
                listener(old_state, new_state)
            except Exception as e:
                logger.error(f"Error in state change listener: {e}", exc_info=True)

        return True
