# Walkthrough - Full-Stack React & Node.js Web Console with Voice Detection

We have built and verified a modern, full-stack web application for the Windows Desktop AI Voice Assistant (`desktop-voice-assistant`).

---

## 1. Architecture Overview

```
Chat-Bot/
├── assistant/               # Python Assistant Core Subsystem
│   ├── bridge.py            # JSON RPC Bridge (status, audio, chat, config, hardware mic)
│   ├── config/              # Pydantic v2 schemas & YAML config manager
│   ├── core/                # EventBus & StateManager
│   └── cli.py               # Diagnostic & CLI commands
├── server/                  # Node.js + Express API Bridge Server (:5000)
│   ├── index.js             # Express API & Server-Sent Events (SSE) stream
│   ├── pythonBridge.js      # Subprocess execution bridge to .venv/Scripts/python.exe
│   └── package.json
├── frontend/                # React + Vite Web Application (:5173)
│   ├── index.html           # Google Fonts (Inter, Outfit, JetBrains Mono)
│   ├── vite.config.js       # Proxy configuration forwarding /api to :5000
│   └── src/
│       ├── index.css        # Cyberpunk/Sci-Fi dark glassmorphism design system
│       ├── App.jsx          # Main application coordinating SSE, voice, and telemetry
│       └── components/
│           ├── OrbVisualizer.jsx     # 3D-inspired voice orb reacting to real microphone volume
│           ├── ChatConsole.jsx       # Voice input, Web Audio analyser & live transcription
│           ├── SystemTelemetry.jsx   # Live CPU, RAM, PortAudio devices & hardware mic tester
│           ├── StateControls.jsx     # Manual state machine transitions for dev testing
│           ├── ConfigPanel.jsx       # Slide-over modal for live configuration tuning
│           └── LogStreamer.jsx       # Real-time streaming log terminal from logs/assistant.log
└── run-web.ps1              # Single-command launcher script for backend and frontend
```

---

## 2. Voice Detection: Why It Failed & How It Was Fixed

### Root Cause of Voice Detection Issue:
1. **Missing Browser Permission Gesture**: Browsers require an explicit `getUserMedia` call to display the native microphone permission dialog. Calling `SpeechRecognition.start()` alone often failed silently or threw `not-allowed`.
2. **Lack of Visual Feedback**: `interimResults` was previously disabled, meaning the user saw no live transcription while speaking.
3. **Missing Python NumPy for SoundDevice**: `sounddevice.rec()` required `numpy` which had not yet been installed in `.venv`.

### Fixes Implemented:
1. **Explicit Microphone Permission Prompt**:
   - Calling the mic button now explicitly invokes `await navigator.mediaDevices.getUserMedia({ audio: true })`, ensuring the browser prompts with the permission dialog: **"localhost:5173 wants to use your microphone: [Allow]"**.
2. **Real-time Web Audio API Volume Meter**:
   - The microphone stream is routed through an `AudioContext` and `AnalyserNode`.
   - Real-time RMS audio volume is measured at 60 FPS and passed directly to the **Neural Voice Orb**, which pulses and expands to your exact voice!
3. **Live Interim Voice Capsule**:
   - `interimResults: true` is enabled on `SpeechRecognition`.
   - As you speak, a glowing banner appears showing:
     `🎙️ Hearing: "what time is it..."` with animated soundwave bars.
   - Automatically commits and sends the message when speech finalizes.
4. **Physical Hardware Mic Tester**:
   - Added a **⚡ Test Hardware Mic** button directly on the Microphone card in the System Telemetry panel.
   - Records 2.5 seconds directly through Python and PortAudio (`sounddevice` + `numpy`) to verify physical microphone reception independently of the browser.

---

## 3. How to Use & Test the Voice Assistant

### Starting the Servers
Both servers are currently running:
- **Node API Server**: `http://localhost:5000`
- **React Frontend**: `http://localhost:5173`

*(To start them in the future with one click, run `.\run-web.ps1` in PowerShell)*.

### Testing Voice Input in Browser (`http://localhost:5173`):
1. Open **[http://localhost:5173](http://localhost:5173)** in **Google Chrome** or **Microsoft Edge**.
2. Click the **Microphone button** (or click the **Neural Voice Orb**).
3. If prompted by your browser: click **"Allow"** to grant microphone access.
4. Speak clearly (e.g. *"What time is it?"* or *"Check system specs"*).
5. Watch the live **"Hearing: ..."** banner display your speech and observe the Orb pulse to your voice.
6. The assistant will answer with text and speak the response aloud using speech synthesis.

### Testing Hardware Microphone Directly:
In the right panel under **PortAudio Hardware -> Microphone (Realtek Audio)**, click **⚡ Test Hardware Mic**. Speak for 2 seconds, and it will report the exact peak amplitude and confirm voice reception.
