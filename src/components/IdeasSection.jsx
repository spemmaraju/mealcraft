import { useState } from 'react'
import { compileIdeasPrompt } from '../promptCompiler.js'
import { validateIdeasReply } from '../aiReplyOps.js'
import { generateIdeasViaApi } from '../byok.js'

const busyAskingFor = (provider) => `Asking ${provider === 'google' ? 'Gemini' : 'Claude'}… this can take a minute`
const BUSY_RETRYING = 'Reply had validation issues — asking for a fix…'

/**
 * "What can I make?" (Phase P2) — ~12 AI dish IDEAS from on-hand pantry:
 * name, one-liner, which pantry items it uses, 0-2 things to buy. No
 * recipes, no steps — that's what "Prep a dish" is for. Starring an idea
 * (persisted by the caller) pins it through refreshes; PlanScreen's
 * ideaOps.mergeFreshIdeas keeps starred ideas and swaps in everything else.
 */
export default function IdeasSection({ ideas, pantry, components, settings, onIdeasRefreshed, onToggleStar, onPrepIdea }) {
  const [generating, setGenerating] = useState(false)
  const [busyMsg, setBusyMsg] = useState('')
  const [genError, setGenError] = useState(null)
  const [copyMsg, setCopyMsg] = useState(null)
  const [showFallback, setShowFallback] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pasteResult, setPasteResult] = useState(null)

  const prompt = compileIdeasPrompt({ pantry, components })
  const byokActive = settings.apiMode === 'byok' && !!settings.apiKey

  async function handleGenerate() {
    setGenerating(true)
    setBusyMsg(busyAskingFor(settings.provider))
    setGenError(null)
    const result = await generateIdeasViaApi({
      provider: settings.provider,
      apiKey: settings.apiKey,
      pantry,
      prompt,
      onProgress: (stage) => {
        if (stage === 'retrying') setBusyMsg(BUSY_RETRYING)
      },
    })
    setGenerating(false)
    if (result.ok) onIdeasRefreshed(result.ideas)
    else setGenError(result.errors.join('; '))
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopyMsg({ type: 'success', text: 'Prompt copied to clipboard.' })
      setShowFallback(false)
    } catch {
      setCopyMsg({ type: 'error', text: 'Clipboard unavailable — copy from the box below.' })
      setShowFallback(true)
    }
  }

  function handleImport() {
    const result = validateIdeasReply(pasteText, { pantry })
    setPasteResult(result)
    if (result.ok) {
      onIdeasRefreshed(result.ideas)
      setPasteText('')
    }
  }

  return (
    <div className="plan-section">
      <h2>💡 What can I make?</h2>
      <p className="placeholder">
        Ideas only — no recipes, no steps — built from what's on hand. ★ pins an idea so it survives the next refresh.
      </p>

      {settings.apiMode === 'byok' ? (
        <>
          <div className="button-row">
            <button type="button" className="btn btn--primary" onClick={handleGenerate} disabled={generating || !byokActive}>
              {generating ? busyMsg : ideas.length > 0 ? '↻ Refresh ideas' : '✨ Get ideas from my pantry'}
            </button>
          </div>
          {!byokActive && <p className="field-caption">Add your API key in Settings to enable this.</p>}
        </>
      ) : (
        <>
          <div className="button-row">
            <button type="button" className="btn btn--primary" onClick={handleCopy}>
              Copy prompt
            </button>
          </div>
          {copyMsg && <div className={`message message--${copyMsg.type}`}>{copyMsg.text}</div>}
          {showFallback && <textarea className="prompt-fallback" readOnly value={prompt} onFocus={(e) => e.target.select()} />}

          <div className="field">
            <label htmlFor="ideas-paste">Paste the reply here</label>
            <textarea
              id="ideas-paste"
              rows={6}
              value={pasteText}
              onChange={(e) => {
                setPasteText(e.target.value)
                setPasteResult(null)
              }}
              placeholder="Paste the reply from your AI chat here"
            />
          </div>
          <div className="button-row">
            <button type="button" className="btn" onClick={handleImport} disabled={!pasteText.trim()}>
              Import
            </button>
          </div>
        </>
      )}

      {genError && <div className="message message--error">{genError}</div>}

      {pasteResult && !pasteResult.ok && (
        <>
          <div className="message message--error">
            {pasteResult.errors.map((err) => (
              <div key={err}>{err}</div>
            ))}
          </div>
          {pasteResult.rawText && (
            <textarea className="prompt-fallback" readOnly value={pasteResult.rawText} onFocus={(e) => e.target.select()} />
          )}
        </>
      )}

      {ideas.length === 0 ? (
        <p className="placeholder">No ideas yet — get some from what's already in your pantry.</p>
      ) : (
        <div className="idea-list">
          {ideas.map((idea) => (
            <div key={idea.id} className="idea-card">
              <div className="idea-card__head">
                <h3>{idea.name}</h3>
                <button
                  type="button"
                  className={`idea-card__star${idea.starred ? ' idea-card__star--active' : ''}`}
                  aria-pressed={idea.starred}
                  aria-label={idea.starred ? `Unstar ${idea.name}` : `Star ${idea.name}`}
                  onClick={() => onToggleStar(idea.id)}
                >
                  {idea.starred ? '★' : '☆'}
                </button>
              </div>
              <p className="idea-card__line">{idea.line}</p>
              <div className="idea-card__chips">
                {idea.uses.map((use) => (
                  <span key={use} className="chip">
                    {use}
                  </span>
                ))}
                {idea.buy.map((item) => (
                  <span key={item} className="chip chip--amber">
                    🛒 {item}
                  </span>
                ))}
              </div>
              <div className="button-row">
                <button type="button" className="btn" onClick={() => onPrepIdea(idea)}>
                  Prep →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
