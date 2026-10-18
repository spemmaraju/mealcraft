// Runs every scripts/smoke-*.mjs suite in its own Node process (each one
// shims globals like localStorage, so they must not share a process) and
// exits non-zero if any fail. Wired up as `npm test`; deploy.yml runs it
// before building, so a red suite blocks a deploy (Phase 17).

import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const dir = fileURLToPath(new URL('.', import.meta.url))
const suites = readdirSync(dir)
  .filter((name) => /^smoke-.+\.mjs$/.test(name))
  .sort()

const failed = []
for (const suite of suites) {
  const result = spawnSync(process.execPath, [suite], { cwd: dir, encoding: 'utf-8' })
  const summary = (result.stdout.trim().split('\n').pop() || '').trim()
  if (result.status === 0) {
    console.log(`PASS ${suite.padEnd(28)} ${summary}`)
  } else {
    failed.push(suite)
    console.log(`FAIL ${suite}`)
    process.stdout.write(result.stdout)
    process.stdout.write(result.stderr)
  }
}

console.log(`\n${suites.length - failed.length}/${suites.length} suites passed.`)
if (failed.length > 0) {
  console.log(`Failed: ${failed.join(', ')}`)
  process.exit(1)
}
