/**
 * Recurring expense templates (pure, deterministic — no I/O, no Date.now()).
 *
 * A `recurring` entry is a template ("Rent, 1200 split 3 ways, monthly"). It is NOT itself an
 * expense — it materializes into real `expense` entries, one per due occurrence. The trick that
 * keeps this safe on a leaderless P2P ledger: each occurrence's expense gets a DETERMINISTIC id
 * (`${templateId}#${index}`) and a DETERMINISTIC ts (the scheduled occurrence time, never "now").
 * So if two peers independently materialize the same occurrence, they append byte-identical
 * entries under the same Hyperbee key — the view converges to exactly one, never a double-count.
 *
 * Templates are append-only and edited/stopped by re-appending with the same id and a later ts;
 * `latestTemplates` reduces the log to the authoritative (newest) state per template id.
 */

export const RECUR_CADENCES = /** @type {const} */ (['daily', 'weekly', 'monthly'])

const DAY = 86400000

/**
 * The next occurrence timestamp after `ts` for a cadence. Calendar-correct for 'monthly' (same
 * day-of-month, clamped to the target month's length), interval-based for daily/weekly. All math
 * is on an explicit timestamp in UTC, so it is fully deterministic.
 * @param {number} ts
 * @param {'daily'|'weekly'|'monthly'} cadence
 * @returns {number}
 */
export function nextOccurrence (ts, cadence) {
  if (cadence === 'daily') return ts + DAY
  if (cadence === 'weekly') return ts + 7 * DAY
  if (cadence === 'monthly') {
    const d = new Date(ts)
    const y = d.getUTCFullYear()
    const m = d.getUTCMonth()
    const day = d.getUTCDate()
    const targetM = m + 1
    const ny = y + Math.floor(targetM / 12)
    const nm = ((targetM % 12) + 12) % 12
    const daysInTarget = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate()
    const nd = Math.min(day, daysInTarget)
    return Date.UTC(ny, nm, nd, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds())
  }
  throw new Error(`unknown cadence "${cadence}"`)
}

/**
 * The occurrences of `template` whose scheduled time is at or before `now` — i.e. the expenses that
 * should already exist. Capped to avoid a runaway if a template's anchor is far in the past.
 * @param {object} template  a reduced recurring template (see latestTemplates)
 * @param {number} now  the cutoff timestamp (Date.now() at the I/O boundary)
 * @param {number} [cap]  max occurrences to emit in one pass
 * @returns {{ index:number, ts:number }[]}
 */
export function dueOccurrences (template, now, cap = 120) {
  if (!template || template.active === false) return []
  const out = []
  let ts = template.anchorTs
  let i = 0
  while (ts <= now && i < cap) {
    out.push({ index: i, ts })
    ts = nextOccurrence(ts, template.cadence)
    i++
  }
  return out
}

/**
 * Build the deterministic `expense` fields for one occurrence of a template. The id and ts are
 * derived purely from the template + occurrence index, so the entry is identical on every peer.
 * @param {object} template
 * @param {{ index:number, ts:number }} occ
 * @returns {object} fields for makeExpense
 */
export function materializeOccurrence (template, occ) {
  return {
    id: `${template.id}#${occ.index}`,
    payer: template.payer,
    amountMinor: template.amountMinor,
    currency: template.currency || 'USD',
    description: template.description || '',
    participants: [...template.participants],
    split: template.split || 'equal',
    category: template.category || 'other',
    recurringId: template.id,
    ts: occ.ts
  }
}

/**
 * Reduce the append-only log to the authoritative recurring template per id (newest ts wins), so a
 * later re-append that edits or stops (active:false) a template supersedes the original.
 * @param {object[]} entries
 * @returns {object[]} latest template per id
 */
export function latestTemplates (entries) {
  const byId = new Map()
  for (const e of entries) {
    if (!e || e.type !== 'recurring') continue
    const prev = byId.get(e.id)
    if (!prev || (e.ts || 0) >= (prev.ts || 0)) byId.set(e.id, e)
  }
  return [...byId.values()]
}
