# Public GitHub proxy

CodeVerse can use a server-side GitHub token for its public explorer. Set `GITHUB_TOKEN` in the server environment (and redeploy on Vercel) to enable `/api/github`. The token is optional: without it, profiles, repository pages, commits, and contributors still use GitHub's unauthenticated browser API; branch and release moons then show only the known default branch. Never put this token in `src/` or a `VITE_` variable.

The proxy accepts only the explorer's public profile, repository, commit, contributor, branch, and release routes. It caches successful responses for five minutes (ten for branches and releases), coalesces simultaneous identical requests, and allows up to 100 upstream calls per client and 3,000 per server instance per hour. A selected repository's moons cost at most two upstream calls: up to six branches and four latest releases. The UI labels these as a sample when more pages exist.

These budgets and the cache are in memory and therefore **per serverless instance**, not global across a Vercel deployment. They reduce accidental exhaustion but cannot guarantee a deployment-wide cap. The shared token remains subject to GitHub's own rate limits; a rate-limit response gives the visitor a retry message. No database or paid service is required.
