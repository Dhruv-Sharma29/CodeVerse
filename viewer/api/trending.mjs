// Vercel Function for GET /api/trending. Reuses the same handler as the Vite dev/preview
// middleware (server/trending.mjs), so local and deployed behavior stay identical.
import { trendingMiddleware } from '../server/trending.mjs';

export default function handler(req, res) {
  return trendingMiddleware(req, res, () => {
    res.statusCode = 404;
    res.end();
  });
}
