'use client'

import { useEffect, useState } from 'react'
import Icon from './Icon'

// Light/dark toggle. The theme is applied to <html data-theme> (an inline script in layout.jsx
// sets it before paint to avoid a flash); this just flips it and persists the choice.
export default function ThemeToggle () {
  const [theme, setTheme] = useState('dark')

  useEffect(() => {
    const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
    setTheme(current)
  }, [])

  function toggle () {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.dataset.theme = next
    try { localStorage.setItem('lc-theme', next) } catch {}
  }

  return (
    <button className="icon-btn" onClick={toggle} aria-label="Toggle light/dark theme" title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}>
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={19} />
    </button>
  )
}
