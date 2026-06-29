/**
 * Hyperswarm discovery + Corestore replication (docs/docs.md §6.2).
 *
 * Joins the group topic (server + client), replicates every connection into the local
 * Corestore, and tears the swarm down cleanly via Pear.teardown so the DHT record is
 * released. Offline-capable: peers on a shared LAN connect with no internet uplink.
 *
 * Implemented in Phase 3. See docs/phases.md.
 */

/** @param {Buffer} topic @returns {Promise<{ store: object, swarm: object }>} */
export async function joinSwarm (topic) {
  throw new Error('not implemented yet — Phase 3')
}
