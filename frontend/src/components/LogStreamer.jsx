import React, { useState, useEffect, useRef } from 'react';

/**
 * Terminal-style live log streamer displaying sanitized output from logs/assistant.log.
 */
export default function LogStreamer({ logs = [], onRefreshLogs }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const terminalRef = useRef(null);

  useEffect(() => {
    if (autoScroll && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const getLineClass = (line) => {
    if (line.includes('[ERROR') || line.includes('Error')) return 'log-error';
    if (line.includes('[WARN') || line.includes('Warning')) return 'log-warn';
    if (line.includes('[INFO')) return 'log-info';
    return '';
  };

  return (
    <div className="logs-card" id="log-streamer-card">
      <div 
        className="logs-header" 
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>TERMINAL</span>
          <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>logs/assistant.log</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            className="speak-btn"
            onClick={(e) => {
              e.stopPropagation();
              onRefreshLogs();
            }}
            title="Refresh Logs"
            id="btn-refresh-logs"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
            </svg>
          </button>
          <span>{isExpanded ? '▼' : '▲'}</span>
        </div>
      </div>

      {isExpanded && (
        <div className="terminal-window" ref={terminalRef}>
          {logs.length === 0 ? (
            <div style={{ color: 'var(--text-muted)' }}>No logs available yet.</div>
          ) : (
            logs.map((line, idx) => (
              <div key={idx} className={`terminal-line ${getLineClass(line)}`}>
                {line}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
