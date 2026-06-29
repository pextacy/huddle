/**
 * Offline QR generation (no network, no external image service — offline-first).
 *
 * Wraps the zero-dependency `qrcode-generator` to produce a self-contained SVG of solid
 * black modules on a solid background. No gradients (docs/claude.md visual rule).
 */

import qrcode from 'qrcode-generator'

/**
 * Render `text` as an SVG QR code string.
 * @param {string} text
 * @param {{ cellSize?: number, margin?: number, dark?: string, light?: string }} [opts]
 * @returns {string} SVG markup
 */
export function qrSvg (text, opts = {}) {
  const { cellSize = 5, margin = 2 } = opts
  const qr = qrcode(0, 'M') // type 0 = auto-size, error correction level M
  qr.addData(text)
  qr.make()
  return qr.createSvgTag({ cellSize, margin })
}
