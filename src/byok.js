// BYOK call loops (Phase 6; full-week generateWeekViaApi removed Phase P1
// with the AI week generator itself; Phase P2 adds generateIdeasViaApi).
// Pure — `chatFn` is injectable (defaults to aiClient.chat) so this is
// offline-testable with a stub. Reuses aiReplyOps' validators and its
// generic buildFixRequest; zero new validation or retry logic per flow.

import * as aiClient from './aiClient.js'
import { validateComponentReply, validateIdeasReply, buildFixRequest } from './aiReplyOps.js'

function userMessage(text) {
  return { role: 'user', content: [{ type: 'text', text }] }
}
function assistantMessage(text) {
  return { role: 'assistant', content: [{ type: 'text', text }] }
}

// Ask once; on a validation failure (not a transport/HTTP failure) send ONE
// fix-request retry. Transport/HTTP failures never retry.
async function chatWithOneRetry({ provider, apiKey, prompt, chatFn, onProgress, validateFn }) {
  const messages = [userMessage(prompt)]
  onProgress?.('asking')
  const first = await chatFn({ provider, apiKey, messages })
  if (!first.ok) return { ok: false, errors: [first.error], attempts: 1 }

  const firstResult = validateFn(first.text)
  if (firstResult.ok) return { ok: true, result: firstResult, attempts: 1 }

  onProgress?.('retrying')
  messages.push(assistantMessage(first.text), userMessage(buildFixRequest(firstResult.errors)))
  const second = await chatFn({ provider, apiKey, messages })
  if (!second.ok) return { ok: false, errors: [second.error], rawText: first.text, attempts: 2 }

  const secondResult = validateFn(second.text)
  if (secondResult.ok) return { ok: true, result: secondResult, attempts: 2 }
  return { ok: false, errors: secondResult.errors, rawText: second.text, attempts: 2 }
}

/** @returns {Promise<{ok:true, component, attempts} | {ok:false, errors, rawText?, attempts}>} */
export async function regenerateComponentViaApi({ provider, apiKey, prompt, chatFn = aiClient.chat, onProgress }) {
  const outcome = await chatWithOneRetry({ provider, apiKey, prompt, chatFn, onProgress, validateFn: validateComponentReply })
  if (!outcome.ok) return outcome
  return { ok: true, component: outcome.result.component, attempts: outcome.attempts }
}

/** @returns {Promise<{ok:true, ideas, attempts} | {ok:false, errors, rawText?, attempts}>} */
export async function generateIdeasViaApi({ provider, apiKey, pantry, prompt, chatFn = aiClient.chat, onProgress }) {
  const outcome = await chatWithOneRetry({
    provider,
    apiKey,
    prompt,
    chatFn,
    onProgress,
    validateFn: (text) => validateIdeasReply(text, { pantry }),
  })
  if (!outcome.ok) return outcome
  return { ok: true, ideas: outcome.result.ideas, attempts: outcome.attempts }
}
