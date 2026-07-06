'use client'

import Icon from './Icon'

const TABS = [
  { key: 'ledger', label: 'LEDGER', icon: 'ledger' },
  { key: 'activity', label: 'ACTIVITY', icon: 'activity' },
  { key: 'wallet', label: 'WALLET', icon: 'wallet' }
]

export default function BottomNav ({ tab, setTab, enabled }) {
  return (
    <nav className="m-bottomnav">
      {TABS.map((t) => (
        <button
          key={t.key}
          className={`m-tab ${tab === t.key ? 'active' : ''}`}
          disabled={!enabled}
          onClick={() => setTab(t.key)}
        >
          <Icon name={t.icon} size={22} />
          {t.label}
        </button>
      ))}
    </nav>
  )
}
