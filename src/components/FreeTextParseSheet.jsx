import { useState } from 'react'
import { compileParsePrompt, validateParseReply, buildDraftRows } from '../parseOps.js'
import { buildFixRequest } from '../aiReplyOps.js'
import { parseTextViaApi } from '../byok.js'
import ParseReviewCard from './ParseReviewCard.jsx'

const busyAskingFor = (provider) => `Asking ${provider === 'google' ? 'Gemini' : 'Claude'}…`
const BUSY_RETRYING = 'Reply had validation issues — asking for a fix…'

const MODE_TEXT = {
  meal: { title: 'Describe what you ate', label: 'What you ate', placeholder: 'e.g. two rotis with a bowl of toor dal, some raita and a handful of almonds' },
  cook: { title: 'Describe the ingredients', label: 'What goes into the dish', placeholder: 'e.g. two cups toor dal, two tomatoes, an onion, a tablespoon of ghee — makes about four servings' },
}

// Phase 18 "Describe it": type or dictate (Wispr Flow via the system
// keyboard — the box is big and autofocused), parse with BYOK or the
// copy-prompt / paste-reply fallback, then review before anything is used.
// `byok` is byokCredentials(settings) — null means paste mode. Phase 19
// adds mode 'cook' (ingredients for 🍳 Cook). onConfirm(rows, meta, text) gets the
// reviewed parseOps draft rows, {dishName, servings} hints (cook mode), and the typed text.
export default function FreeTextParseSheet({ mode = 'meal', byok, pantry, components, confirmLabel, onConfirm, onCancel }) {
  const copyText = MODE_TEXT[mode] || MODE_TEXT.meal
  const [text, setText] = useState('')
  const [rows, setRows] = useState(null)
  const [meta, setMeta] = useState({ dishName: null, servings: null })
  const [busyMsg, setBusyMsg] = useState('')
  const [failure, setFailure] = useState(null) // {errors, rawText?}
  // {at: 'prompt' | 'fix', ok, text, value} — rendered under the button that copied;
  // `value` is shown in a selectable box when the clipboard is unavailable.
  const [copied, setCopied] = useState(null)
  const [pasteText, setPasteText] = useState('')

  const prompt = compileParsePrompt({ text, pantry, mode })

  function accept(result) {
    setFailure(null)
    setMeta({ dishName: result.dishName ?? null, servings: result.servings ?? null })
    setRows(buildDraftRows(result.items, pantry))
  }

  async function handleParse() {
    setBusyMsg(busyAskingFor(byok.provider))
    setFailure(null)
    const result = await parseTextViaApi({
      provider: byok.provider,
      apiKey: byok.apiKey,
      model: byok.model,
      pantry,
      prompt,
      onProgress: (stage) => stage === 'retrying' && setBusyMsg(BUSY_RETRYING),
    })
    setBusyMsg('')
    if (result.ok) accept(result)
    else setFailure({ errors: result.errors, rawText: result.rawText })
  }

  async function copy(at, value, okText) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied({ at, ok: true, text: okText, value })
    } catch {
      setCopied({ at, ok: false, text: 'Clipboard unavailable — copy from the box below.', value })
    }
  }

  function copyFeedback(at) {
    if (copied?.at !== at) return null
    return (
      <>
        <div className={`message message--${copied.ok ? 'success' : 'error'}`}>{copied.text}</div>
        {!copied.ok && <textarea className="prompt-fallback" readOnly value={copied.value} onFocus={(e) => e.target.select()} />}
      </>
    )
  }

  function handleReadReply() {
    const result = validateParseReply(pasteText, { pantry })
    if (result.ok) accept(result)
    else setFailure({ errors: result.errors, rawText: result.rawText })
  }

  if (rows) {
    return (
      <div className="sheet-backdrop sheet-backdrop--stacked" onClick={onCancel}>
        <div className="sheet sheet--tall" onClick={(e) => e.stopPropagation()}>
          <ParseReviewCard
            rows={rows}
            components={components}
            pantry={pantry}
            confirmLabel={confirmLabel}
            onRowsChange={setRows}
            onConfirm={() => onConfirm(rows, meta, text)}
            onBack={() => setRows(null)}
          />
        </div>
      </div>
    )
  }

  const busy = !!busyMsg
  return (
    <div className="sheet-backdrop sheet-backdrop--stacked" onClick={onCancel}>
      <div className="sheet sheet--tall" onClick={(e) => e.stopPropagation()}>
        <h3 className="parse-review__title">{copyText.title}</h3>
        <textarea
          className="dictation-box"
          rows={5}
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={copyText.placeholder}
          aria-label={copyText.label}
        />

        {byok ? (
          <div className="button-row">
            <button type="button" className="btn btn--primary" disabled={!text.trim() || busy} onClick={handleParse}>
              {busy ? busyMsg : 'Read it'}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={onCancel}>
              Cancel
            </button>
          </div>
        ) : (
          <>
            <p className="field-caption">No API key — copy the prompt into Claude or Gemini, then paste the reply below.</p>
            <div className="button-row">
              <button type="button" className="btn btn--primary" disabled={!text.trim()} onClick={() => copy('prompt', prompt, 'Prompt copied to clipboard.')}>
                Copy prompt
              </button>
              <button type="button" className="btn" onClick={onCancel}>
                Cancel
              </button>
            </div>
            {copyFeedback('prompt')}
            <div className="field">
              <label htmlFor="parse-paste">Paste the reply here</label>
              <textarea
                id="parse-paste"
                rows={4}
                value={pasteText}
                onChange={(e) => {
                  setPasteText(e.target.value)
                  setFailure(null)
                }}
              />
            </div>
            <div className="button-row">
              <button type="button" className="btn" disabled={!pasteText.trim()} onClick={handleReadReply}>
                Read reply
              </button>
            </div>
          </>
        )}

        {failure && (
          <>
            <div className="message message--error">
              {failure.errors.map((err) => (
                <div key={err}>{err}</div>
              ))}
            </div>
            {failure.rawText && (
              <div className="button-row">
                <button type="button" className="btn" onClick={() => copy('fix', buildFixRequest(failure.errors), 'Fix request copied — paste it back into the chat.')}>
                  Copy fix request
                </button>
              </div>
            )}
            {copyFeedback('fix')}
          </>
        )}
      </div>
    </div>
  )
}
