import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { attachMultiplayer, PLAY_PATH } from '../server/multiplayer.mjs';

function client(url) {
  const ws = new WebSocket(url), inbox = [], waiters = [];
  ws.onmessage = e => { const m = JSON.parse(e.data); const w = waiters.findIndex(x => x.t === m.t); if (w >= 0) waiters.splice(w, 1)[0].resolve(m); else inbox.push(m); };
  const next = t => { const i = inbox.findIndex(m => m.t === t); return i >= 0 ? Promise.resolve(inbox.splice(i, 1)[0]) : new Promise(resolve => waiters.push({ t, resolve })); };
  return { ws, next, open: new Promise(r => ws.onopen = r), send: m => ws.send(JSON.stringify(m)) };
}

test('players in the same universe see each other; other universes stay separate', async () => {
  const server = createServer(); attachMultiplayer(server);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `ws://127.0.0.1:${server.address().port}${PLAY_PATH}`;
  const a = client(url), b = client(url), c = client(url);
  await Promise.all([a.open, b.open, c.open]);
  a.send({ t: 'join', room: 'trending', name: 'Ada<script>', color: '#ff0000' });
  assert.deepEqual((await a.next('welcome')).peers, []);
  b.send({ t: 'join', room: 'trending', name: 'Lin', color: 'red', hull: 'titan' });
  const welcome = await b.next('welcome');
  assert.equal(welcome.peers[0].name, 'Adascript');
  const joined = await a.next('joined');
  assert.equal(joined.color, '#74e2ff'); assert.equal(joined.hull, 'titan');
  assert.equal(welcome.peers[0].hull, 'dart'); // unknown or missing hull falls back
  c.send({ t: 'join', room: 'u:torvalds', name: 'Sam' });
  await c.next('welcome');
  b.send({ t: 'state', x: 12, z: -4, a: 1, vx: 0, vz: 0, hp: 90 });
  const state = await a.next('state');
  assert.equal(state.x, 12); assert.equal(state.id, welcome.id);
  c.send({ t: 'join', room: 'not a room' });
  assert.match((await c.next('error')).message, /not valid/);
  b.ws.close();
  assert.equal((await a.next('left')).id, welcome.id);
  a.ws.close(); c.ws.close();
  await new Promise(r => server.close(r));
});

test('a relay with an origin allow-list refuses other sites', async () => {
  const server = createServer(); attachMultiplayer(server, { origins: ['https://codeverse-orbit.vercel.app'] });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `ws://127.0.0.1:${server.address().port}${PLAY_PATH}`;
  const opened = origin => new Promise(resolve => {
    const ws = new WebSocket(url, { headers: { Origin: origin } });
    ws.onopen = () => { ws.close(); resolve(true); }; ws.onerror = () => resolve(false);
  });
  assert.equal(await opened('https://codeverse-orbit.vercel.app'), true);
  assert.equal(await opened('https://evil.example'), false);
  await new Promise(r => server.close(r));
});

test('dogfight state, kill announcements and emotes are relayed and validated', async () => {
  const server = createServer(); attachMultiplayer(server);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `ws://127.0.0.1:${server.address().port}${PLAY_PATH}`;
  const a = client(url), b = client(url);
  await Promise.all([a.open, b.open]);
  a.send({ t: 'join', room: 'trending', name: 'Ada' }); const wa = await a.next('welcome');
  b.send({ t: 'join', room: 'trending', name: 'Lin' }); const wb = await b.next('welcome'); await a.next('joined');
  b.send({ t: 'state', x: 1, z: 2, a: 0, vx: 0, vz: 0, hp: 160, s: 1234, k: 3 });
  const st = await a.next('state');
  assert.deepEqual([st.hp, st.s, st.k], [160, 1234, 3]);
  b.send({ t: 'shot', x: 0, z: 0, a: 0, d: 2 }); assert.equal((await a.next('shot')).d, 2);
  b.send({ t: 'killed', by: 999999 }); // not in the room: dropped
  b.send({ t: 'killed', by: wa.id });
  const k = await a.next('killed'); assert.deepEqual([k.id, k.by], [wb.id, wa.id]);
  b.send({ t: 'emote', e: 42 }); b.send({ t: 'emote', e: 1 });
  assert.equal((await a.next('emote')).e, 1);
  a.ws.close(); b.ws.close(); await new Promise(r => server.close(r));
});

test('pings are relayed to the room with clamped coordinates', async () => {
  const server = createServer(); attachMultiplayer(server);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `ws://127.0.0.1:${server.address().port}${PLAY_PATH}`;
  const a = client(url), b = client(url);
  await Promise.all([a.open, b.open]);
  a.send({ t: 'join', room: 'u:torvalds', name: 'Ada' }); await a.next('welcome');
  b.send({ t: 'join', room: 'u:torvalds', name: 'Lin' }); const wb = await b.next('welcome'); await a.next('joined');
  b.send({ t: 'ping', x: 12.345, z: 'nope' });
  const p = await a.next('ping');
  assert.deepEqual([p.id, p.x, p.z], [wb.id, 12.35, 0]);
  a.ws.close(); b.ws.close(); await new Promise(r => server.close(r));
});
