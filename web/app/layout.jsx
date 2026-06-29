import './globals.css'

export const metadata = {
  title: 'SplitKick+',
  description: 'Offline-first group expense splitting with self-custodial USD₮ settlement'
}

export default function RootLayout ({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
