/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test-setup.ts'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_SIGNALING_URL || 'http://localhost:5000',
        changeOrigin: true,
      },
      '/hub': {
        target: process.env.VITE_SIGNALING_URL || 'http://localhost:5000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  define: {
    __SIGNALING_URL__: JSON.stringify(process.env.VITE_SIGNALING_URL || ''),
  },
})
