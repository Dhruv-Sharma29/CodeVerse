// Check a deployed multiplayer relay end to end.
// Usage: npm run check:relay -- https://codeverse-relay.onrender.com [https://codeverse-orbit.vercel.app]
const base = (process.argv[2] ?? '').replace(/\/+$/, '');
const origin = process.argv[3] ?? 'https://codeverse-orbit.vercel.app';
if (!/^https?:\/\//.test(base)) { console.error('Pass the relay address, e.g. https://codeverse-relay.onrender.com'); process.exit(2); }

const step = (ok, msg) => { console.log(`${ok ? 'OK' : 'FAIL'} ${msg}`); if (!ok) process.exit(1); };

// 1. Health. A sleeping free instance can take up to a minute to wake.
const t0 = Date.now();
const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(90_000) }).catch(e => ({ ok: false, status: String(e.message), headers: new Headers() }));
const routing = res.headers.get?.('x-render-routing');
step(res.ok, `GET /health -> ${res.status}${routing ? ` (render routing: ${routing})` : ''} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// 2. WebSocket from the allowed origin answers a rooms request.
const ws = base.replace(/^http/, 'ws') + '/api/play';
const ask = from => new Promise(resolve => {
  const s = new WebSocket(ws, { headers: { Origin: from } });
  const done = v => { clearTimeout(timer); try { s.close(); } catch {} resolve(v); };
  const timer = setTimeout(() => done('timeout'), 15_000);
  s.onopen = () => s.send(JSON.stringify({ t: 'rooms' }));
  s.onmessage = e => done(String(e.data));
  s.onerror = () => done('refused');
});
const reply = await ask(origin);
step(reply.includes('"rooms"'), `WebSocket from ${origin} -> ${reply}`);

// 3. Other origins are refused.
const other = await ask('https://not-codeverse.example');
step(other === 'refused', `WebSocket from another site -> ${other}`);
console.log(`\nRelay OK. Set VITE_RELAY_URL=${ws} in Vercel and redeploy.`);
