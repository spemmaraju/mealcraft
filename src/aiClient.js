// BYOK network client (Phase 6). The only module that talks to
// api.anthropic.com / generativelanguage.googleapis.com. Pure request
// builders and response mappers are exported separately from the fetch
// wrappers (mirrors nutritionLookup.js): the key is always passed as an
// argument, never read from storage here, and never logged.
//
// Neutral message shape used by callers:
//   [{ role: 'user' | 'assistant', content: [
//        { type: 'text', text } | { type: 'image', mediaType, data }
//   ] }]

import { ANTHROPIC_MODELS } from './schema.js'

// Phase 19: the model comes from Settings.anthropicModel (passed in by the
// caller like the key — never read from storage here). Anything unknown
// falls back to the default, Sonnet 5.5.
function anthropicModel(model) {
  return ANTHROPIC_MODELS.includes(model) ? model : ANTHROPIC_MODELS[0]
}

// Per-model "no thinking" request fields. Sonnet 5.5 rejects
// {type:'disabled'} but takes 'between_tools'; Haiku 5.5 takes 'disabled' at
// its default effort; Opus 5.5 can't disable thinking at all, so it gets low
// effort plus a max_tokens floor (thinking tokens count against the cap).
const OPUS_MIN_MAX_TOKENS = 4000
function thinkingOff(model) {
  if (model === 'claude-opus-5-5') return { output_config: { effort: 'low' } }
  if (model === 'claude-haiku-5-5') return { thinking: { type: 'disabled' } }
  return { thinking: { type: 'between_tools' } }
}

const GOOGLE_MODEL = 'gemini-2.5-flash'

function toAnthropicBlock(block) {
  if (block.type === 'image') {
    return { type: 'image', source: { type: 'base64', media_type: block.mediaType, data: block.data } }
  }
  return { type: 'text', text: block.text }
}

/** @returns {{url, headers, body}} — never fetches; pure and offline-testable. */
export function buildAnthropicRequest(apiKey, messages, maxTokens, model) {
  const resolved = anthropicModel(model)
  return {
    url: 'https://api.anthropic.com/v1/messages',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: {
      model: resolved,
      max_tokens: resolved === 'claude-opus-5-5' ? Math.max(maxTokens, OPUS_MIN_MAX_TOKENS) : maxTokens,
      // Single-shot extractions with no tools — thinking off (or as low as
      // the model allows) so the 16-token key test and 500-token label reads
      // can't be truncated by thinking tokens.
      ...thinkingOff(resolved),
      messages: messages.map((m) => ({ role: m.role, content: m.content.map(toAnthropicBlock) })),
    },
  }
}

function toGooglePart(block) {
  if (block.type === 'image') {
    return { inline_data: { mime_type: block.mediaType, data: block.data } }
  }
  return { text: block.text }
}

/** @returns {{url, headers, body}} — never fetches; pure and offline-testable. */
export function buildGoogleRequest(apiKey, messages, maxTokens) {
  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_MODEL}:generateContent`,
    headers: {
      'x-goog-api-key': apiKey,
      'content-type': 'application/json',
    },
    body: {
      contents: messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: m.content.map(toGooglePart),
      })),
      generationConfig: { maxOutputTokens: maxTokens },
    },
  }
}

/** @returns {{ok:true, text} | {ok:false, error}} */
export function extractAnthropicText(json) {
  if (json?.stop_reason === 'max_tokens') return { ok: false, error: 'Response was cut off — try again.' }
  if (json?.stop_reason === 'refusal') return { ok: false, error: 'Claude declined this request — try rewording it.' }
  const text = (json?.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
  return { ok: true, text }
}

/** @returns {{ok:true, text} | {ok:false, error}} */
export function extractGoogleText(json) {
  const parts = json?.candidates?.[0]?.content?.parts || []
  const text = parts.map((part) => part.text || '').join('')
  return { ok: true, text }
}

/** Human-readable HTTP-status error. Never includes the key or headers. */
export function describeHttpError(provider, status) {
  const name = provider === 'google' ? 'Gemini' : 'Claude'
  if (status === 401 || status === 403) return `${name} key rejected — check it in Settings.`
  if (status === 429) return `${name} rate limited — wait a moment and try again.`
  if (status === 500 || status === 503 || status === 529) return `${name} is overloaded — try again.`
  return `${name} request failed (HTTP ${status}).`
}

// Generation can outlive a phone's auto-lock (iOS defaults to 30 s) — the OS
// then suspends the PWA and kills the in-flight fetch, surfacing as a network
// failure. Hold a screen wake lock for the duration where the API exists
// (iOS 16.4+/Chrome); everywhere else this is a silent no-op.
async function acquireWakeLock() {
  try {
    return (await globalThis.navigator?.wakeLock?.request('screen')) ?? null
  } catch {
    return null
  }
}

/**
 * Non-streaming chat call. Never throws — transport and HTTP failures both
 * resolve to {ok:false, error}, and the error string never includes the key.
 * @returns {Promise<{ok:true, text} | {ok:false, error}>}
 */
export async function chat({ provider, apiKey, model, messages, maxTokens = 16000 }) {
  const { url, headers, body } =
    provider === 'google' ? buildGoogleRequest(apiKey, messages, maxTokens) : buildAnthropicRequest(apiKey, messages, maxTokens, model)

  const wakeLock = await acquireWakeLock()
  try {
    let res
    try {
      res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
    } catch {
      return { ok: false, error: 'Network request failed — check your connection, and keep the app open until the reply arrives.' }
    }
    if (!res.ok) return { ok: false, error: describeHttpError(provider, res.status) }

    let json
    try {
      json = await res.json()
    } catch {
      return { ok: false, error: 'Could not parse the provider response.' }
    }
    return provider === 'google' ? extractGoogleText(json) : extractAnthropicText(json)
  } finally {
    try {
      await wakeLock?.release()
    } catch {
      /* lock already released by the OS (e.g. tab hidden) — nothing to do */
    }
  }
}

/** @returns {Promise<{ok:true, text} | {ok:false, error}>} */
export async function testConnection({ provider, apiKey, model }) {
  return chat({
    provider,
    apiKey,
    model,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Reply with OK' }] }],
    maxTokens: 16,
  })
}
