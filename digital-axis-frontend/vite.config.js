import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    fs: {
      allow: [projectRoot],
    },
  },
})
