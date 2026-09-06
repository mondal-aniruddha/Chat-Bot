"""Unit tests for StateManager."""

import threading
from assistant.core.state import AssistantState, StateManager


def test_initial_state():
    mgr = StateManager()
    assert mgr.current_state == AssistantState.IDLE
    assert mgr.is_idle
    assert not mgr.is_listening
    assert not mgr.is_speaking


def test_state_transitions():
    mgr = StateManager()
    history = []

    def on_change(old_state, new_state):
        history.append((old_state, new_state))

    mgr.add_listener(on_change)

    assert mgr.set_state(AssistantState.LISTENING) is True
    assert mgr.current_state == AssistantState.LISTENING
    assert mgr.previous_state == AssistantState.IDLE
    assert mgr.is_listening

    # Setting same state returns False and triggers no listeners
    assert mgr.set_state(AssistantState.LISTENING) is False
    assert len(history) == 1

    assert mgr.set_state(AssistantState.THINKING) is True
    assert mgr.is_thinking

    assert mgr.set_state(AssistantState.SPEAKING) is True
    assert mgr.is_speaking

    assert mgr.set_state(AssistantState.IDLE) is True
    assert mgr.is_idle

    assert len(history) == 4
    assert history[0] == (AssistantState.IDLE, AssistantState.LISTENING)
    assert history[1] == (AssistantState.LISTENING, AssistantState.THINKING)
    assert history[2] == (AssistantState.THINKING, AssistantState.SPEAKING)
    assert history[3] == (AssistantState.SPEAKING, AssistantState.IDLE)


def test_listener_removal():
    mgr = StateManager()
    called = []

    def listener(o, n):
        called.append((o, n))

    mgr.add_listener(listener)
    mgr.set_state(AssistantState.LISTENING)
    assert len(called) == 1

    mgr.remove_listener(listener)
    mgr.set_state(AssistantState.IDLE)
    assert len(called) == 1


def test_thread_safety():
    mgr = StateManager()

    def worker():
        for _ in range(100):
            mgr.set_state(AssistantState.LISTENING)
            mgr.set_state(AssistantState.IDLE)

    threads = [threading.Thread(target=worker) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert mgr.current_state in [AssistantState.IDLE, AssistantState.LISTENING]
