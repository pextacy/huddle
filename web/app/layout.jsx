import './globals.css'

export const metadata = {
  title: 'LedgerCore — SplitKick+',
  description: 'Offline-first group expense splitting with self-custodial USD₮ settlement'
}

// Mobile-first: render at device width (without this, phones lay out at ~980px and zoom out).
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a0a0a'
}

// Set the theme (light/dark) before first paint so there's no flash of the wrong palette.
const themeInit = `(function(){try{var q=new URLSearchParams(location.search).get('theme');var t=(q==='light'||q==='dark')?q:localStorage.getItem('lc-theme');if(t!=='light'&&t!=='dark')t='dark';document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='dark';}})()`

export default function RootLayout ({ children }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
