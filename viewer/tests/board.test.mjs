import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { attachMultiplayer, boardMiddleware, PLAY_PATH, CHECK } from '../server/multiplayer.mjs';
import { createBoard } from '../server/board.mjs';
import { inWindow } from '../server/keepWarm.mjs';

function client(url) {
  const ws = new WebSocket(url), inbox = [], waiters = [];
  ws.onmessage = e => { const m = JSON.parse(e.data); const w = waiters.findIndex(x => x.t === m.t); if (w >= 0) waiters.splice(w, 1)[0].resolve(m); else inbox.push(m); };
  const next = t => { const i = inbox.findIndex(m => m.t === t); return i >= 0 ? Promise.resolve(inbox.splice(i, 1)[0]) : new Promise(resolve => waiters.push({ t, resolve })); };
  return { ws, next, open: new Promise(r => ws.onopen = r), send: m => ws.send(JSON.stringify(m)) };
}
const settle = () => new Promise(r => setTimeout(r, 60));
const state = (s, extra = {}) => ({ t: 'state', x: 0, z: 0, a: 0, vx: 10, vz: 0, hp: 100, s, k: 0, ...extra });

async function relayServer() {
  const board = createBoard();
  const server = createServer((req, res) => boardMiddleware(relay)(req, res, () => { res.writeHead(404); res.end(); }));
  const relay = attachMultiplayer(server, { board });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `127.0.0.1:${server.address().port}`;
  return { server, relay, board, ws: `ws://${base}${PLAY_PATH}`, http: `http://${base}` };
}

test('honest runs reach the boards; daily board counts only points earned in that universe', async () => {
  const { server, ws, http } = await relayServer();
  const a = client(ws); await a.open;
  a.send({ t: 'join', room: 'trending', name: 'Ada' }); await a.next('welcome');
  a.send(state(0)); a.send(state(900)); await settle();
  a.send({ t: 'join', room: 'u:torvalds', name: 'Ada' }); await a.next('welcome'); // hyperjump carries the score
  a.send(state(900)); a.send(state(1500)); await settle();
  a.ws.close(); await settle();
  const b = await (await fetch(`${http}/board?room=u:torvalds`)).json();
  assert.deepEqual(b.all, [{ name: 'Ada', score: 1500 }]);   // the whole run
  assert.deepEqual(b.daily, [{ name: 'Ada', score: 600 }]);  // earned in u:torvalds only
  assert.equal((await fetch(`${http}/board?room=not%20a%20room`)).status, 400);
  await new Promise(r => server.close(r));
});

test('impossible score jumps, speed or hull are flagged and kept off the boards', async () => {
  const { server, relay, ws, board } = await relayServer();
  const cases = [
    ['Jumpy', [state(0), state(CHECK.burst + 500)]],
    ['Speedy', [state(0), state(10, { vx: CHECK.speed + 20 })]],
    ['Tanky', [state(0), state(10, { hp: 999 })]],
  ];
  for (const [name, msgs] of cases) {
    const c = client(ws); await c.open;
    c.send({ t: 'join', room: 'trending', name }); await c.next('welcome');
    for (const m of msgs) c.send(m);
    await settle(); c.ws.close(); await settle();
  }
  assert.equal(relay.stats().flagged, 3);
  assert.deepEqual((await board.top('trending')).all, []);
  await new Promise(r => server.close(r));
});

test('Upstash store sends ZADD GT pipelines and reads the top ten', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization });
    const n = calls.at(-1).body.length;
    return { ok: true, json: async () => n === 2 && calls.at(-1).body[0][0] === 'ZRANGE'
      ? [{ result: ['Ada', '1500', 'Lin', '900'] }, { result: ['Ada', '600'] }]
      : Array.from({ length: n }, () => ({ result: 1 })) };
  };
  const b = createBoard({ url: 'https://example.upstash.io/', token: 't0k', fetchImpl });
  await b.add('Ada', 'u:torvalds', 1500, 600, '2026-11-16');
  assert.equal(calls[0].url, 'https://example.upstash.io/pipeline');
  assert.equal(calls[0].auth, 'Bearer t0k');
  assert.deepEqual(calls[0].body[0], ['ZADD', 'board:all', 'GT', '1500', 'Ada']);
  assert.deepEqual(calls[0].body[2], ['ZADD', 'board:2026-11-16:u:torvalds', 'GT', '600', 'Ada']);
  const top = await b.top('u:torvalds', '2026-11-16');
  assert.deepEqual(top, { all: [{ name: 'Ada', score: 1500 }, { name: 'Lin', score: 900 }], daily: [{ name: 'Ada', score: 600 }] });
});

test('keep-warm window is inclusive and can wrap past midnight', () => {
  const at = h => new Date(Date.UTC(2026, 10, 16, h, 30));
  assert.equal(inWindow('2-18', at(2)), true);
  assert.equal(inWindow('2-18', at(18)), true);
  assert.equal(inWindow('2-18', at(19)), false);
  assert.equal(inWindow('22-3', at(1)), true);
  assert.equal(inWindow('22-3', at(12)), false);
});
