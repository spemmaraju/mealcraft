import { useEffect, useState } from 'react'
import * as storage from '../storage.js'
import { testConnection } from '../aiClient.js'
import { API_MODES, PROVIDERS } from '../schema.js'

const MODE_LABELS = { paste: 'Paste (no key)', byok: 'Bring your own key' }
const PROVIDER_LABELS = { anthropic: 'Claude (Anthropic)', google: 'Gemini (Google)' }

export default function ByokSettings() {
  const [apiMode, setApiModeState] = useState('paste')
  const [provider, setProviderState] = useState('anthropic')
  const [apiKey, setApiKey] = useState('')
  const [keyDraft, setKeyDraft] = useState('')
  const [keyMsg, setKeyMsg] = useState(null)
  const [testMsg, setTestMsg] = useState(null)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    storage.get('settings').then((settings) => {
      setApiModeState(settings.apiMode)
      setProviderState(settings.provider)
      setApiKey(settings.apiKey ?? '')
      setKeyDraft(settings.apiKey ?? '')
    })
  }, [])

  async function updateSettings(patch) {
    const settings = await storage.get('settings')
    await storage.set('settings', { ...settings, ...patch })
  }

  async function handleSetApiMode(mode) {
    setApiModeState(mode)
    await updateSettings({ apiMode: mode })
  }

  async function handleSetProvider(nextProvider) {
    setProviderState(nextProvider)
    setTestMsg(null)
    await updateSettings({ provider: nextProvider })
  }

  async function handleSaveKey() {
    const trimmed = keyDraft.trim()
    await updateSettings({ apiKey: trimmed || null })
    setApiKey(trimmed)
    setTestMsg(null)
    setKeyMsg({ type: 'success', text: trimmed ? 'Key saved.' : 'Key removed.' })
  }

  async function handleRemoveKey() {
    await updateSettings({ apiKey: null })
    setApiKey('')
    setKeyDraft('')
    setTestMsg(null)
    setKeyMsg({ type: 'success', text: 'Key removed.' })
  }

  async function handleTestConnection() {
    setTesting(true)
    setTestMsg(null)
    const result = await testConnection({ provider, apiKey: keyDraft.trim() })
    setTesting(false)
    setTestMsg(result.ok ? { type: 'success', text: 'Connection OK.' } : { type: 'error', text: result.error })
  }

  return (
    <section className="settings-section">
      <h2>AI (bring your own key)</h2>
      <p className="placeholder">
        Your key is stored only on this device, sent only to Anthropic/Google, and never included in exports.
      </p>

      <div className="field">
        <span>Mode</span>
        <div className="segmented">
          {API_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              className={`chip${apiMode === mode ? ' chip--active' : ''}`}
              onClick={() => handleSetApiMode(mode)}
            >
              {MODE_LABELS[mode]}
            </button>
          ))}
        </div>
      </div>

      {apiMode === 'byok' && (
        <>
          <div className="field">
            <label htmlFor="byok-provider">Provider</label>
            <select id="byok-provider" value={provider} onChange={(e) => handleSetProvider(e.target.value)}>
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABELS[p]}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="byok-key">API key</label>
            <input
              id="byok-key"
              type="password"
              value={keyDraft}
              onChange={(e) => {
                setKeyDraft(e.target.value)
                setTestMsg(null)
              }}
              placeholder={apiKey ? '••••••••' : 'paste key'}
            />
          </div>

          <div className="button-row">
            <button className="btn btn--primary" onClick={handleSaveKey} disabled={keyDraft.trim() === apiKey}>
              Save
            </button>
            {apiKey && (
              <button className="btn btn--danger" onClick={handleRemoveKey}>
                Remove
              </button>
            )}
            <button className="btn" onClick={handleTestConnection} disabled={!keyDraft.trim() || testing}>
              {testing ? 'Testing…' : 'Test connection'}
            </button>
          </div>

          {keyMsg && <div className={`message message--${keyMsg.type}`}>{keyMsg.text}</div>}
          {testMsg && <div className={`message message--${testMsg.type}`}>{testMsg.text}</div>}
        </>
      )}
    </section>
  )
}
