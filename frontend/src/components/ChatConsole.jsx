import React, { useState, useEffect, useRef } from 'react';

/**
 * Enhanced Conversational Chat Console with real-time Web Audio API metering,
 * browser Speech Recognition, live interim transcription, and explicit mic permission handling.
 */
export default function ChatConsole({ 
  messages = [], 
  onSendMessage, 
  onMicToggle, 
  isListening = false,
  isThinking = false,
  onAudioLevel,
  models = [],
  selectedModelId,
  modelLoading = false,
  modelError = null,
  onModelChange,
}) {
  const [inputText, setInputText] = useState('');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [micError, setMicError] = useState(null);
  const [hasMicPermission, setHasMicPermission] = useState(null);

  const historyEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const isListeningRef = useRef(isListening);
  const mediaStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);
  const silenceTimerRef = useRef(null);

  // Keep isListeningRef synced
  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  // Auto-scroll on new message
  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking, liveTranscript]);

  // Start real-time audio volume analysis via Web Audio API
  const startAudioAnalysis = (stream) => {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContextClass();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const normalizedLevel = Math.min(Math.max(average / 128, 0.04), 1.0);

        if (onAudioLevel) {
          onAudioLevel(normalizedLevel);
        }

        animFrameRef.current = requestAnimationFrame(updateVolume);
      };

      updateVolume();
    } catch (err) {
      console.warn('AudioContext analysis error:', err);
    }
  };

  // Stop audio analysis & release mic
  const stopAudioAnalysis = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (onAudioLevel) {
      onAudioLevel(0.04);
    }
  };

  // Initialize and start speech recognition
  const startListeningSession = async () => {
    setMicError(null);
    setLiveTranscript('');

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMicError(
        'Web Speech API is not supported in this browser. Please use Google Chrome, Microsoft Edge, or type your message below.'
      );
      return;
    }

    // 1. Explicitly request microphone stream to ensure browser prompt appears
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      setHasMicPermission(true);
      startAudioAnalysis(stream);
    } catch (err) {
      console.error('Microphone permission error:', err);
      setHasMicPermission(false);
      setMicError(
        'Microphone access was denied or not found. Please click the lock or camera/mic icon in your address bar, set Microphone to "Allow", and try again.'
      );
      onMicToggle(false);
      return;
    }

    // 2. Instantiate and configure SpeechRecognition
    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        onMicToggle(true);
      };

      recognition.onresult = (event) => {
        let interimText = '';
        let finalText = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalText += transcript;
          } else {
            interimText += transcript;
          }
        }

        const currentSpeech = finalText || interimText;
        setLiveTranscript(currentSpeech);

        // Reset silence timer on speech
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

        // If we have final text, or if user pauses after speaking, auto-submit
        if (finalText.trim()) {
          const messageToSend = finalText.trim();
          setLiveTranscript('');
          stopListeningSession();
          onSendMessage(messageToSend);
        } else if (interimText.trim().length > 3) {
          // Auto-commit after 1.8 seconds of trailing silence
          silenceTimerRef.current = setTimeout(() => {
            if (isListeningRef.current && interimText.trim()) {
              const messageToSend = interimText.trim();
              setLiveTranscript('');
              stopListeningSession();
              onSendMessage(messageToSend);
            }
          }, 1800);
        }
      };

      recognition.onerror = (event) => {
        console.warn('Speech recognition error event:', event.error);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setMicError('Microphone permission blocked. Please allow microphone in browser settings.');
        } else if (event.error === 'network') {
          setMicError('Speech recognition network error. Ensure internet connection or use Chrome/Edge.');
        } else if (event.error === 'no-speech') {
          // Keep listening or allow user to speak
        }
      };

      recognition.onend = () => {
        if (isListeningRef.current) {
          // Restart if still in listening mode (e.g. after interim pause)
          try {
            recognition.start();
          } catch (e) {
            stopListeningSession();
          }
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Failed to start SpeechRecognition:', err);
      setMicError(`Failed to initialize speech recognition: ${err.message}`);
      stopListeningSession();
    }
  };

  // Stop listening session
  const stopListeningSession = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
      recognitionRef.current = null;
    }
    stopAudioAnalysis();
    setLiveTranscript('');
    onMicToggle(false);
  };

  // Toggle button handler
  const handleMicClick = () => {
    if (isListening) {
      stopListeningSession();
    } else {
      startListeningSession();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListeningSession();
    };
  }, []);

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (!inputText.trim() || isThinking) return;
    if (isListening) stopListeningSession();
    onSendMessage(inputText.trim());
    setInputText('');
  };

  const playTTS = (text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  const quickPrompts = [
    'What time is it?',
    'Check system specs',
    'List audio devices',
    'What are your wake words?',
    'Tell me a joke',
  ];

  const modelsByProvider = models.reduce((groups, model) => {
    const provider = model.provider || 'Other';
    (groups[provider] ||= []).push(model);
    return groups;
  }, {});
  const selectedModel = models.find((model) => model.id === selectedModelId);

  return (
    <div className="glass-panel chat-panel" id="chat-console">
      <div className="panel-header">
        <div className="panel-title">
          <span>Conversational Interface</span>
          <span className="panel-title-badge">Local-First</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem' }}>
          {isListening && (
            <span style={{ color: 'var(--emerald)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span className="status-dot listening" style={{ width: '6px', height: '6px' }}></span>
              Mic Active
            </span>
          )}
          <span style={{ color: 'var(--text-muted)' }}>{messages.length} interactions</span>
        </div>
      </div>

      <div className="model-selector" aria-live="polite">
        <label className="model-selector-label" htmlFor="model-selector">Select Model</label>
        {modelLoading ? (
          <div className="model-selector-message">Loading configured models…</div>
        ) : modelError ? (
          <div className="model-selector-message error">{modelError}</div>
        ) : models.length === 0 ? (
          <div className="model-selector-message">No LLM models are currently configured.</div>
        ) : (
          <>
            <select
              id="model-selector"
              className="model-selector-control"
              value={selectedModelId || ''}
              onChange={(event) => onModelChange?.(event.target.value)}
              disabled={isThinking}
              aria-label="Select language model"
              aria-describedby="selected-model-details"
            >
              {!selectedModelId && <option value="">Choose an available model</option>}
              {Object.entries(modelsByProvider).map(([provider, providerModels]) => (
                <optgroup key={provider} label={provider}>
                  {providerModels.map((model) => (
                    <option key={model.id} value={model.id} disabled={!model.available}>
                      {model.name}{model.available ? '' : ` — ${model.status}`}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <div id="selected-model-details" className="selected-model-details">
              {selectedModel ? (
                <span title={`Model ID: ${selectedModel.modelId}. ${selectedModel.capabilities?.join(', ') || 'Text'} capabilities. ${selectedModel.status}`}>
                  {selectedModel.provider} · {selectedModel.modelId}
                  {selectedModel.contextWindow ? ` · ${selectedModel.contextWindow.toLocaleString()} context` : ''}
                  {selectedModel.capabilities?.length ? ` · ${selectedModel.capabilities.join(', ')}` : ''}
                </span>
              ) : 'Choose a configured model to use for subsequent messages.'}
            </div>
          </>
        )}
      </div>

      {/* Error Alert Banner */}
      {micError && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid var(--crimson)',
          borderRadius: 'var(--radius-md)',
          padding: '10px 14px',
          marginBottom: '10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.825rem',
          color: '#fca5a5'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⚠️</span>
            <span>{micError}</span>
          </div>
          <button 
            className="btn btn-glass" 
            style={{ padding: '3px 10px', fontSize: '0.75rem' }}
            onClick={() => setMicError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Chat History */}
      <div className="chat-history" id="chat-history-container">
        {messages.length === 0 ? (
          <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem', opacity: 0.7 }}>🎙️</div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Assistant is Ready
            </div>
            <div style={{ fontSize: '0.825rem' }}>
              Click the microphone button to speak, or type your query below.
            </div>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div key={index} className={`message-item ${msg.sender}`}>
              <div className={`message-avatar ${msg.sender}`}>
                {msg.sender === 'user' ? 'YOU' : 'AI'}
              </div>
              <div className="message-bubble">
                <div className="message-text">{msg.text}</div>
                <div className="message-meta">
                  <span>{msg.timestamp || 'Just now'}</span>
                  {msg.sender === 'assistant' && (
                    <button 
                      className="speak-btn" 
                      onClick={() => playTTS(msg.text)} 
                      title="Read aloud"
                      aria-label="Speak response"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                      </svg>
                    </button>
                  )}
                  {msg.intent && (
                    <span style={{ marginLeft: 'auto', opacity: 0.6, fontSize: '0.68rem' }}>
                      #{msg.intent}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}

        {isThinking && (
          <div className="message-item assistant">
            <div className="message-avatar assistant">AI</div>
            <div className="message-bubble" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="status-dot thinking" style={{ width: '8px', height: '8px' }}></span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Synthesizing answer...</span>
            </div>
          </div>
        )}
        <div ref={historyEndRef} />
      </div>

      {/* Live Speech Recognition Overlay Banner */}
      {isListening && (
        <div style={{
          background: 'linear-gradient(90deg, rgba(16, 185, 129, 0.15), rgba(0, 242, 254, 0.15))',
          border: '1px solid var(--emerald)',
          borderRadius: 'var(--radius-md)',
          padding: '10px 14px',
          marginBottom: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          animation: 'fadeIn 0.2s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '3px', height: '14px', background: 'var(--emerald)', borderRadius: '2px', animation: 'pulse-ring 0.6s infinite' }}></span>
            <span style={{ width: '3px', height: '20px', background: 'var(--emerald)', borderRadius: '2px', animation: 'pulse-ring 0.9s infinite' }}></span>
            <span style={{ width: '3px', height: '12px', background: 'var(--emerald)', borderRadius: '2px', animation: 'pulse-ring 0.7s infinite' }}></span>
          </div>
          <div style={{ flex: 1, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
            {liveTranscript ? (
              <span><strong>Hearing:</strong> "{liveTranscript}"</span>
            ) : (
              <span style={{ color: 'var(--text-secondary)' }}>Listening... Speak into your microphone now</span>
            )}
          </div>
          <button 
            className="btn btn-glass" 
            style={{ padding: '4px 10px', fontSize: '0.75rem' }}
            onClick={stopListeningSession}
          >
            Cancel
          </button>
        </div>
      )}

      <div className="quick-chips-container">
        {quickPrompts.map((prompt, idx) => (
          <button 
            key={idx} 
            className="quick-chip"
            onClick={() => onSendMessage(prompt)}
            disabled={isThinking}
          >
            {prompt}
          </button>
        ))}
      </div>

      <form className="chat-input-bar" onSubmit={handleFormSubmit}>
        <button
          type="button"
          className={`mic-toggle-btn ${isListening ? 'active' : ''}`}
          onClick={handleMicClick}
          title={isListening ? 'Click to stop listening' : 'Click to talk (Voice Input)'}
          id="mic-button"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
          </svg>
        </button>

        <input
          type="text"
          className="chat-input"
          placeholder={isListening ? "Listening to your voice..." : "Ask a question, trigger a command, or say wake word..."}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          disabled={isThinking}
          id="chat-text-input"
        />

        <button 
          type="submit" 
          className="btn btn-primary" 
          disabled={!inputText.trim() || isThinking}
          id="chat-send-button"
        >
          <span>Send</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </form>
    </div>
  );
}
