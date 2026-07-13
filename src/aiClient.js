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

const ANTHROPIC_MODEL = 'claude-opus-4-8'
const GOOGLE_MODEL = 'gemini-2.5-flash'

function toAnthropicBlock(block) {
  if (block.type === 'image') {
    return { type: 'image', source: { type: 'base64', media_type: block.mediaType, data: block.data } }
  }
  return { type: 'text', text: block.text }
}

/** @returns {{url, headers, body}} — never fetches; pure and offline-testable. */
export function buildAnthropicRequest(apiKey, messages, maxTokens) {
  return {
    url: 'https://api.anthropic.com/v1/messages',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: {
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
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

/**
 * Non-streaming chat call. Never throws — transport and HTTP failures both
 * resolve to {ok:false, error}, and the error string never includes the key.
 * @returns {Promise<{ok:true, text} | {ok:false, error}>}
 */
export async function chat({ provider, apiKey, messages, maxTokens = 16000 }) {
  const { url, headers, body } =
    provider === 'google' ? buildGoogleRequest(apiKey, messages, maxTokens) : buildAnthropicRequest(apiKey, messages, maxTokens)

  let res
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  } catch {
    return { ok: false, error: 'Network request failed — check your connection and try again.' }
  }
  if (!res.ok) return { ok: false, error: describeHttpError(provider, res.status) }

  let json
  try {
    json = await res.json()
  } catch {
    return { ok: false, error: 'Could not parse the provider response.' }
  }
  return provider === 'google' ? extractGoogleText(json) : extractAnthropicText(json)
}

/** @returns {Promise<{ok:true, text} | {ok:false, error}>} */
export async function testConnection({ provider, apiKey }) {
  return chat({
    provider,
    apiKey,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Reply with OK' }] }],
    maxTokens: 16,
  })
}
