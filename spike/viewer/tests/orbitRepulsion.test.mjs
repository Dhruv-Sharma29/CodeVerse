import { strict as assert } from "node:assert";
import { test } from "node:test";
import { stepRepulsion, INFLUENCE } from "../src/scene/orbitRepulsion.ts";

/** A planet sitting at `angle` on a ring of `radius`, positioned on the same ellipse the
 *  scene uses (1.3 × / 0.9 z). */
const body = (id, angle, radius = 6, height = 0) => ({
  id, baseAngle: angle, angle, height, radius,
  x: Math.cos(angle) * radius * 1.3, y: height, z: Math.sin(angle) * radius * 0.9,
  offset: 0, velocity: 0,
});
const reposition = (b) => {
  b.x = Math.cos(b.angle + b.offset) * b.radius * 1.3;
  b.z = Math.sin(b.angle + b.offset) * b.radius * 0.9;
};
const settle = (bodies, steps = 240, dt = 1 / 60) => {
  for (let i = 0; i < steps; i++) { stepRepulsion(bodies, dt); bodies.forEach(reposition); }
};
const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

test("two planets that are too close push apart, in opposite directions", () => {
  const pair = [body("a", 0), body("b", 0.12)];
  const before = gap(pair[0], pair[1]);
  assert.ok(before < INFLUENCE, "fixture should start inside the influence radius");

  settle(pair);

  assert.ok(gap(pair[0], pair[1]) > before, "planets should end up further apart");
  assert.ok(pair[0].offset * pair[1].offset < 0, "offsets should have opposite signs");
});

test("planets already far apart are left alone", () => {
  const far = [body("a", 0), body("b", Math.PI)];
  settle(far, 120);

  for (const planet of far) {
    assert.ok(Math.abs(planet.offset) < 1e-6, `${planet.id} drifted without a neighbour`);
  }
});

test("a displaced planet springs back to its slot once the neighbour leaves", () => {
  const pair = [body("a", 0), body("b", 0.12)];
  settle(pair, 120);
  const displaced = Math.abs(pair[0].offset);
  assert.ok(displaced > 0.01, "should be displaced while crowded");

  // Neighbour moves to the far side of the ring, out of influence range.
  pair[1].angle = Math.PI;
  reposition(pair[1]);

  // Decay is exponential with a time constant set by SPRING/DAMPING, so assert the property
  // (it keeps shrinking, and ends near zero) rather than a value tied to today's tuning.
  settle(pair, 300);
  const midway = Math.abs(pair[0].offset);
  settle(pair, 1500);
  const settled = Math.abs(pair[0].offset);

  assert.ok(midway < displaced, `offset should be shrinking, ${displaced} -> ${midway}`);
  assert.ok(settled < midway, `offset should keep shrinking, ${midway} -> ${settled}`);
  assert.ok(settled < 0.01, `offset should relax to ~0, got ${settled}`);
});

test("offset is clamped, so a planet never swaps places with its neighbour", () => {
  // Five planets piled onto nearly the same angle: maximum possible crowding.
  const pile = Array.from({ length: 5 }, (_, i) => body(`p${i}`, i * 0.01));
  settle(pile, 600);

  for (const planet of pile) {
    assert.ok(Math.abs(planet.offset) <= 0.5 + 1e-9, `${planet.id} exceeded the clamp`);
    assert.ok(Number.isFinite(planet.offset) && Number.isFinite(planet.velocity));
  }
});

test("the simulation is stable across frame rates and does not explode on a long frame", () => {
  const steady = [body("a", 0), body("b", 0.12)];
  for (let i = 0; i < 240; i++) { stepRepulsion(steady, 1 / 144); steady.forEach(reposition); }

  const stalled = [body("a", 0), body("b", 0.12)];
  stepRepulsion(stalled, 5); // tab regained focus after five seconds
  stalled.forEach(reposition);

  for (const planet of [...steady, ...stalled]) {
    assert.ok(Math.abs(planet.offset) <= 0.5 + 1e-9, `${planet.id} unstable`);
    assert.ok(Number.isFinite(planet.velocity));
  }
});

test("a zero-length frame changes nothing", () => {
  const pair = [body("a", 0), body("b", 0.12)];
  stepRepulsion(pair, 0);
  assert.equal(pair[0].offset, 0);
  assert.equal(pair[0].velocity, 0);
});
