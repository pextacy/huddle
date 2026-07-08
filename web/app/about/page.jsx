'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Icon from '../../components/Icon'
import ThemeToggle from '../../components/ThemeToggle'

const REPO = 'https://github.com/pextacy/huddle'

const STEPS = [
  {
    n: '1',
    title: 'Create or join a group',
    body: 'Spin up a group or scan a QR invite. It’s a peer-to-peer ledger — no account, no server. It syncs directly between phones.'
  },
  {
    n: '2',
    title: 'Log expenses, split any way',
    body: 'Equal, exact amounts, percentages, or shares. Every peer derives the identical split down to the cent — even fully offline.'
  },
  {
    n: '3',
    title: 'Settle in USD₮',
    body: 'Pay what you owe wallet-to-wallet in USD₮ on-chain, or mark a cash repayment. The debt clears for everyone in the group.'
  }
]

const FEATURES = [
  {
    icon: 'wifi',
    title: 'Truly offline-first',
    body: 'The whole ledger runs on a Holepunch P2P stack (Hyperswarm · Autobase · Hyperbee). Record and reconcile costs with no connection at all.'
  },
  {
    icon: 'wallet',
    title: 'Self-custodial USD₮',
    body: 'A 24-word seed lives only on your device. Settle on-chain through the Tether WDK — your keys, your funds, no middleman ever holds them.'
  },
  {
    icon: 'spend',
    title: 'Four split modes',
    body: 'Equal, exact, percentage, or shares. Weighted splits resolve to exact cents deterministically, so no two peers ever drift apart.'
  },
  {
    icon: 'activity',
    title: 'Multiple groups',
    body: 'Hold every trip and matchday on one device and switch between them. Each group is its own P2P ledger with its own members.'
  },
  {
    icon: 'bank',
    title: 'Multi-currency',
    body: 'Enter in EUR, GBP, TRY, JPY… It converts to USD₮ once at entry with exact integer math, so balances stay exact and history never rewrites.'
  },
  {
    icon: 'receipt',
    title: 'Edit, void & cash settle',
    body: 'Fix or delete an expense with a clean reversal, or mark a cash / bank repayment — no wallet needed, works fully offline.'
  },
  {
    icon: 'chat',
    title: 'Comments & nudges',
    body: 'A threaded discussion hangs off each expense, and a creditor can nudge a debtor to settle up — all replicated peer-to-peer.'
  },
  {
    icon: 'search',
    title: 'Search, filters & CSV',
    body: 'Full-text search plus category and member filters over the feed, and one-tap CSV export of the entire ledger from Activity.'
  }
]

const TECH = [
  { label: 'Holepunch P2P', strong: true },
  { label: 'Tether WDK', strong: true },
  { label: 'Next.js + React' },
  { label: 'Installable PWA' },
  { label: 'Ethereum · Sepolia + Mainnet' }
]

// Faint floodlit-pitch backdrop with a slow rotating VAR-style sweep. Solid hairline strokes only.
function PitchBackdrop () {
  return (
    <div className="lp-pitch" aria-hidden="true">
      <svg className="lp-pitch-svg" viewBox="0 0 480 480" fill="none" role="presentation">
        <g stroke="var(--primary)" strokeWidth="1">
          <rect x="40" y="40" width="400" height="400" rx="12" opacity="0.1" />
          <line x1="40" y1="240" x2="440" y2="240" opacity="0.1" />
          <circle cx="240" cy="240" r="72" opacity="0.1" />
          <rect x="150" y="40" width="180" height="54" opacity="0.08" />
          <rect x="150" y="386" width="180" height="54" opacity="0.08" />
          <circle cx="240" cy="240" r="3.5" fill="var(--primary)" stroke="none" opacity="0.22" />
        </g>
        <g className="lp-pitch-sweep">
          <line x1="240" y1="240" x2="240" y2="40" stroke="var(--primary)" strokeWidth="1.5" opacity="0.24" />
        </g>
      </svg>
    </div>
  )
}

// The hero device as a live ledger: the "you are owed" figure counts up on first paint.
function LiveLedger () {
  const [amt, setAmt] = useState(0)
  useEffect(() => {
    const target = 42.5
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) { setAmt(target); return }
    const dur = 1100
    let raf = 0
    let start = null
    const tick = (t) => {
      if (start == null) start = t
      const p = Math.min(1, (t - start) / dur)
      const eased = 1 - Math.pow(1 - p, 3)
      setAmt(target * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="lp-device">
      <div className="lp-device-screen">
        <div className="lp-device-top">
          <h3>Derby Away Day</h3>
          <span className="m-tag credit"><span className="m-dot credit lp-live-dot" /> ONLINE</span>
        </div>
        <div className="m-card accent">
          <span className="m-label">You are owed</span>
          <div className="m-hero-amt mid credit">
            +{amt.toFixed(2)} <span className="cur">USD₮</span>
          </div>
        </div>
        <div className="m-stack" style={{ marginTop: 12 }}>
          <div className="m-brow accent">
            <div className="m-avatar">A</div>
            <div className="m-who">
              <div className="m-who-name">Aylin</div>
              <div className="m-who-sub">owes you</div>
            </div>
            <div className="m-amt credit">+28.00</div>
          </div>
          <div className="m-brow">
            <div className="m-avatar">M</div>
            <div className="m-who">
              <div className="m-who-name">Mert</div>
              <div className="m-who-sub">you owe</div>
            </div>
            <div className="m-amt debt">−14.50</div>
          </div>
        </div>
        <div className="lc-btn lc-btn-primary lc-btn-block lp-settle" style={{ marginTop: 14 }}>
          <Icon name="send" size={16} /> Settle in USD₮
        </div>
      </div>
    </div>
  )
}

export default function AboutPage () {
  const rootRef = useRef(null)

  // Scroll reveals: mark the tree as JS-capable, then fade elements in as they enter the viewport.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    root.classList.add('lp-js')
    const items = Array.from(root.querySelectorAll('[data-reveal]'))
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    // Never leave content hidden if motion is off or the observer isn't available.
    if (reduce || !('IntersectionObserver' in window)) { items.forEach((el) => el.classList.add('in')); return }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) }
      }
    }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' })
    items.forEach((el) => {
      const step = Number(el.dataset.reveal) || 0
      el.style.transitionDelay = `${(step % 4) * 70}ms`
      io.observe(el)
    })
    return () => io.disconnect()
  }, [])

  return (
    <div className="lp" ref={rootRef}>
      {/* nav */}
      <nav className="lp-nav">
        <div className="lp-wrap lp-nav-in">
          <Link href="/about" className="lp-brand">
            <span className="lp-mark">H</span>
            Huddle
          </Link>
          <div className="lp-navlinks">
            <a className="lp-navlink" href="#how">How it works</a>
            <a className="lp-navlink" href="#features">Features</a>
            <a className="lp-navlink" href={REPO} target="_blank" rel="noreferrer">GitHub</a>
            <ThemeToggle />
            <Link href="/" className="lc-btn lc-btn-primary lc-btn-sm" style={{ textDecoration: 'none', marginLeft: 4 }}>
              Open app
            </Link>
          </div>
        </div>
      </nav>

      {/* hero */}
      <header className="lp-wrap lp-hero">
        <PitchBackdrop />
        <div className="lp-hero-copy">
          <span className="lp-kicker">⚽ Built for the Tether Developers Cup</span>
          <h1 className="lp-h1">
            Split the tab offline.<br />Settle in <span className="g">USD₮</span>.
          </h1>
          <p className="lp-lead">
            A peer-to-peer expense splitter for group trips and matchdays. Track who owes whom with
            zero signal, then settle debts wallet-to-wallet in USD₮ when you’re back online — no
            servers, no custody, no accounts.
          </p>
          <div className="lp-ctas">
            <Link href="/" className="lc-btn lc-btn-primary lc-btn-lg">
              Open the app <Icon name="arrow" size={17} />
            </Link>
            <a href={REPO} target="_blank" rel="noreferrer" className="lc-btn lc-btn-outline lc-btn-lg">
              View on GitHub
            </a>
          </div>
          <div className="lp-trust">
            <span><span className="dot" /> No servers</span>
            <span><span className="dot" /> Self-custodial</span>
            <span><span className="dot" /> Works offline</span>
            <span><span className="dot" /> Installable PWA</span>
          </div>
        </div>

        <LiveLedger />
      </header>

      {/* how it works */}
      <section id="how" className="lp-section">
        <div className="lp-wrap">
          <span className="lp-eyebrow lp-reveal" data-reveal="0">How it works</span>
          <h2 className="lp-title lp-reveal" data-reveal="1">Three steps, zero servers.</h2>
          <div className="lp-steps">
            {STEPS.map((s, i) => (
              <div className="lp-step lp-reveal" data-reveal={i} key={s.n}>
                <span className="lp-step-n">{s.n}</span>
                <h4>{s.title}</h4>
                <p>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* features */}
      <section id="features" className="lp-section">
        <div className="lp-wrap">
          <span className="lp-eyebrow lp-reveal" data-reveal="0">Everything in the box</span>
          <h2 className="lp-title lp-reveal" data-reveal="1">A full split-and-settle ledger.</h2>
          <p className="lp-sub lp-reveal" data-reveal="2">
            Matches what Splitwise, Tricount and Settle Up offer — then adds a real on-chain wallet
            and a ledger that keeps working with no signal.
          </p>
          <div className="lp-grid">
            {FEATURES.map((f, i) => (
              <div className="lp-feat lp-reveal" data-reveal={i} key={f.title}>
                <span className="lp-feat-ic"><Icon name={f.icon} size={20} /></span>
                <h4>{f.title}</h4>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* tech / trust */}
      <section className="lp-section">
        <div className="lp-wrap">
          <span className="lp-eyebrow lp-reveal" data-reveal="0">Under the hood</span>
          <h2 className="lp-title lp-reveal" data-reveal="1">Open stack, self-custodial by design.</h2>
          <p className="lp-sub lp-reveal" data-reveal="2">
            The offline ledger is pure peer-to-peer — no backend to trust or take down. Settlement
            runs on Ethereum: free on Sepolia by default, real USD₮ on mainnet when you opt in.
          </p>
          <div className="lp-tech">
            {TECH.map((t, i) => (
              <span className="lp-chip lp-reveal" data-reveal={i} key={t.label}>
                {t.strong ? <b>{t.label}</b> : t.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* closing CTA */}
      <section className="lp-section lp-cta">
        <div className="lp-wrap">
          <span className="lp-eyebrow lp-reveal" data-reveal="0">Ready when you are</span>
          <h2 className="lp-title lp-reveal" data-reveal="1">Split the next trip in USD₮.</h2>
          <p className="lp-sub lp-reveal" data-reveal="2">Open it in the browser, or add it to your home screen and run it like a native app.</p>
          <div className="lp-ctas lp-reveal" data-reveal="3">
            <Link href="/" className="lc-btn lc-btn-primary lc-btn-lg">
              Open the app <Icon name="arrow" size={17} />
            </Link>
            <a href={REPO} target="_blank" rel="noreferrer" className="lc-btn lc-btn-outline lc-btn-lg">
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* footer */}
      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-in">
          <span className="lp-footer-meta">Huddle · Tether Developers Cup · MIT</span>
          <div className="lp-navlinks">
            <a href={REPO} target="_blank" rel="noreferrer">GitHub</a>
            <Link href="/" className="lp-navlink" style={{ display: 'inline-flex' }}>Open app</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
