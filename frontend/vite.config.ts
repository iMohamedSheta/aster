import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const jsxRuntime = fileURLToPath(new URL('./src/lib/jsx-runtime.ts', import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^react\/jsx-runtime$/, replacement: jsxRuntime },
      { find: /^react\/jsx-dev-runtime$/, replacement: jsxRuntime },
    ],
  },
  server: { port: 5174, strictPort: true },
  build: { outDir: 'dist' },
})
