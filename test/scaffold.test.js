/**
 * Phase 0 smoke test: the domain modules import and expose their public API.
 *
 * Behavioural tests (worked split/settlement examples) arrive with the implementations
 * in Phase 2 — see docs/phases.md.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { computeBalances } from '../src/domain/balances.js'
import { settlementPlan } from '../src/domain/settlement.js'
import { validateEntry, ENTRY_TYPES } from '../src/domain/entries.js'

test('domain modules expose their public functions', () => {
  assert.equal(typeof computeBalances, 'function')
  assert.equal(typeof settlementPlan, 'function')
  assert.equal(typeof validateEntry, 'function')
})

test('entry types are the documented kinds', () => {
  assert.deepEqual([...ENTRY_TYPES], ['addWriter', 'wallet', 'expense', 'payment', 'fee', 'void', 'comment'])
})
