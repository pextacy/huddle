'use client'

import Icon from './Icon'
import ThemeToggle from './ThemeToggle'

// Shared per-screen top bar: title on the left, online indicator + theme toggle on the right.
// `rightSlot` (e.g. the group switcher) renders before the status/theme controls.
export default function MobileHeader ({ title, online, showWifi = false, rightSlot = null }) {
  return (
    <header className="m-header">
      <div className="m-header-left">
        <h1>{title}</h1>
      </div>
      <div className="m-header-actions">
        {rightSlot}
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
