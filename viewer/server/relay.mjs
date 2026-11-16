// Standalone multiplayer relay for hosts that can't hold WebSockets (the Vercel site points here).
// Env: PORT (host-provided), RELAY_ORIGINS = comma-separated allowed page origins,
// UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN = leaderboard store (in memory without them),
// RENDER_EXTERNAL_URL (set by Render) + KEEP_WARM_HOURS (UTC, default 2-18) = self-ping window.
import { createServer } from 'node:http';
import { attachMultiplayer, boardMiddleware, PLAY_PATH } from './multiplayer.mjs';
import { createBoard } from './board.mjs';
import { keepWarm } from './keepWarm.mjs';

const origins = (process.env.RELAY_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean);
const board = createBoard({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });
const server = createServer((req, res) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  if (path === '/' || path === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return; }
  // Aggregate, anonymous counters (see multiplayer.mjs). Readable by anyone; contains no pilot data.
  if (path === '/stats') { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ ...relay?.stats(), board: board.kind })); return; }
  boardMiddleware(relay)(req, res, () => { res.writeHead(404); res.end(); });
});
const relay = attachMultiplayer(server, { origins, board });
keepWarm(process.env.RENDER_EXTERNAL_URL, { hours: process.env.KEEP_WARM_HOURS ?? '2-18' });
const port = Number(process.env.PORT ?? 8787), host = process.env.HOST ?? '0.0.0.0';
server.listen(port, host, () => console.log(`Orbit relay on ${host}:${port}${PLAY_PATH}${origins.length ? ` for ${origins.join(', ')}` : ' (any origin)'} · board: ${board.kind}`));
