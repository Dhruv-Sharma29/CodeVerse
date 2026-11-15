// Orbit multiplayer relay. Each universe ("trending" or "u:<login>") is a room; the server only
// validates and relays. Aliens are simulated per client, so the server holds no game state.
// ponytail: single-process rooms in memory. Scaling past one instance needs a shared pub/sub.
import { WebSocketServer } from 'ws';

export const PLAY_PATH = '/api/play';
const HULLS = new Set(['dart', 'wasp', 'titan']);
const EMOTE_COUNT = 6; // matches EMOTES in src/game/sim.ts
const ROOM = /^(?:trending|u:[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?)$/;
const MAX_PER_ROOM = 24;
const MAX_CLIENTS = 400;
const MAX_MESSAGE = 1024;
const RATE = 40; // messages per second per client

const num = (v, lim = 1e5) => Number.isFinite(v) ? Math.max(-lim, Math.min(lim, Math.round(v * 100) / 100)) : 0;
const cleanName = v => String(v ?? '').replace(/[^\w .-]/g, '').trim().slice(0, 18) || 'Pilot';
const cleanColor = v => /^#[\da-f]{6}$/i.test(v) ? v : '#74e2ff';

export function createRelay() {
  const rooms = new Map(); // room -> Set<client>
  let nextId = 1;
  const send = (c, msg) => { if (c.ws.readyState === 1) c.ws.send(JSON.stringify(msg)); };
  const cast = (room, msg, except) => { for (const c of rooms.get(room) ?? []) if (c !== except) send(c, msg); };
  const summary = () => [...rooms].map(([room, set]) => ({ room, count: set.size })).sort((a, b) => b.count - a.count).slice(0, 12);

  function leave(c) {
    if (!c.room) return;
    const set = rooms.get(c.room);
    set?.delete(c);
    if (set && !set.size) rooms.delete(c.room);
    cast(c.room, { t: 'left', id: c.id });
    c.room = null;
  }

  function handle(c, raw) {
    if (raw.length > MAX_MESSAGE) return;
    const now = Date.now();
    if (now - c.windowStart > 1000) { c.windowStart = now; c.count = 0; }
    if (++c.count > RATE) return;
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'join') {
      const room = String(m.room ?? '').toLowerCase();
      if (!ROOM.test(room)) return send(c, { t: 'error', message: 'That universe name is not valid.' });
      if ((rooms.get(room)?.size ?? 0) >= MAX_PER_ROOM) return send(c, { t: 'error', message: 'This universe is full. Try another one.' });
      leave(c);
      c.name = cleanName(m.name); c.color = cleanColor(m.color); c.hull = HULLS.has(m.hull) ? m.hull : 'dart'; c.room = room; c.state = null;
      if (!rooms.has(room)) rooms.set(room, new Set());
      const peers = [...rooms.get(room)].map(p => ({ id: p.id, name: p.name, color: p.color, hull: p.hull, state: p.state }));
      rooms.get(room).add(c);
      send(c, { t: 'welcome', id: c.id, room, peers });
      cast(room, { t: 'joined', id: c.id, name: c.name, color: c.color, hull: c.hull }, c);
      return;
    }
    if (m.t === 'rooms') return send(c, { t: 'rooms', rooms: summary() });
    if (!c.room) return;
    if (m.t === 'state') {
      // s: score, k: dogfight wins. Self-reported; nothing is stored or ranked.
      c.state = { x: num(m.x), z: num(m.z), a: num(m.a, 10), vx: num(m.vx), vz: num(m.vz), hp: num(m.hp, 1000), s: num(m.s, 1e9) | 0, k: num(m.k, 1e6) | 0 };
      cast(c.room, { t: 'state', id: c.id, ...c.state }, c);
    } else if (m.t === 'shot') {
      cast(c.room, { t: 'shot', id: c.id, x: num(m.x), z: num(m.z), a: num(m.a, 10), d: m.d === 2 ? 2 : 1 }, c);
    } else if (m.t === 'grab') {
      cast(c.room, { t: 'grab', id: c.id, planet: num(m.planet, 999) | 0, x: num(m.x), z: num(m.z), vx: num(m.vx), vz: num(m.vz), held: !!m.held }, c);
    } else if (m.t === 'nova') {
      cast(c.room, { t: 'nova', id: c.id, x: num(m.x), z: num(m.z) }, c);
    } else if (m.t === 'boom') {
      cast(c.room, { t: 'boom', id: c.id, x: num(m.x), z: num(m.z) }, c);
    } else if (m.t === 'killed') {
      // The shot-down pilot announces who got them; only ids of pilots in this room are passed on.
      const by = num(m.by, 1e9) | 0;
      if ([...rooms.get(c.room) ?? []].some(p => p.id === by && p !== c)) cast(c.room, { t: 'killed', id: c.id, by });
    } else if (m.t === 'emote') {
      const e = num(m.e, 99) | 0;
      if (e >= 0 && e < EMOTE_COUNT) cast(c.room, { t: 'emote', id: c.id, e }, c);
    }
  }

  function connect(ws) {
    const c = { id: nextId++, ws, room: null, name: 'Pilot', color: '#74e2ff', state: null, windowStart: 0, count: 0, alive: true };
    ws.on('message', data => handle(c, String(data)));
    ws.on('pong', () => { c.alive = true; });
    ws.on('close', () => leave(c));
    ws.on('error', () => ws.terminate());
    return c;
  }
  return { connect, rooms, summary };
}

/** Attach the relay to an HTTP server. Other upgrade paths (e.g. Vite HMR) are left alone. */
/** @param {{ origins?: string[] }} [options] origins: when non-empty, only pages from these origins may connect. */
export function attachMultiplayer(httpServer, { origins = [] } = {}) {
  if (!httpServer) return null;
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE * 2 });
  const relay = createRelay();
  const clients = new Set();
  httpServer.on('upgrade', (req, socket, head) => {
    if (new URL(req.url ?? '/', 'http://localhost').pathname !== PLAY_PATH) return;
    // A hosted relay only serves its own site: browsers always send Origin, so other pages are refused.
    if (origins.length && !origins.includes(String(req.headers.origin ?? ''))) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; }
    if (wss.clients.size >= MAX_CLIENTS) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, ws => { const c = relay.connect(ws); clients.add(c); ws.on('close', () => clients.delete(c)); });
  });
  const beat = setInterval(() => {
    for (const c of clients) { if (!c.alive) { c.ws.terminate(); continue; } c.alive = false; c.ws.ping(); }
  }, 20_000);
  beat.unref?.();
  httpServer.on('close', () => { clearInterval(beat); wss.close(); });
  return relay;
}
