import Link from 'next/link'
import Icon from '../../components/Icon'
import ThemeToggle from '../../components/ThemeToggle'

export const metadata = {
  title: 'Huddle — Split offline, settle in USD₮',
  description:
    'A peer-to-peer group expense splitter. Track who owes whom with zero signal, then settle debts wallet-to-wallet in USD₮ — no servers, no custody.'
}

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

export default function AboutPage () {
  return (
    <div className="lp">
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
        <div>
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

        {/* real app card mock — same components the app renders */}
        <div className="lp-device" aria-hidden="true">
          <div className="lp-device-screen">
            <div className="lp-device-top">
              <h3>Matchday</h3>
              <span className="m-tag credit"><span className="m-dot credit" /> ONLINE</span>
            </div>
            <div className="m-card accent">
              <span className="m-label">You are owed</span>
              <div className="m-hero-amt mid credit">+42.50 <span className="cur">USD₮</span></div>
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
            <div className="lc-btn lc-btn-primary lc-btn-block" style={{ marginTop: 14 }}>
              <Icon name="send" size={16} /> Settle in USD₮
            </div>
          </div>
        </div>
      </header>

      {/* how it works */}
      <section id="how" className="lp-section">
        <div className="lp-wrap">
          <span className="lp-eyebrow">How it works</span>
          <h2 className="lp-title">Three steps, zero servers.</h2>
          <div className="lp-steps">
            {STEPS.map((s) => (
              <div className="lp-step" key={s.n}>
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
          <span className="lp-eyebrow">Everything in the box</span>
          <h2 className="lp-title">A full split-and-settle ledger.</h2>
          <p className="lp-sub">
            Matches what Splitwise, Tricount and Settle Up offer — then adds a real on-chain wallet
            and a ledger that keeps working with no signal.
          </p>
          <div className="lp-grid">
            {FEATURES.map((f) => (
              <div className="lp-feat" key={f.title}>
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
          <span className="lp-eyebrow">Under the hood</span>
          <h2 className="lp-title">Open stack, self-custodial by design.</h2>
          <p className="lp-sub">
            The offline ledger is pure peer-to-peer — no backend to trust or take down. Settlement
            runs on Ethereum: free on Sepolia by default, real USD₮ on mainnet when you opt in.
          </p>
          <div className="lp-tech">
            {TECH.map((t) => (
              <span className="lp-chip" key={t.label}>
                {t.strong ? <b>{t.label}</b> : t.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* closing CTA */}
      <section className="lp-section lp-cta">
        <div className="lp-wrap">
          <span className="lp-eyebrow">Ready when you are</span>
          <h2 className="lp-title">Split the next trip in USD₮.</h2>
          <p className="lp-sub">Open it in the browser, or add it to your home screen and run it like a native app.</p>
          <div className="lp-ctas">
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
