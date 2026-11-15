// Standalone multiplayer relay for hosts that can't hold WebSockets (the Vercel site points here).
// Env: PORT (host-provided), RELAY_ORIGINS = comma-separated allowed page origins.
import { createServer } from 'node:http';
import { attachMultiplayer, PLAY_PATH } from './multiplayer.mjs';

const origins = (process.env.RELAY_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean);
const server = createServer((req, res) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  if (path === '/' || path === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return; }
  // Aggregate, anonymous counters (see multiplayer.mjs). Readable by anyone; contains no pilot data.
  if (path === '/stats') { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(relay?.stats() ?? {})); return; }
  res.writeHead(404); res.end();
});
const relay = attachMultiplayer(server, { origins });
const port = Number(process.env.PORT ?? 8787), host = process.env.HOST ?? '0.0.0.0';
server.listen(port, host, () => console.log(`Orbit relay on ${host}:${port}${PLAY_PATH}${origins.length ? ` for ${origins.join(', ')}` : ' (any origin)'}`));
