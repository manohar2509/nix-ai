import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Chunk splitting for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          aws: ['aws-amplify', '@aws-amplify/ui-react'],
          ui: ['lucide-react', 'zustand', 'swr'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy API calls to backend in local dev
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path,
      },
    },
  },
})
