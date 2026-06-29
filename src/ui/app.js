/**
 * SplitKick+ — UI entry point.
 *
 * Phase 0: confirms the Bare/Pear shell boots. The real screens (Home, Group ledger,
 * Add expense, Settle up, Wallet, Onboarding) land in Phase 5 — see docs/phases.md.
 *
 * Visual rule (docs/claude.md): solid colors only, no gradients.
 */

const status = globalThis.document?.getElementById('status')
if (status) status.textContent = 'Phase 0 — scaffold · shell running'
