/**
 * Express API Server and SSE Event Stream for Desktop AI Assistant.
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { callPythonBridge } from './pythonBridge.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, '../frontend/dist');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// In-memory Assistant State tracking
let currentState = 'idle';
let previousState = 'idle';
let activeClients = new Set();

function broadcastSSE(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of activeClients) {
    try {
      client.write(payload);
    } catch (e) {
      activeClients.delete(client);
    }
  }
}

function updateState(newState, reason = '') {
  if (currentState === newState) return;
  previousState = currentState;
  currentState = newState;
  console.log(`[State Transition] ${previousState} -> ${currentState} (${reason})`);
  broadcastSSE('state_changed', {
    state: currentState,
    previous_state: previousState,
    reason,
    timestamp: new Date().toISOString(),
  });
}

// Background audio level simulator when LISTENING or SPEAKING
setInterval(() => {
  if (activeClients.size === 0) return;
  if (currentState === 'listening' || currentState === 'speaking') {
    const level = 0.2 + Math.random() * 0.75;
    broadcastSSE('audio_level', {
      level: parseFloat(level.toFixed(3)),
      state: currentState,
      timestamp: Date.now(),
    });
  } else {
    // low background noise
    const idleLevel = 0.02 + Math.random() * 0.05;
    broadcastSSE('audio_level', {
      level: parseFloat(idleLevel.toFixed(3)),
      state: currentState,
      timestamp: Date.now(),
    });
  }
}, 120);

// --- REST API Endpoints ---

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'assistant-bridge', port: PORT, state: currentState });
});

// System diagnostics
app.get('/api/status', async (req, res) => {
  try {
    const status = await callPythonBridge('status');
    res.json({
      ...status,
      assistant_state: currentState,
      previous_state: previousState,
    });
  } catch (err) {
    console.error('Failed to get status:', err.message);
    res.status(500).json({ error: err.message, assistant_state: currentState });
  }
});

// Audio devices
app.get('/api/audio-devices', async (req, res) => {
  try {
    const audio = await callPythonBridge('audio');
    res.json(audio);
  } catch (err) {
    console.error('Failed to query audio devices:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Assistant configuration
app.get('/api/config', async (req, res) => {
  try {
    const config = await callPythonBridge('config');
    res.json(config);
  } catch (err) {
    console.error('Failed to get config:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Update configuration
app.post('/api/config', async (req, res) => {
  try {
    const result = await callPythonBridge('save-config', req.body);
    res.json(result);
  } catch (err) {
    console.error('Failed to update config:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Configured LLM model catalog. The Python bridge omits secrets by design.
app.get('/api/models', async (req, res) => {
  try {
    res.json(await callPythonBridge('models'));
  } catch (err) {
    console.error('Failed to discover models:', err.message);
    res.status(500).json({ error: 'Unable to retrieve configured LLM models.' });
  }
});

// Manual State Transition
app.post('/api/state', (req, res) => {
  const { state, reason } = req.body;
  const validStates = ['idle', 'wake_word_detected', 'listening', 'thinking', 'speaking', 'error'];
  if (!validStates.includes(state)) {
    return res.status(400).json({ error: `Invalid state: ${state}. Must be one of ${validStates.join(', ')}` });
  }
  updateState(state, reason || 'Manual UI Trigger');
  res.json({ success: true, current_state: currentState });
});

// Hardware Microphone Audio Check
app.post('/api/hardware-listen', async (req, res) => {
  const duration = parseFloat(req.body.duration) || 3.0;
  updateState('listening', `Recording ${duration}s from hardware mic`);
  try {
    const result = await callPythonBridge('listen-hardware', null, { duration });
    updateState('idle', 'Hardware mic test completed');
    res.json(result);
  } catch (err) {
    console.error('Hardware mic error:', err.message);
    updateState('error', err.message);
    setTimeout(() => updateState('idle'), 2000);
    res.status(500).json({ error: err.message });
  }
});

// Chat processing
app.post('/api/chat', async (req, res) => {
  const { message, modelId } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid message property' });
  }
  if (modelId !== undefined && typeof modelId !== 'string') {
    return res.status(400).json({ error: 'Invalid modelId property' });
  }

  // 1. Transition to THINKING
  updateState('thinking', `Processing query: "${message.slice(0, 30)}..."`);

  try {
    // 2. Call Python bridge for response
    const reply = await callPythonBridge('chat', { message, modelId });

    // 3. Transition to SPEAKING
    updateState('speaking', 'Vocalizing response');

    // Estimate speaking duration: roughly 150 words per minute ~ 400ms per word, min 2s
    const wordCount = reply.response.split(/\s+/).length;
    const durationMs = Math.min(Math.max(wordCount * 300, 2000), 7000);

    setTimeout(() => {
      if (currentState === 'speaking') {
        updateState('idle', 'Completed speech output');
      }
    }, durationMs);

    res.json({
      ...reply,
      current_state: currentState,
      speech_duration_ms: durationMs,
    });
  } catch (err) {
    console.error('Error processing chat:', err.message);
    updateState('error', err.message);
    setTimeout(() => updateState('idle', 'Recovered from error'), 3000);
    const isModelSelectionError = /selected model|unavailable|unsupported provider/i.test(err.message);
    res.status(isModelSelectionError ? 400 : 500).json({
      error: isModelSelectionError
        ? 'The selected model is unavailable. Refresh the model list and choose another model.'
        : 'Unable to process the chat request.',
    });
  }
});

// Logs
app.get('/api/logs', async (req, res) => {
  try {
    const lines = parseInt(req.query.lines, 10) || 50;
    const logs = await callPythonBridge('logs', null, { lines });
    res.json(logs);
  } catch (err) {
    console.error('Failed to get logs:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Server-Sent Events (SSE) Stream
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  activeClients.add(res);

  // Send initial state handshake
  res.write(`event: init\ndata: ${JSON.stringify({ state: currentState, timestamp: Date.now() })}\n\n`);

  req.on('close', () => {
    activeClients.delete(res);
  });
});

// Serve frontend static assets if dist folder exists
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`  Assistant Node.js Bridge Server running on :${PORT}`);
  console.log(`  Connected to Python interpreter in .venv`);
  console.log(`====================================================`);
});
