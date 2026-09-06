import React from 'react';

/**
 * Real-time Hardware Telemetry and Audio Devices component.
 */
export default function SystemTelemetry({ status, audio, currentState = 'idle' }) {
  const steps = [
    { id: 'idle', label: 'Idle' },
    { id: 'listening', label: 'Listen' },
    { id: 'thinking', label: 'Think' },
    { id: 'speaking', label: 'Speak' },
  ];

  const defaultMic = audio?.devices?.find((d) => d.is_default_input);
  const defaultSpeaker = audio?.devices?.find((d) => d.is_default_output);

  return (
    <div className="glass-panel" id="system-telemetry-panel">
      <div className="panel-header">
        <div className="panel-title">
          <span>System & Telemetry</span>
          <span className="panel-title-badge">Live</span>
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--cyan)' }}>
          {status?.architecture || 'AMD64'}
        </div>
      </div>

      {/* State Stepper */}
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          State Machine Transition
        </div>
        <div className="state-stepper">
          {steps.map((step, idx) => {
            const isActive = currentState === step.id;
            return (
              <div key={step.id} className={`state-step-node ${isActive ? 'active' : ''}`}>
                <div className="step-circle">{idx + 1}</div>
                <div className="step-label">{step.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="metrics-grid">
        {/* CPU Metric */}
        <div className="metric-card">
          <div className="metric-label">CPU Load</div>
          <div className="metric-value-row">
            <span className="metric-value">{status?.cpu?.usage_percent ?? 0}%</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {status?.cpu?.logical_cores || 16} Cores
            </span>
          </div>
          <div className="metric-progress">
            <div 
              className="metric-progress-bar bar-cyan" 
              style={{ width: `${Math.min(status?.cpu?.usage_percent || 0, 100)}%` }}
            />
          </div>
        </div>

        {/* RAM Metric */}
        <div className="metric-card">
          <div className="metric-label">Memory</div>
          <div className="metric-value-row">
            <span className="metric-value">{status?.memory?.percent ?? 0}%</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {status?.memory?.used_gb || 0}/{status?.memory?.total_gb || 16} GB
            </span>
          </div>
          <div className="metric-progress">
            <div 
              className="metric-progress-bar bar-violet" 
              style={{ width: `${Math.min(status?.memory?.percent || 0, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Audio Hardware Cards */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            PortAudio Hardware
          </span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            {audio?.total_devices || 0} devices online
          </span>
        </div>

        {/* Default Input Mic */}
        <div className="device-card" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
            <div className="device-info">
              <div className="device-name" title={defaultMic?.name || 'Default Microphone'}>
                🎙️ {defaultMic?.name || 'Microphone (Realtek Audio)'}
              </div>
              <div className="device-sub">
                {defaultMic ? `${defaultMic.max_input_channels} channels · ${defaultMic.default_samplerate} Hz` : 'Channels: 2 · 44100 Hz'}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="device-badge badge-in">Mic In</span>
            </div>
          </div>

          <HardwareMicTester />
        </div>

        {/* Default Output Speaker */}
        <div className="device-card">
          <div className="device-info">
            <div className="device-name" title={defaultSpeaker?.name || 'Default Speaker'}>
              🔊 {defaultSpeaker?.name || 'Speakers (Realtek Audio)'}
            </div>
            <div className="device-sub">
              {defaultSpeaker ? `${defaultSpeaker.max_output_channels} channels · ${defaultSpeaker.default_samplerate} Hz` : 'Channels: 2 · 44100 Hz'}
            </div>
          </div>
          <span className="device-badge badge-out">Spk Out</span>
        </div>
      </div>

      {/* Environment Footer Info */}
      <div style={{ 
        marginTop: 'auto', 
        padding: '10px', 
        background: 'rgba(0,0,0,0.2)', 
        borderRadius: 'var(--radius-sm)', 
        fontSize: '0.725rem', 
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-mono)' 
      }}>
        <div>OS: {status?.os || 'Windows 11'}</div>
        <div>Python: {status?.python_version || '3.14.7'} (.venv)</div>
      </div>
    </div>
  );
}

function HardwareMicTester() {
  const [testing, setTesting] = React.useState(false);
  const [result, setResult] = React.useState(null);

  const testMic = async () => {
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch('/api/hardware-listen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration: 2.5 }),
      });
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setResult({ success: false, error: e.message, message: 'Failed to query mic' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-glass)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <button 
          className="btn btn-glass" 
          style={{ padding: '4px 10px', fontSize: '0.75rem', width: '100%', justifyContent: 'center' }}
          onClick={testMic}
          disabled={testing}
          id="btn-test-hardware-mic"
        >
          {testing ? '🎙️ Recording PC Mic (2.5s)...' : '⚡ Test Hardware Mic'}
        </button>
      </div>
      {result && (
        <div style={{ 
          marginTop: '6px', 
          fontSize: '0.725rem', 
          padding: '6px 8px', 
          borderRadius: 'var(--radius-sm)',
          background: result.voice_detected ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
          color: result.voice_detected ? '#6ee7b7' : '#fcd34d',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>{result.message}</span>
          {result.peak_amplitude !== undefined && <span>Peak: {result.peak_amplitude}</span>}
        </div>
      )}
    </div>
  );
}

