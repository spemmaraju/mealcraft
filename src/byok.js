// BYOK call loops (Phase 6; full-week generateWeekViaApi removed Phase P1
// with the AI week generator itself; Phase P2 adds generateIdeasViaApi;
// Phase 18 adds parseTextViaApi).
// Pure — `chatFn` is injectable (defaults to aiClient.chat) so this is
// offline-testable with a stub. Reuses aiReplyOps' validators and its
// generic buildFixRequest; zero new validation or retry logic per flow.

import * as aiClient from './aiClient.js'
import { validateComponentReply, validateIdeasReply, buildFixRequest } from './aiReplyOps.js'
import { validateParseReply, validateHaulReply } from './parseOps.js'

/**
 * The {provider, apiKey, model} triple every BYOK call needs, or null when
 * BYOK isn't usable (paste mode, or no key yet). One definition instead of
 * the same inline ternary in every screen.
 */
export function byokCredentials(settings) {
  if (settings?.apiMode !== 'byok' || !settings.apiKey) return null
  return { provider: settings.provider, apiKey: settings.apiKey, model: settings.anthropicModel }
}

function userMessage(text) {
  return { role: 'user', content: [{ type: 'text', text }] }
}
function assistantMessage(text) {
  return { role: 'assistant', content: [{ type: 'text', text }] }
}

// Ask once; on a validation failure (not a transport/HTTP failure) send ONE
// fix-request retry. Transport/HTTP failures never retry.
async function chatWithOneRetry({ provider, apiKey, model, prompt, chatFn, onProgress, validateFn }) {
  const messages = [userMessage(prompt)]
  onProgress?.('asking')
  const first = await chatFn({ provider, apiKey, model, messages })
  if (!first.ok) return { ok: false, errors: [first.error], attempts: 1 }

  const firstResult = validateFn(first.text)
  if (firstResult.ok) return { ok: true, result: firstResult, attempts: 1 }

  onProgress?.('retrying')
  messages.push(assistantMessage(first.text), userMessage(buildFixRequest(firstResult.errors)))
  const second = await chatFn({ provider, apiKey, model, messages })
  if (!second.ok) return { ok: false, errors: [second.error], rawText: first.text, attempts: 2 }

  const secondResult = validateFn(second.text)
  if (secondResult.ok) return { ok: true, result: secondResult, attempts: 2 }
  return { ok: false, errors: secondResult.errors, rawText: second.text, attempts: 2 }
}

/** @returns {Promise<{ok:true, component, attempts} | {ok:false, errors, rawText?, attempts}>} */
export async function regenerateComponentViaApi({ provider, apiKey, model, prompt, chatFn = aiClient.chat, onProgress }) {
  const outcome = await chatWithOneRetry({ provider, apiKey, model, prompt, chatFn, onProgress, validateFn: validateComponentReply })
  if (!outcome.ok) return outcome
  return { ok: true, component: outcome.result.component, attempts: outcome.attempts }
}

/** @returns {Promise<{ok:true, ideas, attempts} | {ok:false, errors, rawText?, attempts}>} */
export async function generateIdeasViaApi({ provider, apiKey, model, pantry, prompt, chatFn = aiClient.chat, onProgress }) {
  const outcome = await chatWithOneRetry({
    provider,
    apiKey,
    model,
    prompt,
    chatFn,
    onProgress,
    validateFn: (text) => validateIdeasReply(text, { pantry }),
  })
  if (!outcome.ok) return outcome
  return { ok: true, ideas: outcome.result.ideas, attempts: outcome.attempts }
}

/** Phase 18 free-text parse (meal or cook mode — the prompt decides). @returns {Promise<{ok:true, items, attempts} | {ok:false, errors, rawText?, attempts}>} */
export async function parseTextViaApi({ provider, apiKey, model, pantry, prompt, chatFn = aiClient.chat, onProgress }) {
  const outcome = await chatWithOneRetry({
    provider,
    apiKey,
    model,
    prompt,
    chatFn,
    onProgress,
    validateFn: (text) => validateParseReply(text, { pantry }),
  })
  if (!outcome.ok) return outcome
  const { items, dishName, servings } = outcome.result
  return { ok: true, items, dishName, servings, attempts: outcome.attempts }
}

/** Phase 20 shopping-haul parse. @returns {Promise<{ok:true, items, attempts} | {ok:false, errors, rawText?, attempts}>} */
export async function parseHaulViaApi({ provider, apiKey, model, pantry, categories, prompt, chatFn = aiClient.chat, onProgress }) {
  const outcome = await chatWithOneRetry({
    provider,
    apiKey,
    model,
    prompt,
    chatFn,
    onProgress,
    validateFn: (text) => validateHaulReply(text, { pantry, categories }),
  })
  if (!outcome.ok) return outcome
  return { ok: true, items: outcome.result.items, attempts: outcome.attempts }
}
