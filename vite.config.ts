import { existsSync } from 'node:fs'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * The app's server code (api/, e.g. /api/water-temp) runs as Vercel Functions once
 * deployed. In `npm run dev`, this runs the same files locally: a request to /api/<name>
 * loads api/<name>.ts and calls its GET, as Vercel would.
 */
function localApi(): Plugin {
  return {
    name: 'local-api',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? '/', 'http://localhost')
        const match = /^\/api\/([\w-]+)$/.exec(url.pathname)
        if (match === null) return next()
        const file = `api/${match[1]}.ts`
        if (!existsSync(file)) return next()
        try {
          const module = await server.ssrLoadModule(`/${file}`)
          const answer: Response = await module.GET(new Request(url))
          response.statusCode = answer.status
          answer.headers.forEach((value, name) => response.setHeader(name, value))
          response.end(await answer.text())
        } catch (error) {
          next(error)
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), localApi()],
  // Relative asset paths ("./assets/...") so the same build works at any address
  // (e.g. https://aquaticpark.vercel.app/). Fine here because
  // the app is a single page with no routes.
  base: './',
})
