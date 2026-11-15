import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// A WebSocket stand-in: the first `failures` connections close at once (relay asleep), then it opens.
function fakeSockets(failures) {
  let made = 0;
  return class FakeWS {
    static OPEN = 1;
    constructor() { this.readyState = 0; const n = made++; setTimeout(() => { if (n < failures) this.onclose?.(); else { this.readyState = 1; this.onopen?.(); } }, 100); }
    send() {} close() {}
  };
}

test('a sleeping hosted relay reports "waking", keeps retrying, then goes online', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  globalThis.fetch = async () => ({}); globalThis.location = { protocol: 'https:', host: 'x' };
  globalThis.WebSocket = fakeSockets(10); // ~30 s of failed attempts while it boots
  const { connectNet } = await import('../src/game/net.ts');
  const seen = [];
  const net = connectNet(() => {}, s => { if (seen.at(-1) !== s) seen.push(s); }, { url: 'wss://relay.example/api/play', hosted: true });
  for (let i = 0; i < 400; i++) mock.timers.tick(100);
  assert.deepEqual(seen, ['connecting', 'waking', 'online']);
  net.close(); mock.timers.reset();
});

test('a local server that refuses is reported offline, not waking', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  globalThis.WebSocket = fakeSockets(99);
  const { connectNet } = await import('../src/game/net.ts');
  const seen = [];
  const net = connectNet(() => {}, s => { if (seen.at(-1) !== s) seen.push(s); }, { url: 'ws://localhost/api/play', hosted: false });
  for (let i = 0; i < 50; i++) mock.timers.tick(100);
  assert.ok(!seen.includes('waking') && seen.includes('offline'), seen.join(','));
  net.close(); mock.timers.reset();
});
