import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths ("./assets/...") so the same build works both at
  // https://arieljackson.github.io/aquatic-park-swim/ and later at the root of a
  // custom domain. Fine here because the app is a single page with no routes.
  base: './',
})
