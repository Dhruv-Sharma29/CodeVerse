import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { createProfileHtmlMiddleware, profileHtmlMiddleware } from './server/profileHtml.mjs'
import { ogMiddleware } from './server/og.mjs'
import { oracleMiddleware } from './server/oracle.mjs'
import { trendingMiddleware } from './server/trending.mjs'
import { githubMiddleware } from './server/github.mjs'

export const SITE_ORIGIN = 'https://codeverse-orbit.vercel.app'

export default defineConfig({
  plugins: [react(), {
    name: 'codeverse-server-and-metadata',
    transformIndexHtml(html) { return html.replaceAll('__SITE_ORIGIN__', SITE_ORIGIN) },
    configureServer(server) {
      server.middlewares.use(createProfileHtmlMiddleware({
        transformHtml: (url, html) => server.transformIndexHtml(url, html),
      }));
      server.middlewares.use(ogMiddleware);
      server.middlewares.use(oracleMiddleware);
      server.middlewares.use(trendingMiddleware);
      server.middlewares.use(githubMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(profileHtmlMiddleware);
      server.middlewares.use(ogMiddleware);
      server.middlewares.use(oracleMiddleware);
      server.middlewares.use(trendingMiddleware);
      server.middlewares.use(githubMiddleware);
    },
  }],
})
