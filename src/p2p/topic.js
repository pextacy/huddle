/**
 * Deterministic group topic + invite code (docs/docs.md §6.1).
 *
 * A random 32-byte group secret is shared out-of-band (QR / invite code). Every member
 * derives the same 32-byte Hyperswarm topic from it: topic = hash(groupSecret).
 *
 * Implemented in Phase 3. See docs/phases.md.
 */

/** @returns {{ groupSecret: Buffer, topic: Buffer, inviteCode: string }} */
export function createGroup () {
  throw new Error('not implemented yet — Phase 3')
}

/** @param {string} inviteCode @returns {{ groupSecret: Buffer, topic: Buffer }} */
export function joinGroup (inviteCode) {
  throw new Error('not implemented yet — Phase 3')
}
