import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { ogMiddleware } from './server/og.mjs'
import { oracleMiddleware } from './server/oracle.mjs'
import { trendingMiddleware } from './server/trending.mjs'

export const SITE_ORIGIN = 'https://codeverse-orbit.vercel.app'

export default defineConfig({
  plugins: [react(), {
    name: 'codeverse-server-and-metadata',
    transformIndexHtml(html) { return html.replaceAll('__SITE_ORIGIN__', SITE_ORIGIN) },
    configureServer(server) {
      server.middlewares.use(ogMiddleware);
      server.middlewares.use(oracleMiddleware);
      server.middlewares.use(trendingMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(ogMiddleware);
      server.middlewares.use(oracleMiddleware);
      server.middlewares.use(trendingMiddleware);
    },
  }],
})
