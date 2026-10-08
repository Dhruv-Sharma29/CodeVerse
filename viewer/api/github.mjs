import { githubMiddleware } from '../server/github.mjs';

export default function handler(req, res) {
  return githubMiddleware(req, res, () => { res.statusCode = 404; res.end(); });
}
