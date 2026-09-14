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
            <label className="form-label">AI Reasoning Engine / Provider</label>
            <select
              className="form-control"
              value={formData.llm?.provider || 'internet'}
              onChange={(e) => handleChange('llm', 'provider', e.target.value)}
            >
              <option value="internet">🌐 Free Internet Knowledge & Search (No Key Needed)</option>
              <option value="gemini">⚡ Google Gemini (Free key at Google AI Studio)</option>
              <option value="openrouter">🚀 OpenRouter (Free Models: Gemini 2.0, DeepSeek, Llama)</option>
              <option value="openai">🤖 OpenAI ChatGPT (GPT-4o Mini / GPT-4o / o3-mini)</option>
              <option value="claude">🧠 Anthropic Claude (Claude 3.7 Sonnet / 3.5 Haiku)</option>
              <option value="ollama">🦙 Ollama (Local Offline LLM)</option>
              <option value="rule_based">⚙️ Rule-Based / System Commands Only</option>
            </select>
          </div>

          {/* Gemini Specific Settings */}
          {formData.llm?.provider === 'gemini' && (
            <div style={{ background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: 'var(--radius-sm)', padding: '12px', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--cyan)' }}>Google Gemini Settings</span>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: '0.75rem', color: 'var(--emerald)', textDecoration: 'underline' }}
                >
                  Get free key ↗
                </a>
              </div>
              <div className="form-group" style={{ marginBottom: '8px' }}>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Gemini API Key</label>
                <input
                  type="password"
                  className="form-control"
                  placeholder="AIzaSy..."
                  value={formData.llm?.gemini?.api_key || ''}
                  onChange={(e) => {
                    setFormData((prev) => ({
                      ...prev,
                      llm: {
                        ...prev.llm,
                        gemini: {
                          ...(prev.llm?.gemini || {}),
                          api_key: e.target.value,
                        },
                      },
                    }));
                  }}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Model</label>
                <select
                  className="form-control"
                  value={formData.llm?.gemini?.model || 'gemini-2.0-flash'}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData((prev) => ({
                      ...prev,
                      llm: {
                        ...prev.llm,
                        gemini: {
                          ...(prev.llm?.gemini || {}),
                          model: val,
                        },
                      },
                    }));
                  }}
                >
                  <option value="gemini-2.0-flash">gemini-2.0-flash (Latest, Free & Recommended)</option>
                  <option value="gemini-2.0-flash-lite">gemini-2.0-flash-lite (Ultra Low Latency)</option>
                  <option value="gemini-1.5-flash">gemini-1.5-flash (Fast & Free)</option>
                  <option value="gemini-1.5-pro">gemini-1.5-pro (Complex Reasoning)</option>
                </select>
              </div>
            </div>
          )}

          {/* OpenRouter Specific Settings */}
          {formData.llm?.provider === 'openrouter' && (
            <div style={{ background: 'rgba(168, 85, 247, 0.08)', border: '1px solid rgba(168, 85, 247, 0.25)', borderRadius: 'var(--radius-sm)', padding: '12px', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--purple)' }}>OpenRouter Settings</span>
                <a
                  href="https://openrouter.ai/keys"
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: '0.75rem', color: 'var(--emerald)', textDecoration: 'underline' }}
                >
                  Get free key ↗
                </a>
              </div>
              <div className="form-group" style={{ marginBottom: '8px' }}>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>OpenRouter API Key (Free account, $0 required)</label>
                <input
                  type="password"
                  className="form-control"
                  placeholder="sk-or-v1-..."
                  value={formData.llm?.openrouter?.api_key || ''}
                  onChange={(e) => {
                    setFormData((prev) => ({
                      ...prev,
                      llm: {
                        ...prev.llm,
                        openrouter: {
                          ...(prev.llm?.openrouter || {}),
                          api_key: e.target.value,
                        },
                      },
                    }));
                  }}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Free Model Selection</label>
                <select
                  className="form-control"
                  value={formData.llm?.openrouter?.model || 'google/gemini-2.0-flash-exp:free'}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData((prev) => ({
                      ...prev,
                      llm: {
                        ...prev.llm,
                        openrouter: {
                          ...(prev.llm?.openrouter || {}),
                          model: val,
                        },
                      },
                    }));
                  }}
                >
                  <option value="google/gemini-2.0-flash-exp:free">google/gemini-2.0-flash-exp:free (Free Gemini 2.0)</option>
                  <option value="deepseek/deepseek-r1:free">deepseek/deepseek-r1:free (Free DeepSeek R1 Reasoning)</option>
                  <option value="meta-llama/llama-3.3-70b-instruct:free">meta-llama/llama-3.3-70b-instruct:free (Free LLaMA 3.3)</option>
                  <option value="qwen/qwen-2.5-72b-instruct:free">qwen/qwen-2.5-72b-instruct:free (Free Qwen 2.5 72B)</option>
                  <option value="openrouter/free">openrouter/free (Auto Free Model Router)</option>
                </select>
              </div>
            </div>
          )}

          {/* OpenAI Specific Settings */}
          {formData.llm?.provider === 'openai' && (
            <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: 'var(--radius-sm)', padding: '12px', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--emerald)', marginBottom: '8px' }}>
                OpenAI ChatGPT Settings
              </div>
              <div className="form-group" style={{ marginBottom: '8px' }}>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>OpenAI API Key</label>
                <input
                  type="password"
                  className="form-control"
                  placeholder="sk-proj-..."
                  value={formData.llm?.openai?.api_key || ''}
                  onChange={(e) => {
                    setFormData((prev) => ({
                      ...prev,
                      llm: {
                        ...prev.llm,
                        openai: {
                          ...(prev.llm?.openai || {}),
                          api_key: e.target.value,
                        },
                      },
                    }));
                  }}
                />
              </div>
              <div className="form-group" style={{ marginBottom: '8px' }}>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Model</label>
                <select
                  className="form-control"
                  value={formData.llm?.openai?.model || 'gpt-4o-mini'}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData((prev) => ({
                      ...prev,
                      llm: {
                        ...prev.llm,
                        openai: {
                          ...(prev.llm?.openai || {}),
                          model: val,
                        },
                      },
                    }));
                  }}
                >
                  <option value="gpt-4o-mini">gpt-4o-mini (Fast, Low Cost & Recommended)</option>
                  <option value="gpt-4o">gpt-4o (Omni Flagship)</option>
                  <option value="o3-mini">o3-mini (Latest Reasoning Model)</option>
                  <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Base URL</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="https://api.openai.com/v1"
                  value={formData.llm?.openai?.base_url || 'https://api.openai.com/v1'}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData((prev) => ({
                      ...prev,
                      llm: {
                        ...prev.llm,
                        openai: {
                          ...(prev.llm?.openai || {}),
                          base_url: val,
                        },
                      },
                    }));
                  }}
                />
              </div>
            </div>
          )}

          {/* Claude Specific Settings */}
          {formData.llm?.provider === 'claude' && (
            <div style={{ background: 'rgba(217, 119, 6, 0.08)', border: '1px solid rgba(217, 119, 6, 0.25)', borderRadius: 'var(--radius-sm)', padding: '12px', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f59e0b', marginBottom: '8px' }}>
                Anthropic Claude Settings
              </div>
              <div className="form-group" style={{ marginBottom: '8px' }}>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Claude API Key</label>
                <input
                  type="password"
                  className="form-control"
                  placeholder="sk-ant-..."
                  value={formData.llm?.claude?.api_key || ''}
                  onChange={(e) => {
                    setFormData((prev) => ({
                      ...prev,
                      llm: {
                        ...prev.llm,
                        claude: {
                          ...(prev.llm?.claude || {}),
                          api_key: e.target.value,
                        },
                      },
                    }));
                  }}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Model</label>
                <select
                  className="form-control"
                  value={formData.llm?.claude?.model || 'claude-3-5-haiku-20241022'}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData((prev) => ({
                      ...prev,
                      llm: {
                        ...prev.llm,
                        claude: {
                          ...(prev.llm?.claude || {}),
                          model: val,
                        },
                      },
                    }));
                  }}
                >
                  <option value="claude-3-5-haiku-20241022">claude-3-5-haiku (Fastest & Concise Voice Output)</option>
                  <option value="claude-3-7-sonnet-20250219">claude-3-7-sonnet (Latest Flagship Hybrid)</option>
                  <option value="claude-3-5-sonnet-20241022">claude-3-5-sonnet (High Capability)</option>
                </select>
              </div>
            </div>
          )}

          {/* Ollama Specific Settings */}
          {formData.llm?.provider === 'ollama' && (
            <div style={{ background: 'rgba(168, 85, 247, 0.08)', border: '1px solid rgba(168, 85, 247, 0.25)', borderRadius: 'var(--radius-sm)', padding: '12px', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--purple)', marginBottom: '8px' }}>
                Ollama Local LLM
              </div>
              <div className="form-group" style={{ marginBottom: '8px' }}>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Base URL</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="http://localhost:11434"
                  value={formData.llm?.ollama?.base_url || 'http://localhost:11434'}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData((prev) => ({
                      ...prev,
                      llm: {
                        ...prev.llm,
                        ollama: {
                          ...(prev.llm?.ollama || {}),
                          base_url: val,
                        },
                      },
                    }));
                  }}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Model Name</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="llama3.2"
                  value={formData.llm?.ollama?.model || 'llama3.2'}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData((prev) => ({
                      ...prev,
                      llm: {
                        ...prev.llm,
                        ollama: {
                          ...(prev.llm?.ollama || {}),
                          model: val,
                        },
                      },
                    }));
                  }}
                />
              </div>
            </div>
          )}

          {/* Internet Info Note */}
          {formData.llm?.provider === 'internet' && (
            <div style={{ background: 'rgba(56, 189, 248, 0.06)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: 'var(--radius-sm)', padding: '10px', marginBottom: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              ⚡ <strong>Internet Knowledge Mode</strong>: Answers questions directly using DuckDuckGo Instant Answers, Wikipedia, math calculations, and real-time world knowledge with zero API keys required.
            </div>
          )}

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
