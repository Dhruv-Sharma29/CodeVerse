import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_KEYS, actionFor, keyLabel, loadKeys, rebind, resolveQuality } from '../src/game/settings.ts';

test('rebinding swaps a key that is already taken, and refuses reserved keys', () => {
  const k = rebind(DEFAULT_KEYS, 'fire', 'E');                 // E belongs to the gravity beam
  assert.equal(k.fire, 'e'); assert.equal(k.grab, ' ');         // ...which gets Space back
  assert.equal(actionFor(k, 'e'), 'fire');
  assert.equal(rebind(DEFAULT_KEYS, 'fire', 'ArrowUp'), DEFAULT_KEYS); // arrows always fly
  assert.equal(keyLabel(' '), 'Space'); assert.equal(keyLabel('q'), 'Q'); assert.equal(keyLabel('arrowup'), 'Arrowup');
});

test('saved bindings fall back to defaults when missing, reserved or duplicated', () => {
  assert.deepEqual(loadKeys(null), DEFAULT_KEYS);
  assert.equal(loadKeys({ fire: 'j', up: '1' }).fire, 'j');
  assert.equal(loadKeys({ fire: 'j', up: '1' }).up, 'w');
  assert.deepEqual(loadKeys({ fire: 'w' }), DEFAULT_KEYS);        // would clash with thrust
});

test('auto quality picks low only on small touch devices', () => {
  assert.equal(resolveQuality('auto', { touch: true, cores: 4 }), 'low');
  assert.equal(resolveQuality('auto', { touch: true, cores: 8, memory: 8 }), 'high');
  assert.equal(resolveQuality('auto', { touch: false, cores: 2 }), 'high');
  assert.equal(resolveQuality('low', { touch: false }), 'low');
});
