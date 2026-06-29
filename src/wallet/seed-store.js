/**
 * Self-custodial seed storage (docs/claude.md secrets rules).
 *
 * The BIP-39 seed phrase lives ONLY on the device. It is never logged, never written to
 * the ledger, never replicated, never sent anywhere. This module is the single place the
 * seed touches disk, and it writes with owner-only (0600) permissions, OUTSIDE the repo.
 *
 * Precedence:
 *   1. SPLITKICK_SEED env var (used as-is, never persisted) — handy for CI / a funded demo seed.
 *   2. A seed file in the OS application-data directory.
 *   3. Generate a fresh 24-word seed and persist it.
 *
 * This is the Node/Bare-on-desktop store. A mobile build would swap in platform secure
 * storage (Keychain / Keystore) behind the same loadOrCreateSeed() shape.
 */

import { homedir, platform } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs'

const APP_DIR = 'splitkick-plus'

/** Default per-OS application-data directory for the seed file (never inside the repo). */
export function defaultSeedDir () {
  const home = homedir()
  if (platform() === 'darwin') return join(home, 'Library', 'Application Support', APP_DIR)
  if (platform() === 'win32') return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), APP_DIR)
  return join(process.env.XDG_DATA_HOME || join(home, '.local', 'share'), APP_DIR)
}

export function defaultSeedPath () {
  return join(defaultSeedDir(), 'wallet.seed')
}

/**
 * Load an existing seed without creating one. Returns null if none is stored.
 * Never logs the seed.
 * @param {string} [path]
 * @returns {string|null}
 */
export function loadSeed (path = defaultSeedPath()) {
  if (process.env.SPLITKICK_SEED) return process.env.SPLITKICK_SEED.trim()
  if (!existsSync(path)) return null
  return readFileSync(path, 'utf8').trim()
}

/**
 * Persist a seed to disk with owner-only permissions. Never logs the seed.
 * @param {string} seed
 * @param {string} [path]
 */
export function saveSeed (seed, path = defaultSeedPath()) {
  mkdirSync(defaultSeedDir(), { recursive: true, mode: 0o700 })
  writeFileSync(path, seed.trim() + '\n', { mode: 0o600 })
  chmodSync(path, 0o600) // enforce even if the file pre-existed
}

/**
 * Load the seed, or generate + persist a fresh one if none exists.
 * @param {(wordCount: 12|24) => string} generate - seed generator (e.g. WDK.getRandomSeedPhrase)
 * @param {string} [path]
 * @returns {{ seed: string, created: boolean, persisted: boolean, path: string }}
 */
export function loadOrCreateSeed (generate, path = defaultSeedPath()) {
  if (process.env.SPLITKICK_SEED) {
    return { seed: process.env.SPLITKICK_SEED.trim(), created: false, persisted: false, path: '(env SPLITKICK_SEED)' }
  }
  const existing = loadSeed(path)
  if (existing) return { seed: existing, created: false, persisted: true, path }

  const seed = generate(24)
  saveSeed(seed, path)
  return { seed, created: true, persisted: true, path }
}
