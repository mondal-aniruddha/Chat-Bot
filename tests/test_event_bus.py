"""Unit tests for EventBus."""

import threading
from assistant.core.event_bus import Event, EventBus, EventType


def test_subscribe_and_emit():
    bus = EventBus()
    received = []

    def handler(ev: Event):
        received.append(ev)

    bus.subscribe(EventType.USER_MESSAGE, handler)
    bus.emit(EventType.USER_MESSAGE, {"text": "Hello"}, source="tester")

    assert len(received) == 1
    assert received[0].event_type == EventType.USER_MESSAGE
    assert received[0].data["text"] == "Hello"
    assert received[0].source == "tester"


def test_subscribe_all():
    bus = EventBus()
    received = []

    def all_handler(ev: Event):
        received.append(ev)

    bus.subscribe_all(all_handler)
    bus.emit(EventType.STATE_CHANGED, {"state": "listening"})
    bus.emit(EventType.AUDIO_LEVEL, {"rms": 0.05})

    assert len(received) == 2


def test_unsubscribe():
    bus = EventBus()
    received = []

    def handler(ev: Event):
        received.append(ev)

    bus.subscribe(EventType.USER_MESSAGE, handler)
    bus.emit(EventType.USER_MESSAGE, {"text": "One"})
    assert len(received) == 1

    bus.unsubscribe(EventType.USER_MESSAGE, handler)
    bus.emit(EventType.USER_MESSAGE, {"text": "Two"})
    assert len(received) == 1


def test_handler_error_isolation():
    bus = EventBus()
    healthy_received = []

    def bad_handler(ev: Event):
        raise RuntimeError("Something failed")

    def good_handler(ev: Event):
        healthy_received.append(ev)

    bus.subscribe(EventType.USER_MESSAGE, bad_handler)
    bus.subscribe(EventType.USER_MESSAGE, good_handler)

    # Should not raise exception
    bus.emit(EventType.USER_MESSAGE, {"text": "Safe message"})
    assert len(healthy_received) == 1


def test_concurrent_emit():
    bus = EventBus()
    count = 0
    lock = threading.Lock()

    def handler(ev: Event):
        nonlocal count
        with lock:
            count += 1

    bus.subscribe(EventType.AUDIO_LEVEL, handler)

    def worker():
        for _ in range(50):
            bus.emit(EventType.AUDIO_LEVEL, {"rms": 0.02})

    threads = [threading.Thread(target=worker) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert count == 200
