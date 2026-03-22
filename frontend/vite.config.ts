import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
