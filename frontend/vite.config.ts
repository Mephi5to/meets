/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

function stripModuleAttributes(): Plugin {
  return {
    name: 'strip-module-attributes',
    enforce: 'post',
    transformIndexHtml(html) {
      return html
        .replace(/<script type="module" crossorigin/g, '<script defer')
        .replace(/<link rel="stylesheet" crossorigin/g, '<link rel="stylesheet"')
    },
  }
}

export default defineConfig({
  plugins: [react(), stripModuleAttributes()],
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        format: 'iife',
        entryFileNames: 'assets/[name]-[hash].js',
        manualChunks: undefined,
      },
    },
  },
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
