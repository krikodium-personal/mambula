import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const root = dirname(fileURLToPath(import.meta.url))
const appVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version as string

// https://vite.dev/config/
export default defineConfig({
  base: '/mambula/',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
})
