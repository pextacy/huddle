#!/usr/bin/env node
/**
 * One-command dev runner: starts the Node backend (P2P ledger + wallet) and the Next.js
 * frontend together, forwarding output and shutting both down on exit. No extra deps.
 *
 *   npm run app   ->   backend on :8787, frontend on :3000
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function run (name, cmd, args, cwd) {
  const p = spawn(cmd, args, { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
  const tag = `[${name}] `
  p.stdout.on('data', (d) => process.stdout.write(tag + d.toString().replace(/\n(?!$)/g, '\n' + tag)))
  p.stderr.on('data', (d) => process.stderr.write(tag + d.toString().replace(/\n(?!$)/g, '\n' + tag)))
  p.on('exit', (code) => { console.log(`${tag}exited (${code})`); shutdown() })
  return p
}

const procs = []
function shutdown () {
  for (const p of procs) { try { p.kill('SIGINT') } catch {} }
  setTimeout(() => process.exit(0), 200)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

console.log('Starting SplitKick+  ·  backend :8787  ·  frontend :3000\n')
procs.push(run('backend', 'node', ['server/index.mjs'], root))
procs.push(run('web', 'npm', ['run', 'dev'], join(root, 'web')))
