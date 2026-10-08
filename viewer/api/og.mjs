// Vercel Function for GET /api/og?user=:handle. Reuses server/og.mjs.
import { ogMiddleware } from '../server/og.mjs';

export default function handler(req, res) {
  return ogMiddleware(req, res, () => {
    res.statusCode = 404;
    res.end();
  });
}
