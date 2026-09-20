import { strict as assert } from "node:assert";
import { test } from "node:test";
import { layoutLabels, overlapArea, rectFor } from "../src/scene/labelLayout.ts";

const label = (id, x, y, extra = {}) => ({
  id, x, y, planetRadius: 14, width: 90, height: 34, depth: 20, ...extra,
});
const placedRect = (items, placements, id) => {
  const item = items.find((entry) => entry.id === id);
  const placement = placements.get(id);
  return rectFor(item, placement.dx, placement.dy);
};
const viewport = { width: 800, height: 500 };

test("labels that would collide are pushed to different anchors", () => {
  // Two planets close enough that both cannot use the default "below" anchor.
  const items = [label("a", 300, 250), label("b", 330, 250, { depth: 25 })];
  const placements = layoutLabels(items, [], viewport);

  assert.equal(placements.size, 2);
  assert.notEqual(placements.get("a").anchor, placements.get("b").anchor);
  assert.equal(overlapArea(placedRect(items, placements, "a"), placedRect(items, placements, "b")), 0);
});

test("a fixed rect such as the sun label is never covered", () => {
  const sun = { x: 360, y: 250, width: 120, height: 26 };
  // Ring of planets around the sun, all of whose default anchors point at it.
  const items = Array.from({ length: 6 }, (_, i) => {
    const angle = (i / 6) * Math.PI * 2;
    return label(`p${i}`, 420 + Math.cos(angle) * 70, 263 + Math.sin(angle) * 55, { depth: 20 + i });
  });
  const placements = layoutLabels(items, [sun], viewport);

  for (const item of items) {
    assert.equal(overlapArea(placedRect(items, placements, item.id), sun), 0, `${item.id} covers the sun label`);
  }
});

test("an anchor that is still clear is kept, so labels do not flip between frames", () => {
  const items = [label("a", 200, 200), label("b", 600, 400)];
  const first = layoutLabels(items, [], viewport);
  const previous = new Map([...first].map(([id, placement]) => [id, placement.anchor]));

  // Nudge one planet slightly: neither label collides, so both keep their anchors.
  const moved = [label("a", 204, 203), label("b", 600, 400)];
  const second = layoutLabels(moved, [], viewport, previous);

  assert.equal(second.get("a").anchor, first.get("a").anchor);
  assert.equal(second.get("b").anchor, first.get("b").anchor);
});

test("labels stay inside the viewport near an edge", () => {
  const items = [label("edge", 40, 480)]; // bottom-left corner: "below" would clip
  const placements = layoutLabels(items, [], viewport);
  const rect = placedRect(items, placements, "edge");

  assert.ok(rect.y + rect.height <= viewport.height + 1, "label hangs off the bottom");
  assert.ok(rect.x >= -1, "label hangs off the left");
});

test("nearer labels get their preferred anchor when two compete", () => {
  const near = label("near", 300, 250, { depth: 5 });
  const far = label("far", 330, 250, { depth: 60 });
  const placements = layoutLabels([near, far], [], viewport);

  assert.equal(placements.get("near").anchor, 0, "nearest label should keep the default anchor");
  assert.notEqual(placements.get("far").anchor, 0);
});

test("crowding falls back to the least-bad anchor rather than failing", () => {
  // Ten planets stacked on one point: no anchor can be free for all of them.
  const items = Array.from({ length: 10 }, (_, i) => label(`p${i}`, 400, 250, { depth: i }));
  const placements = layoutLabels(items, [], viewport);

  assert.equal(placements.size, 10);
  for (const placement of placements.values()) {
    assert.ok(Number.isFinite(placement.dx) && Number.isFinite(placement.dy));
  }
});
