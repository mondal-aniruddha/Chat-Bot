import React from 'react';

/**
 * Interactive State Controller allowing manual state switching & voice pipeline testing.
 */
export default function StateControls({ currentState, onTransitionState, onInterrupt }) {
  return (
    <div className="glass-panel" style={{ marginTop: '1.5rem' }} id="state-controls-panel">
      <div className="panel-header">
        <div className="panel-title">
          <span>Manual Controls</span>
          <span className="panel-title-badge">Dev Tools</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <button
          className="btn btn-glass"
          onClick={() => onTransitionState('listening', 'Manual UI Listen')}
          style={{ justifyContent: 'center' }}
          id="btn-trigger-listen"
        >
          <span>🎙️</span>
          <span>Listen</span>
        </button>

        <button
          className="btn btn-glass"
          onClick={() => onTransitionState('wake_word_detected', 'Manual Wake Word')}
          style={{ justifyContent: 'center' }}
          id="btn-trigger-wake"
        >
          <span>⚡</span>
          <span>Wake Word</span>
        </button>

        <button
          className="btn btn-glass"
          onClick={() => onTransitionState('thinking', 'Manual UI Thinking')}
          style={{ justifyContent: 'center' }}
          id="btn-trigger-think"
        >
          <span>🧠</span>
          <span>Thinking</span>
        </button>

        <button
          className="btn btn-glass"
          onClick={() => onTransitionState('speaking', 'Manual UI Speaking')}
          style={{ justifyContent: 'center' }}
          id="btn-trigger-speak"
        >
          <span>🔊</span>
          <span>Speaking</span>
        </button>
      </div>

      <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
        <button
          className="btn btn-glass"
          onClick={() => onTransitionState('idle', 'Manual Reset to Idle')}
          style={{ flex: 1, justifyContent: 'center' }}
          id="btn-trigger-idle"
        >
          <span>Standby (Idle)</span>
        </button>

        <button
          className="btn btn-danger"
          onClick={onInterrupt}
          style={{ justifyContent: 'center' }}
          title="Interrupt current speech and reset"
          id="btn-trigger-interrupt"
        >
          <span>⏹️ Stop</span>
        </button>
      </div>
    </div>
  );
}
