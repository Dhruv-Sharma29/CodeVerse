import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { trendingMiddleware } from './server/trending.mjs'

export default defineConfig({
  plugins: [react(), {
    name: 'codeverse-monthly-trending',
    configureServer(server) { server.middlewares.use(trendingMiddleware) },
    configurePreviewServer(server) { server.middlewares.use(trendingMiddleware) },
  }],
})
