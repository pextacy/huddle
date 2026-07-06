'use client'

import { useMemo } from 'react'
import qrcode from 'qrcode-generator'

// Offline QR (no network, no image service). Solid black modules on white — no gradients.
export default function Qr ({ text, size = 132 }) {
  const svg = useMemo(() => {
    if (!text) return ''
    const qr = qrcode(0, 'M')
    qr.addData(text)
    qr.make()
    return qr.createSvgTag({ cellSize: 4, margin: 2 })
  }, [text])

  if (!svg) return null
  return (
    <div
      className="lc-qr"
      dangerouslySetInnerHTML={{ __html: svg.replace('<svg', `<svg width="${size}" height="${size}"`) }}
    />
  )
}
