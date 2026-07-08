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
import { networkInterfaces } from 'node:os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// The laptop's LAN IPv4 (so a phone on the same Wi-Fi can open the app). null if not on a network.
function lanIp () {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) return a.address
    }
  }
  return null
}
const ip = lanIp()
// Let Next accept dev requests from the LAN origin, and let the frontend reach the backend there.
const lanEnv = ip ? { LAN_ORIGINS: `http://${ip}:3000,http://${ip}:8787` } : {}

function run (name, cmd, args, cwd, extraEnv = {}) {
  const p = spawn(cmd, args, { cwd, env: { ...process.env, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] })
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

console.log('Starting Huddle  ·  backend :8787  ·  frontend :3000')
console.log('  On this computer:  http://localhost:3000')
if (ip) {
  console.log(`  On your phone (same Wi-Fi):  http://${ip}:3000`)
  console.log('  → open that on the phone, then "Add to Home Screen" to install the app.')
}
console.log('')
procs.push(run('backend', 'node', ['server/index.mjs'], root))
procs.push(run('web', 'npm', ['run', 'dev'], join(root, 'web'), lanEnv))
