import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const frontendRoot = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(frontendRoot, '..')

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: 'react', replacement: resolve(frontendRoot, 'node_modules/react') },
      { find: 'react-dom', replacement: resolve(frontendRoot, 'node_modules/react-dom') }
    ],
    dedupe: ['react', 'react-dom'],
  },
  server: {
    fs: {
      allow: [projectRoot],
    },
  },
})
