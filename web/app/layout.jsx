import Script from 'next/script'
import { Geist, JetBrains_Mono } from 'next/font/google'
import './globals.css'

// Self-hosted (bundled at build) so the typography survives OFFLINE — the whole premise of the app.
// A CDN <link> would drop the brand to a system font exactly when there's no signal (a stadium).
const sans = Geist({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-sans', display: 'swap' })
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-mono', display: 'swap' })

export const metadata = {
  title: 'Huddle — split offline, settle in USD₮',
  description: 'Offline-first group expense splitting with self-custodial USD₮ settlement',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Huddle' },
  icons: { icon: '/icon-192.png', apple: '/apple-touch-icon.png' }
}

// Mobile-first: render at device width, cover the notch, and lock zoom so it feels like a native app.
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#0a0a0a'
}

// Register the service worker so the app is installable ("Add to Home Screen") and launches offline.
const swInit = `if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){});});}`

// Set the theme (light/dark) before first paint so there's no flash of the wrong palette.
const themeInit = `(function(){try{var q=new URLSearchParams(location.search).get('theme');var t=(q==='light'||q==='dark')?q:localStorage.getItem('lc-theme');if(t!=='light'&&t!=='dark')t='dark';document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='dark';}})()`

export default function RootLayout ({ children }) {
  return (
    <html lang="en" data-theme="dark" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <body>
        {/* Set the theme before first paint (no flash). beforeInteractive => injected into <head>. */}
        <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeInit }} />
        {children}
        {/* Register the service worker (installable + offline launch) once the page is interactive. */}
        <Script id="sw-init" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: swInit }} />
      </body>
    </html>
  )
}
