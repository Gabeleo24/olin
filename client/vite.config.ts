import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './', // Important for Electron relative paths
  server: {
    port: 5173,
  },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts', 'd3-scale', 'd3-tooltip'],
          maps: ['react-simple-maps'],
          supabase: ['@supabase/supabase-js'],
          state: ['zustand', '@tanstack/react-query'],
        },
      },
    },
  },
})

