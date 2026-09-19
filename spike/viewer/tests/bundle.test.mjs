import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBundle } from '../src/bundle.ts';
import { computeStateAt } from '../src/timeline.ts';
import { useStore } from '../src/store.ts';

const fixture = () => ({
  repo: 'example', nodes: ['old.py', 'new.py'], authors: ['Ada'],
  commits: [['abc', 100, 0], ['def', 200, 0], ['ghi', 300, 0]],
  events: [[0, 0, 0, 12, -1], [1, 1, 3, 12, 0], [2, 1, 2, 0, -1]],
});

test('accepts legacy notebook exports and versioned CLI bundles', () => {
  assert.equal(parseBundle(fixture()).repo, 'example');
  assert.equal(parseBundle({ ...fixture(), schemaVersion: 1 }).schemaVersion, 1);
});

test('rejects malformed data before rendering', () => {
  for (const change of [
    { schemaVersion: 2 }, { commits: [] }, { authors: [] }, { nodes: ['same', 'same'] },
    { commits: [['a', NaN, 0]] }, { events: [[0, 99, 0, 1, -1]] },
    { events: [[0, 0, 3, 1, -1]] }, { events: [[0, 0, 3, 1, 0]] },
    { events: [[0, 0, 0, -1, -1]] }, { events: [[1, 0, 0, 1, -1], [0, 0, 1, 1, -1]] },
  ]) assert.throws(() => parseBundle({ ...fixture(), ...change }), /Invalid bundle/);
  assert.throws(() => parseBundle(null), /Invalid bundle/);
});

test('rename retires the old path and delete retires the new path', () => {
  const b = fixture();
  assert.deepEqual([...computeStateAt(b, 0).alive], [1, 0]);
  const renamed = computeStateAt(b, 1);
  assert.deepEqual([...renamed.alive], [0, 1]);
  assert.deepEqual([...renamed.loc], [0, 12]);
  assert.equal(renamed.lastTouch[0], 1);
  assert.deepEqual([...computeStateAt(b, 2).alive], [0, 0]);
});

test('slow playback accumulates sub-frame progress and swapping bundles resets interaction', () => {
  const s = useStore.getState();
  s.setBundle(fixture());
  s.setCommitIndex(0);
  for (let frame = 0; frame < 60; frame++) {
    s.setCommitIndex(useStore.getState().commitIndex + 1 / 60);
  }
  assert.ok(useStore.getState().commitIndex > .99);
  s.setSelected(1); s.setHovered(1); s.setPlaying(true);
  s.setBundle(fixture());
  assert.equal(useStore.getState().selected, null);
  assert.equal(useStore.getState().hovered, null);
  assert.equal(useStore.getState().playing, false);
  assert.equal(useStore.getState().commitIndex, 2);
});


test('repairs notebook indices when empty commits were omitted', () => {
  const legacy = fixture();
  legacy.events[1][0] = 2;
  legacy.events[2][0] = 4;
  const restored = parseBundle(legacy);
  assert.deepEqual(restored.events.map(e => e[0]), [0, 1, 2]);
  assert.deepEqual([...computeStateAt(restored, 2).alive], [0, 0]);
  assert.equal(legacy.events[2][0], 4); // do not mutate the imported source
  assert.throws(() => parseBundle({ ...legacy, schemaVersion: 1 }), /Invalid bundle/);
});
