import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { oracleMiddleware } from './server/oracle.mjs'
import { trendingMiddleware } from './server/trending.mjs'

export default defineConfig({
  plugins: [react(), {
    name: 'codeverse-monthly-trending',
    configureServer(server) { server.middlewares.use(oracleMiddleware); server.middlewares.use(trendingMiddleware) },
    configurePreviewServer(server) { server.middlewares.use(oracleMiddleware); server.middlewares.use(trendingMiddleware) },
  }],
})
