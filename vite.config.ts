import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths ("./assets/...") so the same build works at any address
  // (https://aquaticpark.vercel.app/ now, a custom domain later). Fine here because
  // the app is a single page with no routes.
  base: './',
  // The app's server code (api/, e.g. /api/water-temp) runs on Vercel, not in
  // `npm run dev`. In development, send /api requests to the live site instead.
  server: {
    proxy: {
      '/api': { target: 'https://aquaticpark.vercel.app', changeOrigin: true },
    },
  },
})
