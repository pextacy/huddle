import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const root = dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The P2P ledger + wallet live in the Node backend (server/index.mjs). The frontend talks
  // to it over HTTP/SSE — set NEXT_PUBLIC_API_URL to point at it (default http://localhost:8787).
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787'
  },
  // This app has its own lockfile under web/; pin the workspace root to silence the warning.
  turbopack: { root }
}

export default nextConfig
