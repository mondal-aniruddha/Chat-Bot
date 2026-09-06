import React, { useState, useEffect } from 'react';

/**
 * Settings modal allowing dynamic modification of assistant configurations.
 */
export default function ConfigPanel({ isOpen, onClose, config, onSaveConfig }) {
  const [formData, setFormData] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (config) {
      setFormData(JSON.parse(JSON.stringify(config)));
    }
  }, [config]);

  if (!isOpen || !formData) return null;

  const handleChange = (section, key, value) => {
    setFormData((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value,
      },
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSaveConfig(formData);
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        onClose();
      }, 1200);
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} id="config-modal-backdrop">
      <div className="modal-panel" onClick={(e) => e.stopPropagation()} id="config-modal">
        <div className="modal-header">
          <div className="modal-title">Assistant Settings</div>
          <button className="speak-btn" onClick={onClose} style={{ fontSize: '1.2rem' }}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Assistant Name */}
          <div className="form-group">
            <label className="form-label">Assistant Name</label>
            <input
              type="text"
              className="form-control"
              value={formData.system?.name || ''}
              onChange={(e) => handleChange('system', 'name', e.target.value)}
            />
          </div>

          {/* Wake Words */}
          <div className="form-group">
            <label className="form-label">Wake Words (Comma-separated)</label>
            <input
              type="text"
              className="form-control"
              value={(formData.system?.wake_words || []).join(', ')}
              onChange={(e) =>
                handleChange(
                  'system',
                  'wake_words',
                  e.target.value.split(',').map((w) => w.trim()).filter(Boolean)
                )
              }
            />
          </div>

          {/* LLM Provider */}
          <div className="form-group">
            <label className="form-label">LLM Provider</label>
            <select
              className="form-control"
              value={formData.llm?.provider || 'rule_based'}
              onChange={(e) => handleChange('llm', 'provider', e.target.value)}
            >
              <option value="rule_based">Rule-Based / Offline Matcher</option>
              <option value="ollama">Ollama (Local LLM)</option>
              <option value="openai">OpenAI / Compatible API</option>
            </select>
          </div>

          {/* STT Model Size */}
          <div className="form-group">
            <label className="form-label">Speech-To-Text Model (Faster-Whisper)</label>
            <select
              className="form-control"
              value={formData.stt?.model_size || 'tiny'}
              onChange={(e) => handleChange('stt', 'model_size', e.target.value)}
            >
              <option value="tiny">Tiny (Fastest, low memory)</option>
              <option value="base">Base (Balanced)</option>
              <option value="small">Small (High accuracy)</option>
              <option value="medium">Medium (Requires GPU)</option>
            </select>
          </div>

          {/* TTS Speech Rate Slider */}
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label className="form-label" style={{ marginBottom: 0 }}>TTS Speech Rate</label>
              <span style={{ fontSize: '0.8rem', color: 'var(--cyan)' }}>
                {formData.tts?.rate || 190} WPM
              </span>
            </div>
            <input
              type="range"
              min="120"
              max="280"
              step="10"
              style={{ width: '100%', accentColor: 'var(--cyan)' }}
              value={formData.tts?.rate || 190}
              onChange={(e) => handleChange('tts', 'rate', parseInt(e.target.value, 10))}
            />
          </div>

          {/* TTS Volume Slider */}
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label className="form-label" style={{ marginBottom: 0 }}>Speech Volume</label>
              <span style={{ fontSize: '0.8rem', color: 'var(--cyan)' }}>
                {Math.round((formData.tts?.volume ?? 1.0) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              style={{ width: '100%', accentColor: 'var(--cyan)' }}
              value={formData.tts?.volume ?? 1.0}
              onChange={(e) => handleChange('tts', 'volume', parseFloat(e.target.value))}
            />
          </div>

          {saveSuccess && (
            <div style={{ padding: '10px', background: 'rgba(16, 185, 129, 0.2)', border: '1px solid var(--emerald)', borderRadius: 'var(--radius-sm)', color: '#6ee7b7', fontSize: '0.85rem', marginBottom: '1rem', textAlign: 'center' }}>
              ✓ Settings saved and validated successfully!
            </div>
          )}

          <div className="modal-footer">
            <button type="button" className="btn btn-glass" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
