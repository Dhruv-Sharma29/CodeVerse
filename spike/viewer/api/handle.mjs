// Vercel Function for /@:handle rewritten to /api/handle?handle=:handle.
import { profileHtmlMiddleware } from '../server/profileHtml.mjs';

export default function handler(req, res) {
  return profileHtmlMiddleware(req, res, () => {
    res.statusCode = 404;
    res.end();
  });
}
