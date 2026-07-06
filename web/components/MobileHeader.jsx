'use client'

import Icon from './Icon'
import ThemeToggle from './ThemeToggle'

// Shared per-screen top bar: title on the left, online indicator + theme toggle on the right.
export default function MobileHeader ({ title, online, showWifi = false }) {
  return (
    <header className="m-header">
      <div className="m-header-left">
        <h1>{title}</h1>
      </div>
      <div className="m-header-actions">
        {showWifi && (
          <span className="icon-btn" title={online ? 'Online' : 'Offline'} style={{ color: online ? 'var(--primary)' : 'var(--warn)' }}>
            <Icon name="wifi" size={20} />
          </span>
        )}
        <ThemeToggle />
      </div>
    </header>
  )
}
