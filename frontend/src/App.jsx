import React, { useState, useEffect, useCallback } from 'react';
import OrbVisualizer from './components/OrbVisualizer';
import ChatConsole from './components/ChatConsole';
import SystemTelemetry from './components/SystemTelemetry';
import StateControls from './components/StateControls';
import LogStreamer from './components/LogStreamer';
import ConfigPanel from './components/ConfigPanel';

export default function App() {
  const [currentState, setCurrentState] = useState('idle');
  const [audioLevel, setAudioLevel] = useState(0.04);
  const [status, setStatus] = useState(null);
  const [audio, setAudio] = useState(null);
  const [config, setConfig] = useState(null);
  const [modelCatalog, setModelCatalog] = useState([]);
  const [selectedModelId, setSelectedModelId] = useState(null);
  const [modelState, setModelState] = useState({ loading: true, error: null });
  const [logs, setLogs] = useState([]);
  const [messages, setMessages] = useState([
    {
      sender: 'assistant',
      text: 'Hello! I am your Windows Desktop AI Voice Assistant. You can speak to me or type commands below.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  // Fetch initial telemetry and config
  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        if (data.assistant_state) setCurrentState(data.assistant_state);
      }
    } catch (e) {
      console.warn('Status poll error:', e);
    }
  };

  const fetchAudio = async () => {
    try {
      const res = await fetch('/api/audio-devices');
      if (res.ok) setAudio(await res.json());
    } catch (e) {
      console.warn('Audio poll error:', e);
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/config');
      if (res.ok) setConfig(await res.json());
    } catch (e) {
      console.warn('Config fetch error:', e);
    }
  };

  const fetchModels = async () => {
    setModelState({ loading: true, error: null });
    try {
      const res = await fetch('/api/models');
      if (!res.ok) throw new Error('Model catalog could not be loaded');
      const data = await res.json();
      const models = Array.isArray(data.models) ? data.models : [];
      setModelCatalog(models);
      setSelectedModelId((current) => {
        const saved = current || window.localStorage.getItem('assistant.selectedModelId');
        const savedModel = models.find((model) => model.id === saved && model.available);
        return savedModel ? savedModel.id : (data.defaultModel || null);
      });
      setModelState({ loading: false, error: null });
    } catch (error) {
      console.warn('Model discovery error:', error);
      setModelCatalog([]);
      setModelState({ loading: false, error: 'Unable to load configured LLM models.' });
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/logs?lines=40');
      if (res.ok) {
        const data = await res.json();
        if (data.lines) setLogs(data.lines);
      }
    } catch (e) {
      console.warn('Logs fetch error:', e);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchAudio();
    fetchConfig();
    fetchModels();
    fetchLogs();

    // Regular polling for hardware telemetry & logs
    const interval = setInterval(() => {
      fetchStatus();
      fetchLogs();
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  // Connect to SSE event stream for real-time state transitions and audio RMS levels
  useEffect(() => {
    const eventSource = new EventSource('/api/events');

    eventSource.addEventListener('init', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.state) setCurrentState(data.state);
      } catch (err) {}
    });

    eventSource.addEventListener('state_changed', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.state) setCurrentState(data.state);
      } catch (err) {}
    });

    eventSource.addEventListener('audio_level', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (typeof data.level === 'number') {
          setAudioLevel(data.level);
        }
      } catch (err) {}
    });

    return () => {
      eventSource.close();
    };
  }, []);

  // Send message to assistant
  const handleSendMessage = async (text) => {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg = { sender: 'user', text, timestamp: timeStr };
    setMessages((prev) => [...prev, userMsg]);
    setCurrentState('thinking');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, modelId: selectedModelId || undefined }),
      });

      if (!res.ok) {
        const errorPayload = await res.json().catch(() => ({}));
        throw new Error(errorPayload.error || `Server returned ${res.status}`);
      }
      const data = await res.json();

      const aiMsg = {
        sender: 'assistant',
        text: data.response,
        intent: data.intent,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, aiMsg]);
      setCurrentState('speaking');

      // Voice vocalization using browser SpeechSynthesis
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(data.response);
        utterance.rate = (config?.tts?.rate || 190) / 190;
        utterance.volume = config?.tts?.volume ?? 1.0;
        utterance.onend = () => setCurrentState('idle');
        window.speechSynthesis.speak(utterance);
      }

      setTimeout(() => {
        setCurrentState((curr) => (curr === 'speaking' ? 'idle' : curr));
      }, data.speech_duration_ms || 3000);

    } catch (err) {
      console.error('Chat error:', err);
      setCurrentState('error');
      setMessages((prev) => [
        ...prev,
        {
          sender: 'assistant',
          text: `Error processing command: ${err.message}`,
          timestamp: timeStr,
        },
      ]);
      setTimeout(() => setCurrentState('idle'), 3000);
    }
  };

  const handleModelChange = (modelId) => {
    setSelectedModelId(modelId || null);
    if (modelId) window.localStorage.setItem('assistant.selectedModelId', modelId);
    else window.localStorage.removeItem('assistant.selectedModelId');
  };

  // Manual state transition
  const handleTransitionState = async (newState, reason) => {
    setCurrentState(newState);
    try {
      await fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: newState, reason }),
      });
    } catch (e) {
      console.warn('State transition error:', e);
    }
  };

  // Interrupt active speech
  const handleInterrupt = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    handleTransitionState('idle', 'User triggered interrupt');
  };

  // Orb click action
  const handleOrbClick = () => {
    if (currentState === 'idle') {
      handleTransitionState('listening', 'Orb clicked to activate listening');
    } else if (currentState === 'listening') {
      handleTransitionState('idle', 'Orb clicked to deactivate');
    } else {
      handleInterrupt();
    }
  };

  // Save updated config
  const handleSaveConfig = async (newConfig) => {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newConfig),
    });
    if (!res.ok) throw new Error('Failed to save configuration');
    const result = await res.json();
    if (result.config) setConfig(result.config);
    fetchModels();
    return result;
  };

  return (
    <>
      {/* Top Navigation Header */}
      <header className="app-header">
        <div className="brand">
          <div className="brand-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#030712" strokeWidth="2.5">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="23"></line>
              <line x1="8" y1="23" x2="16" y2="23"></line>
            </svg>
          </div>
          <div>
            <h1 className="brand-title">{config?.system?.name || 'Desktop AI Assistant'}</h1>
            <div className="brand-subtitle">Local-First Neural Console</div>
          </div>
        </div>

        <div className="header-status-badge">
          <span className={`status-dot ${currentState}`}></span>
          <span style={{ textTransform: 'capitalize' }}>{currentState.replace(/_/g, ' ')}</span>
        </div>

        <div className="header-actions">
          <button 
            className="btn btn-glass" 
            onClick={() => setIsConfigOpen(true)}
            id="open-settings-button"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            <span>Settings</span>
          </button>
        </div>
      </header>

      {/* Main 3-Column Grid */}
      <main className="main-container">
        {/* Left Column: Voice Orb & State Controls */}
        <section className="column-left">
          <div className="glass-panel">
            <div className="panel-header">
              <div className="panel-title">
                <span>Neural Voice Orb</span>
                <span className="panel-title-badge">Audio React</span>
              </div>
            </div>

            <OrbVisualizer 
              state={currentState} 
              audioLevel={audioLevel} 
              onOrbClick={handleOrbClick} 
            />
          </div>

          <StateControls 
            currentState={currentState}
            onTransitionState={handleTransitionState}
            onInterrupt={handleInterrupt}
          />
        </section>

        {/* Center Column: Interactive Conversational Console */}
        <section className="column-center">
          <ChatConsole 
            messages={messages}
            onSendMessage={handleSendMessage}
            onMicToggle={(listening) => {
              handleTransitionState(listening ? 'listening' : 'idle', 'Microphone toggle');
            }}
            isListening={currentState === 'listening'}
            isThinking={currentState === 'thinking'}
            onAudioLevel={setAudioLevel}
            models={modelCatalog}
            selectedModelId={selectedModelId}
            modelLoading={modelState.loading}
            modelError={modelState.error}
            onModelChange={handleModelChange}
          />
        </section>

        {/* Right Column: Hardware Telemetry & Live Log Terminal */}
        <section className="column-right" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <SystemTelemetry 
            status={status} 
            audio={audio} 
            currentState={currentState} 
          />

          <LogStreamer 
            logs={logs} 
            onRefreshLogs={fetchLogs} 
          />
        </section>
      </main>

      {/* Settings Modal */}
      <ConfigPanel 
        isOpen={isConfigOpen} 
        onClose={() => setIsConfigOpen(false)}
        config={config}
        onSaveConfig={handleSaveConfig}
      />
    </>
  );
}
