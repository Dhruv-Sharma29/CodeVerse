// Orbit multiplayer relay. Each universe ("trending" or "u:<login>") is a room; the server only
// validates and relays. Aliens are simulated per client, so the server holds no game state.
// ponytail: single-process rooms in memory. Scaling past one instance needs a shared pub/sub.
import { WebSocketServer } from 'ws';
import { createBoard, dayOf } from './board.mjs';

export const PLAY_PATH = '/api/play';
export const BOARD_PATH = '/board';
const HULL_HP = { dart: 100, wasp: 70, titan: 160 }; // matches HULLS in src/game/sim.ts
/**
 * Server checks on self-reported state, so the leaderboards can't simply be typed in. Score may grow
 * by `rate` points a second on average with bursts up to `burst` (a mothership, a daily reward);
 * speed above `speed` (boost tops out near 95) and HP above the hull's maximum are impossible.
 * A pilot who fails a check keeps playing but is left off the boards for the rest of the connection.
 * ponytail: limits are estimates from the score table; tune them with the `flagged` count in /stats.
 */
export const CHECK = { rate: 80, burst: 4000, speed: 130 };
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

export function createRelay({ board = createBoard() } = {}) {
  const rooms = new Map(); // room -> Set<client>
  let nextId = 1;
  const send = (c, msg) => { if (c.ws.readyState === 1) c.ws.send(JSON.stringify(msg)); };
  const cast = (room, msg, except) => { for (const c of rooms.get(room) ?? []) if (c !== except) send(c, msg); };
  const summary = () => [...rooms].map(([room, set]) => ({ room, count: set.size })).sort((a, b) => b.count - a.count).slice(0, 12);
  // Aggregate counters for /stats: totals and peaks only, in memory, nothing about any pilot.
  const counters = { since: new Date().toISOString(), flagged: 0, connections: 0, sessions: 0, joins: 0, joinsWithCompany: 0, peakPilots: 0, peakRoom: { room: '', pilots: 0 } };
  const online = () => [...rooms.values()].reduce((n, set) => n + set.size, 0);
  const stats = () => ({
    ...counters, pilotsOnline: online(), roomsActive: rooms.size,
    // A session is a connection that launched into at least one universe; later joins are hyperjumps.
    hyperjumpsPerSession: counters.sessions ? +((counters.joins - counters.sessions) / counters.sessions).toFixed(2) : 0,
    shareOfJoinsWithCompany: counters.joins ? +(counters.joinsWithCompany / counters.joins).toFixed(2) : 0,
  });

  // A visit's points go to the boards when the pilot leaves the universe or starts a new game.
  function record(c) {
    if (c.cheat || c.last == null || c.stintBase == null || c.name === 'Pilot') return;
    board.add(c.name, c.room, c.last - c.runBase, c.last - c.stintBase).catch(() => {});
  }
  function check(c, st, now) {
    if (c.last == null || st.s < c.last) { // first report, or a new game after game over
      if (c.last != null) record(c);
      c.runBase = c.stintBase = st.s; c.bucket = CHECK.burst;
    } else {
      if (c.stintBase == null) c.stintBase = c.last;
      c.bucket = Math.min(CHECK.burst, c.bucket + (now - c.lastAt) / 1000 * CHECK.rate) - (st.s - c.last);
    }
    const bad = c.bucket < 0 || Math.hypot(st.vx, st.vz) > CHECK.speed || st.hp > (HULL_HP[c.hull] ?? 100) + 1;
    if (bad && !c.cheat) { c.cheat = true; counters.flagged++; }
    c.last = st.s; c.lastAt = now;
  }

  const cache = new Map(); // room -> { at, data }
  async function boards(room) {
    const hit = cache.get(room);
    if (hit && Date.now() - hit.at < 15_000) return hit.data;
    const data = { day: dayOf(), room, ...await board.top(room) };
    if (cache.size > 200) cache.clear();
    cache.set(room, { at: Date.now(), data });
    return data;
  }

  function leave(c) {
    if (!c.room) return;
    record(c); c.stintBase = null;
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
      if (rooms.get(room).size > 0) counters.joinsWithCompany++;
      rooms.get(room).add(c);
      counters.joins++; if (!c.joined) { c.joined = true; counters.sessions++; }
      const total = online(); if (total > counters.peakPilots) counters.peakPilots = total;
      if (rooms.get(room).size > counters.peakRoom.pilots) counters.peakRoom = { room, pilots: rooms.get(room).size };
      send(c, { t: 'welcome', id: c.id, room, peers });
      cast(room, { t: 'joined', id: c.id, name: c.name, color: c.color, hull: c.hull }, c);
      return;
    }
    if (m.t === 'rooms') return send(c, { t: 'rooms', rooms: summary() });
    if (!c.room) return;
    if (m.t === 'state') {
      // s: score, k: dogfight wins. Self-reported; `check` decides whether the score may be ranked.
      c.state = { x: num(m.x), z: num(m.z), a: num(m.a, 10), vx: num(m.vx), vz: num(m.vz), hp: num(m.hp, 1000), s: num(m.s, 1e9) | 0, k: num(m.k, 1e6) | 0 };
      check(c, c.state, now);
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
    } else if (m.t === 'ping') {
      cast(c.room, { t: 'ping', id: c.id, x: num(m.x), z: num(m.z) }, c);
    } else if (m.t === 'emote') {
      const e = num(m.e, 99) | 0;
      if (e >= 0 && e < EMOTE_COUNT) cast(c.room, { t: 'emote', id: c.id, e }, c);
    }
  }

  function connect(ws) {
    const c = { id: nextId++, ws, room: null, name: 'Pilot', color: '#74e2ff', state: null, windowStart: 0, count: 0, alive: true,
      last: null, runBase: 0, stintBase: null, bucket: CHECK.burst, lastAt: 0, cheat: false };
    counters.connections++;
    ws.on('message', data => handle(c, String(data)));
    ws.on('pong', () => { c.alive = true; });
    ws.on('close', () => leave(c));
    ws.on('error', () => ws.terminate());
    return c;
  }
  return { connect, rooms, summary, stats, boards, board };
}

/** Attach the relay to an HTTP server. Other upgrade paths (e.g. Vite HMR) are left alone. */
/** @param {{ origins?: string[], board?: ReturnType<typeof createBoard> }} [options] origins: when non-empty, only pages from these origins may connect. */
export function attachMultiplayer(httpServer, { origins = [], board } = {}) {
  if (!httpServer) return null;
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE * 2 });
  const relay = createRelay({ board });
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

/** GET /board?room=<universe>: all-time top 10 and today's top 10 in that universe. Public, names and scores only. */
export function boardMiddleware(relay) {
  return (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== BOARD_PATH || !relay) return next?.();
    const room = String(url.searchParams.get('room') ?? 'trending').toLowerCase();
    if (!ROOM.test(room)) { res.writeHead(400); res.end(); return; }
    const head = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
    relay.boards(room).then(d => { res.writeHead(200, head); res.end(JSON.stringify(d)); },
      () => { res.writeHead(503, head); res.end('{"error":"board unavailable"}'); });
  };
}
