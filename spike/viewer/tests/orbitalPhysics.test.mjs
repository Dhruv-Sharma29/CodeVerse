import test from 'node:test';
import assert from 'node:assert/strict';
import { INNER_ORBIT_RADIUS, MAX_REPOSITORIES, ORBIT_STEP, orbitalPeriod, repositoryOrbit, stepOrbitPhysics } from '../src/scene/orbitalPhysics.ts';

test('repositories receive distinct solar-system orbits with slower outer years', () => {
  const orbits = Array.from({ length:MAX_REPOSITORIES }, (_, index) => repositoryOrbit(index, .5));
  assert.equal(new Set(orbits.map(orbit => orbit.radius)).size, MAX_REPOSITORIES);
  assert.equal(orbits[0].radius, INNER_ORBIT_RADIUS);
  assert.equal(orbits.at(-1).radius, INNER_ORBIT_RADIUS + (MAX_REPOSITORIES - 1) * ORBIT_STEP);
  const periods = orbits.map(orbit => orbitalPeriod(orbit.radius));
  assert.ok(periods.every((period, index) => index === 0 || period > periods[index - 1]));
  assert.ok(periods.at(-1) <= 110);
});

test('local orbital physics separates colliding planets and leaves clear bodies stable', () => {
  const collision = [
    { id:'a', x:0, z:0, vx:0, vz:0, targetX:0, targetZ:0, radius:1 },
    { id:'b', x:.5, z:0, vx:0, vz:0, targetX:.5, targetZ:0, radius:1 },
  ];
  const separated = stepOrbitPhysics(collision, 1 / 60);
  assert.ok(Math.hypot(separated[1].x - separated[0].x, separated[1].z - separated[0].z) >= 2.42 - 1e-9);

  const clear = [
    { id:'a', x:-3, z:0, vx:0, vz:0, targetX:-3, targetZ:0, radius:1 },
    { id:'b', x:3, z:0, vx:0, vz:0, targetX:3, targetZ:0, radius:1 },
  ];
  assert.deepEqual(stepOrbitPhysics(clear, 1 / 60), clear);
});
