/**
 * Deterministic group topic + invite code (docs/docs.md §6.1).
 *
 * A random 32-byte group secret is shared out-of-band (QR / invite code). Every member
 * derives the same 32-byte Hyperswarm topic from it: topic = hash(groupSecret). The invite
 * code is just the secret in hex, so it round-trips deterministically.
 */

import crypto from 'hypercore-crypto'
import b4a from 'b4a'

/**
 * Create a new group: a random secret, its derived topic, and a shareable invite code.
 * @returns {{ groupSecret: Buffer, topic: Buffer, inviteCode: string }}
 */
export function createGroup () {
  const groupSecret = crypto.randomBytes(32)
  const topic = crypto.hash(groupSecret) // 32-byte Buffer
  const inviteCode = b4a.toString(groupSecret, 'hex')
  return { groupSecret, topic, inviteCode }
}

/**
 * Join a group from an invite code, re-deriving the same topic.
 * @param {string} inviteCode - 64-hex-char group secret
 * @returns {{ groupSecret: Buffer, topic: Buffer }}
 */
export function joinGroup (inviteCode) {
  if (typeof inviteCode !== 'string' || !/^[0-9a-fA-F]{64}$/.test(inviteCode.trim())) {
    throw new Error('Invalid invite code: expected 64 hex characters (a 32-byte secret).')
  }
  const groupSecret = b4a.from(inviteCode.trim(), 'hex')
  const topic = crypto.hash(groupSecret)
  return { groupSecret, topic }
}
