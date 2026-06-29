/**
 * Hyperswarm discovery + Corestore replication (docs/docs.md §6.2).
 *
 * Joins the group topic (server + client so any peer can connect to any peer), replicates
 * every connection into the local Corestore, and tears the swarm down cleanly so the DHT
 * record is released. Offline-capable: peers on a shared LAN connect even with no internet
 * uplink — only the on-chain settlement needs the internet.
 *
 * Teardown is Pear-aware: under the Pear runtime it registers `Pear.teardown`; under plain
 * Node the returned `destroy()` is called by the host process.
 */

import Hyperswarm from 'hyperswarm'

/**
 * Join the swarm on `topic` and replicate into `store`.
 * @param {Buffer} topic - 32-byte group topic
 * @param {object} store - a Corestore
 * @param {{ keyPair?: object }} [opts]
 * @returns {Promise<{ swarm: object, discovery: object, destroy: () => Promise<void> }>}
 */
export async function joinSwarm (topic, store, opts = {}) {
  const swarm = new Hyperswarm(opts.keyPair ? { keyPair: opts.keyPair } : undefined)

  // Replicate every peer connection into our Corestore (this drives Autobase sync).
  swarm.on('connection', (conn) => store.replicate(conn))

  const destroy = async () => { await swarm.destroy() }

  // Clean shutdown so the DHT record is released. Pear runtime exposes a teardown hook;
  // under plain Node the host calls destroy() itself.
  const Pear = globalThis.Pear
  if (Pear && typeof Pear.teardown === 'function') Pear.teardown(destroy)

  // server + client: announce on the DHT and look up peers for this topic.
  const discovery = swarm.join(topic, { server: true, client: true })
  await discovery.flushed() // wait until we're announced

  return { swarm, discovery, destroy }
}
