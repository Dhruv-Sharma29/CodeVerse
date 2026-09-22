/** Screen-space placement for planet labels.
 *
 *  Planets orbit, so any fixed label offset eventually collides with another label,
 *  another planet, or the sun. This picks an anchor per label every frame from a small
 *  set of candidates, preferring the one it already uses (hysteresis) so labels don't
 *  flip between positions while the system turns.
 *
 *  Pure and viewport-agnostic: no DOM, no three.js, so it can be tested directly. */

export interface LabelItem {
  id: string;
  x: number;          // planet centre, canvas pixels
  y: number;
  planetRadius: number; // planet's on-screen radius, pixels
  width: number;        // label box
  height: number;
  depth: number;        // distance from camera; nearer labels get first choice
}

export interface Rect { x: number; y: number; width: number; height: number }

export interface Placement { dx: number; dy: number; anchor: number; overlap: number }

const GAP = 8;
const MARGIN = 5; // keeps placements from grazing when positions shift by a frame

/** Anchor order = preference order: below the planet first (the original design), then the
 *  other compass points, then the same ring pushed further out. The far tier matters when the
 *  system is crowded — it lets a label escape into empty canvas instead of colliding. */
export function candidates(item: LabelItem): { dx: number; dy: number }[] {
  const halfW = item.width / 2;
  const halfH = item.height / 2;
  const ring = (reach: number) => {
    const r = item.planetRadius + GAP + reach;
    const diagX = r * 0.72 + halfW;
    const diagY = r * 0.72 + halfH;
    return [
      { dx: 0, dy: r + halfH },
      { dx: 0, dy: -(r + halfH) },
      { dx: r + halfW, dy: 0 },
      { dx: -(r + halfW), dy: 0 },
      { dx: diagX, dy: diagY },
      { dx: -diagX, dy: diagY },
      { dx: diagX, dy: -diagY },
      { dx: -diagX, dy: -diagY },
    ];
  };
  return [...ring(0), ...ring(halfH * 2.2), ...ring(halfH * 4.4), ...ring(halfH * 7),
    ...ring(halfH * 10), ...ring(halfH * 14), ...ring(halfH * 18)];
}

export function rectFor(item: LabelItem, dx: number, dy: number): Rect {
  return { x: item.x + dx - item.width / 2, y: item.y + dy - item.height / 2, width: item.width, height: item.height };
}

export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Planet discs are obstacles too — a label covering a neighbouring planet reads as clutter
 *  even when it overlaps no other label. Squares approximate the disc closely enough here. */
function planetRect(item: LabelItem): Rect {
  const r = item.planetRadius;
  return { x: item.x - r, y: item.y - r, width: r * 2, height: r * 2 };
}

function outsideViewport(rect: Rect, viewport: { width: number; height: number }): number {
  const dx = Math.max(0, MARGIN - rect.x) + Math.max(0, rect.x + rect.width - (viewport.width - MARGIN));
  const dy = Math.max(0, MARGIN - rect.y) + Math.max(0, rect.y + rect.height - (viewport.height - MARGIN));
  return (dx + dy) * 1000; // heavy penalty: a clipped label is worse than a tight one
}

/**
 * @param items    labels to place
 * @param fixed    rects that must never be covered (e.g. the sun label)
 * @param previous last frame's anchor per id, for hysteresis
 */
export function layoutLabels(
  items: LabelItem[],
  fixed: Rect[],
  viewport: { width: number; height: number },
  previous: Map<string, number> = new Map(),
): Map<string, Placement> {
  // Nearest first, so foreground labels win their preferred anchor.
  const order = [...items].sort((a, b) => a.depth - b.depth);
  const taken: Rect[] = [...fixed];
  const others = new Map(items.map((item) => [item.id, planetRect(item)]));
  const result = new Map<string, Placement>();

  for (const item of order) {
    const options = candidates(item);
    const obstacles = [...taken];
    for (const [id, rect] of others) if (id !== item.id) obstacles.push(rect);

    // Choosing uses a padded rect so placements keep breathing room; the reported overlap is
    // the true, unpadded area, because callers use it to decide whether a label fits at all.
    const score = (index: number, pad = MARGIN) => {
      const { dx, dy } = options[index];
      const rect = rectFor(item, dx, dy);
      const padded = pad
        ? { x: rect.x - pad, y: rect.y - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }
        : rect;
      let total = outsideViewport(rect, viewport);
      for (const obstacle of obstacles) total += overlapArea(padded, obstacle);
      return total;
    };

    // Keep the current anchor while it is still clear; only move when it actually collides.
    const last = previous.get(item.id);
    let best = last !== undefined && score(last) === 0 ? last : 0;
    if (score(best) > 0) {
      let bestScore = Infinity;
      for (let i = 0; i < options.length; i++) {
        const value = score(i);
        if (value < bestScore) { bestScore = value; best = i; }
        if (value === 0) break;
      }
    }
    const { dx, dy } = options[best];
    result.set(item.id, { dx, dy, anchor: best, overlap: score(best, 0) });
    taken.push(rectFor(item, dx, dy));
  }
  return result;
}
