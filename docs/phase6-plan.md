# Phase 6 Plan — BYOK mode + PWA polish

> **For the executing model (read this first):**
> - Execute this plan exactly. Do NOT redesign, add dependencies, or refactor prior phases. CLAUDE.md is law.
> - Work in the 5 checkpoints listed at the bottom, committing (and pushing) after each one.
> - Run `node scripts/smoke-phase6.mjs` (and the earlier smoke suites) at every checkpoint.
> - **After each checkpoint, print a clear, numbered MANUAL TEST section for the user** (a beginner): exact commands to run, exact buttons to tap, and exactly what they should see. Then WAIT for the user to confirm before continuing. The full manual scripts are pre-written in "Manual test scripts" below — surface the relevant one verbatim at each checkpoint.
> - Never print, log, or commit an API key. Error messages must be built from HTTP status codes only.

## Context

Phases 0–5 are complete and verified (133 smoke checks pass across 7 suites). Phase 6 is the final phase: BYOK (user's own Claude/Gemini key for one-tap generation and label-photo nutrition) + PWA (installable, offline app shell) + backup nudge.

**Decisions already approved by the user — do not revisit:**
1. `exportState()` EXCLUDES `settings.apiKey` and `settings.fdcKey` (null them, don't delete); import preserves the device's local keys.
2. PWA is hand-rolled (`public/manifest.json` + `public/sw.js`). **No new dependencies.**
3. Schema change approved: add `Settings.lastExportAt` (ISO string | null), bump `SCHEMA_VERSION` 3→4 with migration.

## Design principle

BYOK reuses the entire existing paste pipeline — `compileWeekPrompt` → provider fetch → `validatePayload` → (on failure, ONE auto-retry using `buildFixRequest`) → `findConflicts`/`applyImport`. Zero new validation logic. Network code follows the `nutritionLookup.js` pattern: pure request-builders/response-mappers exported separately from fetch wrappers, key passed as an argument, never read from storage inside the module, never logged.

---

## Track 1 — Schema v4 + key-safe export

- `src/schema.js`: `createSettings()` adds `lastExportAt: null`; `SHAPES.Settings` adds the nullable-string field.
- `src/storage.js`:
  - `SCHEMA_VERSION = 4`. Migration `3→4`: `settings.lastExportAt ??= null` (append after the v2→v3 block; covers live localStorage AND old export files via the existing `parseAndValidate` → `migrate` path).
  - `exportState()`: serialize `{...state, settings: {...state.settings, apiKey: null, fdcKey: null}}` — null, not delete, so exports re-validate on import.
  - `importState()`: after validation succeeds, overlay the device's CURRENT `apiKey`/`fdcKey` onto the imported settings before writing — an import never plants or wipes a local secret (old v3 exports containing keys are tolerated and stripped).
  - New `markExported()`: sets `settings.lastExportAt` to now-ISO.
- `src/screens/SettingsScreen.jsx`: `handleExportDownload` and `handleExportCopy` call `storage.markExported()` on success (after download click / after clipboard write resolves).

## Track 2 — BYOK

### New `src/aiClient.js` (~170 lines)

Neutral message shape used everywhere: `[{role:'user'|'assistant', content:[{type:'text', text} | {type:'image', mediaType, data}]}]`.

Pure exports (offline-testable):
- `buildAnthropicRequest(apiKey, messages, maxTokens)` → `{url, headers, body}`:
  - URL `https://api.anthropic.com/v1/messages`
  - Headers: `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`, and **`anthropic-dangerous-direct-browser-access: true`** (required for browser CORS).
  - Body: `{model: 'claude-opus-4-8', max_tokens, messages}`. Image blocks map to `{type:'image', source:{type:'base64', media_type, data}}`. **Do NOT send `temperature`/`top_p`** — they return a 400 on this model.
- `buildGoogleRequest(apiKey, messages, maxTokens)` → URL `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`, key in **`x-goog-api-key` header** (never in the URL), roles mapped user/model, text as `parts:[{text}]`, images as `inline_data:{mime_type, data}`.
- `extractAnthropicText(json)`: join `content[]` blocks of `type==='text'`; if `stop_reason === 'max_tokens'` return `{ok:false, error:'Response was cut off — try again.'}`.
- `extractGoogleText(json)`: join `candidates[0].content.parts[].text`.
- `describeHttpError(provider, status)`: 401/403 "key rejected", 429 "rate limited", 500/503/529 "overloaded — try again".

Networked exports:
- `chat({provider, apiKey, messages, maxTokens = 16000})` → `{ok:true, text} | {ok:false, error}`. Non-streaming fetch, try/catch; errors never include the key or headers.
- `testConnection({provider, apiKey})` → single text message "Reply with OK", `maxTokens: 16`.

### New `src/byok.js` (~90 lines, pure — `chatFn` injectable, defaults to `aiClient.chat`)

- `generateWeekViaApi({provider, apiKey, prompt, chatFn, onProgress})`:
  1. `chatFn` with the compiled prompt as one user message. Transport/HTTP failure → `{ok:false, errors:[error], attempts:1}` (no retry on transport errors).
  2. `validatePayload(text)`. Valid → `{ok:true, payload, attempts:1}`.
  3. Otherwise ONE retry: append `{role:'assistant', <reply text>}` + `{role:'user', buildFixRequest(errors)}` and call again.
  4. Valid → `{ok:true, payload, attempts:2}`; else `{ok:false, errors, rawText, attempts:2}` (rawText enables the manual paste fallback).
- `regenerateComponentViaApi(...)`: identical loop over `validateComponentReply`.

### `src/promptCompiler.js`

New export `compileComponentPrompt({component, pantry, settings}, {mode: 'regenerate'|'substitute', instruction})`:
- Sections: on-hand pantry (reuse `pantrySection`) · protein band constraint · the current component as stripped JSON · task line per mode + the user's `instruction` verbatim · strict output rules ("Output ONLY one JSON object — a single component. No prose, no fences.") with the component example and type/station enums. Extract the component example JSON from `outputFormatSection()` into a shared helper so both prompts stay in lockstep.

### `src/weekImport.js`

New export `validateComponentReply(text)` → `{ok, errors, component}`: `extractJson` → parse → plain-object + non-empty name checks → `createComponent({...stripComponentPayload(parsed), origin:'ai', rating:null, archived:false, macroSource:'ai_estimate'})` → `validate(full, 'Component')`. (File lands ~305 lines — trim the header comment to stay near the 300 limit.)

### Settings UI — new `src/components/ByokSettings.jsx` (~150 lines)

Rendered from SettingsScreen (extraction keeps both files under 300 lines). Mirror the existing FDC-key block verbatim:
- **apiMode** segmented chips "Paste (no key)" / "Bring your own key" (paste default; enums from `API_MODES`).
- **provider** select "Claude (Anthropic)" / "Gemini (Google)" (from `PROVIDERS`).
- **API key**: masked `type="password"` input, draft state, Save disabled when unchanged, **Remove** → `apiKey: null`.
- **Test connection**: disabled when draft empty; calls `testConnection` with the trimmed draft; success/error message from status.
- Helper copy: "Your key is stored only on this device, sent only to Anthropic/Google, and never included in exports."

### One-tap Generate week

- New `src/components/ImportReview.jsx` (~90 lines): deliberate extraction from `WeekImportBox.jsx` of the review/confirm UI (diff summary, conflict rows with use-existing/replace/new chips, replaces-plan warning, Confirm/Cancel → `applyImport` → `onConfirm(applied)`). Both paste and BYOK share it (gate 2 + confirm-before-destructive rule).
- `WeekImportBox.jsx`: keeps textarea/Validate/fix-request; renders ImportReview when valid (behavior-preserving).
- `GenerateWeekForm.jsx`: when `apiMode==='byok' && apiKey`, primary button = **"Generate week"** (busy copy: "Asking Claude… this can take a minute"; show "Reply had validation issues — asking for a fix…" when attempt 2 starts). "Copy prompt" remains as secondary — paste mode always works (gate 1).
- `PlanScreen.jsx`: on success render ImportReview → existing `handleImported` persists (zero manual JSON — gate 2). On failure: error list + collapsible raw response with a Copy button.

### Micro-actions — new `src/components/MicroActionSheet.jsx` (~150 lines)

Sheet (same backdrop pattern as NutritionInfoEditor): instruction textarea prefilled per mode → `compileComponentPrompt` → `regenerateComponentViaApi` → **preview** (name, type, ingredients, steps count, shelf life, macros) → Apply / Discard. Nothing persists until Apply.
- **Library** (`ComponentDetail.jsx` + `LibraryScreen.jsx` passes settings/pantry): "Regenerate (AI)" button, BYOK only. Apply keeps the **same id and rating** (`{...newComp, id: original.id, rating: original.rating}` through `upsertComponent`) so weeks stay valid.
- **Plan** (`WeekView.jsx` + `AssemblyCards.jsx`): "AI substitute" per component on a card, BYOK only. Apply = upsert new component (new id) + `weekOps.substituteComponent(week, day, fromId, newId)` — per-day, like manual substitute. Route persistence through PlanScreen callbacks.

### Label photo (Phase 4.5 seam goes live)

- `src/nutritionLookup.js`: pure `mapLabelReply(text)` → `NutritionInfo` (`source:'label_photo'`, `state:'as_packaged'`, numbers coerced) or null; `LABEL_PROMPT` const demanding ONLY JSON `{servingDesc, servingsPerContainer|null, perServing:{kcal,protein_g,carbs_g,fat_g,fiber_g?}}`; networked `lookupLabelPhoto({provider, apiKey, mediaType, data})` via `aiClient.chat` (image block + prompt, maxTokens ~500) — same `{ok, nutrition}` contract as `lookupBarcode`.
- New `src/components/LabelPhotoButton.jsx` (~80 lines): `<input type="file" accept="image/*" capture="environment">` behind a styled button; canvas-downscale to max 1024px JPEG q0.8 → base64.
- `NutritionInfoEditor.jsx`: render the button next to "Scan barcode" when a `byok` prop is set; handler mirrors `handleScanned` → `applyPrefill(result.nutrition)` ("Read from photo — review and Save.") or graceful error. `PantryScreen` → `PantryItemEditor` → editor: pass `byok = apiMode==='byok' && apiKey ? {provider, apiKey} : null`.

## Track 3 — PWA + banners

### New `public/` (Vite serves at root; no vite.config change)

- `manifest.json`: name/short_name "MealCraft", `start_url: "/"`, `display: "standalone"`, `background_color: "#faf8f5"`, `theme_color: "#2f6b4f"` (values from styles.css), icons 192 + 512 + maskable-512.
- Icons: `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (20% safe-zone padding), `apple-touch-icon.png` (**180×180, opaque** — iOS ignores manifest icons). Generate with a one-off `scripts/make-icons.mjs` using `node:zlib` (hand-rolled PNG chunks, flat accent-green tile + simple bowl glyph). Commit the PNGs. If the pixel-math art is ugly, committing pre-made PNGs is an acceptable fallback.
- `sw.js` (~90 lines, classic script):
  - `const CACHE = 'mealcraft-shell-v1'` — bump on each deploy.
  - `install`: precache `['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png']`; `skipWaiting()`.
  - `activate`: delete every cache key ≠ CACHE; `clients.claim()`.
  - `fetch`: skip non-GET; **skip ALL cross-origin requests** (this makes api.anthropic.com / generativelanguage.googleapis.com / world.openfoodfacts.org / api.nal.usda.gov network-only automatically — keep a greppable `NETWORK_ONLY_HOSTS` comment listing them); navigations → network-first with cached `/index.html` fallback; other same-origin GETs → cache-first, populate on miss (covers Vite's hashed `/assets/*` after the first online visit).
  - App data needs no SW handling — it's localStorage.

### Shell wiring

- `index.html`: `<link rel="manifest">`, `<meta name="theme-color" content="#2f6b4f">`, `<link rel="apple-touch-icon">`, `mobile-web-app-capable`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title` = MealCraft.
- `src/main.jsx`: register `/sw.js` on window load **only when `import.meta.env.PROD`** (prevents stale-cache pain in dev).

### Backup nudge + install hint

- New `src/backupOps.js` (pure, ~30 lines): `shouldNudgeBackup({lastExportAt, hasUserData, nowISO})` — true when the user has any components/weeks/logs AND (never exported OR >14 days). Fresh installs with only pantry seeds are not nagged.
- New `src/components/BackupNudge.jsx` (~60 lines): storage-subscribed banner "No backup in {n} days — your data lives only on this device." + "Go to Settings" + Dismiss (in-memory; reappears next launch).
- New `src/components/InstallHint.jsx` (~70 lines): hidden when `matchMedia('(display-mode: standalone)').matches || navigator.standalone`; Chromium: capture `beforeinstallprompt` → Install button → `event.prompt()`; iOS Safari: text hint "Install: Share → Add to Home Screen." Dismiss = session state.
- `src/App.jsx`: mount both at the top of `.app-shell` (`onGoSettings={() => setActiveTab('settings')}`).
- `src/styles.css`: `.banner`, micro-action preview, busy-button styles under a `/* Phase 6 */` header.

---

## Automated tests — `scripts/smoke-phase6.mjs`

Same harness as smoke-phase5.mjs (MemoryStorage localStorage shim, `check(label, fn)`, `node:assert/strict`; plus `node:fs` for static PWA checks). **No network** — provider calls stubbed via `chatFn`.

Gate 1 (offline paste mode intact):
1. `createSettings()` has `lastExportAt: null` and validates.
2. v3→v4 migration of a seeded v3 blob; re-persisted `schemaVersion: 4`.
3. `importState` accepts both a v3 export string and a v4 export string.
4. Regression: `compileWeekPrompt` 5 sections; Phase-3 `validatePayload`/`applyImport` round-trip.
5. `sw.js` static: version string present; all four network-only hostnames listed; no cross-origin URL precached.

Gate 2 (BYOK, zero manual JSON):
6. `buildAnthropicRequest`: exact URL/headers incl. `anthropic-dangerous-direct-browser-access: true`, model `claude-opus-4-8`, **no `temperature`/`top_p` in body**.
7. `buildGoogleRequest`: URL ends `gemini-2.5-flash:generateContent`, key in `x-goog-api-key`, absent from URL.
8. Extractors: multi-block join; `stop_reason:'max_tokens'` → truncation error; Gemini fixture.
9. Image-block mapping for both providers.
10. `generateWeekViaApi` happy path with fenced/prose reply → `{ok, attempts:1}`; payload flows through `findConflicts` + `applyImport` to a valid WeekPlan.
11. Retry loop: garbage first reply → second call's messages are [prompt, assistant garbage, `buildFixRequest` output]; valid second reply → `{ok, attempts:2}`.
12. Double failure → `{ok:false, errors, rawText}`; transport failure → 1 attempt, no retry.
13. `compileComponentPrompt` contains pantry, component name, instruction, protein band, single-object rules.
14. `validateComponentReply` good → valid Component with `origin:'ai'`, `macroSource:'ai_estimate'`; bad fixtures → named errors.
15. Regenerate keeps id+rating through `upsertComponent`; substitute yields a week whose `componentIds` swap old→new for that day and pass `validate(week,'WeekPlan')`.
16. `mapLabelReply` fenced-JSON → NutritionInfo `source:'label_photo'` validating; garbage → null.

Gate 3 (key hygiene):
17. With keys set, `exportState()` string contains neither secret; parsed export has both fields `null`.
18. Import of an old export CONTAINING a key → stored key equals the device's pre-import value (or stays null).
19. After Remove (`apiKey: null`), full serialized state contains no key substring.
20. `markExported()` stamps ISO; survives export→import round trip.
21. `shouldNudgeBackup` boundaries: null+no-data false; null+data true; 15d true; 13d false.

Gate 4 (installability, static proxies):
22. `manifest.json` parses; name/short_name; standalone; 192+512+maskable icons; icon files exist with PNG magic bytes.
23. `index.html` has manifest link, theme-color, apple-touch-icon, apple title.
24. `main.jsx` registers `/sw.js` guarded by `import.meta.env.PROD`.

Also re-run smoke-phase0…5 at the end (no regressions).

---

## Manual test scripts (executor: print these verbatim at each checkpoint and wait)

### After Checkpoint 1 (schema v4 + export redaction)
1. Run `npm run dev` and open the app.
2. Settings → Export → **Download**. Open the downloaded file in a text editor. You should see `"schemaVersion": 4`, `"apiKey": null`, `"fdcKey": null`, and a `"lastExportAt"` timestamp in the file's settings.
3. In the app everything else should behave exactly as before (browse Pantry/Library/Plan/Track).
4. Import that same file back (Settings → Import → paste or file → Validate → Confirm). It should succeed with the usual diff summary.

### After Checkpoint 2 (aiClient/byok modules)
1. Run `node scripts/smoke-phase6.mjs` — all checks so far should pass. (No UI to test yet.)

### After Checkpoint 3 (BYOK settings + one-tap generate)
1. `npm run dev` → Settings. You should see the new "AI (bring your own key)" section: mode chips, provider select, masked key field.
2. Choose "Bring your own key", provider Claude, paste your Anthropic API key, tap **Test connection** → expect "Connection OK". (Wrong key → a clear "key rejected" message.)
3. Tap **Save**, go to Plan → Generate week. The primary button should now read **"Generate week"** (with "Copy prompt" still available).
4. Tap it. Expect a busy state ("Asking Claude… this can take a minute"), then a review sheet showing "X components, 1 week" and any name conflicts. Tap **Confirm** → the week appears. You never touched raw JSON.
5. Settings → Remove the key → the Generate button reverts to Copy prompt; paste flow still works.
6. Export again and confirm the file still shows `"apiKey": null`.

### After Checkpoint 4 (micro-actions + label photo)
1. With BYOK on: Library → open any sauce → tap **Regenerate (AI)** → optionally edit the instruction → Generate → a preview appears → **Apply**. The component updates in place; any week using it still shows it (same id); its rating is preserved.
2. Plan → an assembly card → component menu → **AI substitute** → instruction like "something Thai instead" → Generate → preview → Apply. That day's card now shows the new component; the new component also appears in Library.
3. On your phone (or with a webcam): Pantry → an item → Nutrition → **Photo of label** → snap a nutrition label → values prefill with a `label_photo` provenance tag → review → Save. A blurry/failed photo should show "Couldn't read the label — enter nutrition manually."

### After Checkpoint 5 (PWA + banners) — final gates
1. **Airplane test (gate 1):** `npm run build && npx vite preview`. Open the preview URL, load it once online, then enable airplane mode and hard-reload. The app must boot, all 5 tabs work, paste-mode Generate/Copy prompt works. Barcode/label lookups should fail with a friendly message.
2. **Install (gate 4), Android/desktop Chrome:** open the preview (or deployed) URL → you should see the install hint → Install → app opens standalone with the MealCraft icon and title, green theme color.
3. **Install, iPhone Safari:** the hint should say "Share → Add to Home Screen". Do it → 180px icon, correct title, standalone launch.
4. **Backup nudge:** DevTools → Application → localStorage → edit `mealcraft.v1` settings `lastExportAt` to a date 15+ days ago → reload → banner appears with day count → Export → banner disappears. Dismiss also hides it until next launch.
5. **Key hygiene final (gate 3):** with a key saved, DevTools → localStorage: the key exists only inside `mealcraft.v1` settings. Remove it in Settings → search localStorage for any fragment of the key → none found. Paste mode unaffected.
6. Dev sanity: `npm run dev` must NOT register the service worker (Application → Service Workers empty on the dev port).

---

## Risks & mitigations

- **Stale shell**: PROD-only SW registration + network-first navigations + version-keyed cache cleanup on activate. Bump `CACHE` when deploying.
- **Hashed assets** can't be precached by a hand-written SW: runtime cache-first covers them after one online visit (the airplane gate requires one prior online load — inherent to PWAs).
- **Anthropic browser CORS** only works with `anthropic-dangerous-direct-browser-access: true` — smoke check 6 guards it.
- **Truncation** surfaces as an explicit "cut off" error, not a confusing parse failure.
- **Latency**: ~up to a minute non-streaming; disable the button while busy (one explicit network call per tap, per CLAUDE.md).
- **weekImport.js ≈305 lines**: trim comments; if still over, note the justification.
- Old `dist/` is stale — rebuild before gate-4 testing.

## Checkpoints (commit + push after each; summarize changes in plain language first)

1. **Schema/storage v4** — schema.js, storage.js, SettingsScreen export stamping + smoke checks 1–4, 17–21.
2. **AI plumbing** — aiClient.js, byok.js, compileComponentPrompt, validateComponentReply + smoke 6–16.
3. **BYOK UI** — ByokSettings, ImportReview extraction, GenerateWeekForm/PlanScreen one-tap flow.
4. **Micro-actions + label photo** — MicroActionSheet, Library/WeekView wiring, LabelPhotoButton, nutritionLookup/NutritionInfoEditor.
5. **PWA + banners** — public/ (manifest, icons, sw.js), index.html, main.jsx, backupOps, BackupNudge, InstallHint, App.jsx, styles; full smoke-phase6 + all prior suites; then the final manual gate pass.
