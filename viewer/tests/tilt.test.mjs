import { test } from 'node:test';
import assert from 'node:assert/strict';
import { screenTilt, tiltToMove, TILT } from '../src/game/tilt.ts';

const rest = { x: 0, y: 40 }; // phone held at a comfortable 40° in portrait

test('portrait: tilt right flies right, tilting the top away flies up the screen', () => {
  assert.deepEqual(tiltToMove(screenTilt(40, 25, 0), rest), { x: 1, z: 0 });
  assert.deepEqual(tiltToMove(screenTilt(40 - 25, 0, 0), rest), { x: 0, z: -1 });
});

test('small wobbles inside the dead zone do nothing; the ramp is linear to full speed', () => {
  assert.deepEqual(tiltToMove(screenTilt(41, 2, 0), rest), { x: 0, z: 0 });
  const half = TILT.dead + (TILT.full - TILT.dead) / 2;
  assert.equal(tiltToMove(screenTilt(40, half, 0), rest).x, 0.5);
});

test('landscape both ways: tilting toward the right edge of the screen still flies right', () => {
  // Top of the phone to the left (angle 90): the screen's right edge is the phone's bottom edge.
  const l = { beta: 10, gamma: -30 }, restL = screenTilt(l.beta, l.gamma, 90);
  assert.equal(tiltToMove(screenTilt(l.beta + 20, l.gamma, 90), restL).x, 1);
  // Top of the phone to the right (angle 270): the right edge is the phone's top edge.
  const restR = screenTilt(l.beta, l.gamma, 270);
  assert.equal(tiltToMove(screenTilt(l.beta - 20, l.gamma, 270), restR).x, 1);
});
