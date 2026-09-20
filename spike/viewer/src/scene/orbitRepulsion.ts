/** Angular repulsion between planets.
 *
 *  Planets on a ring share one orbital speed, so their spacing within a ring never changes,
 *  but rings turn at different rates — so planets from different rings drift into each other
 *  and clump. Rather than move planets off their rings, each one carries a small angular
 *  offset: neighbours push it forward or backward *along* its own orbit, and a spring pulls
 *  it back to its nominal slot once they separate.
 *
 *  Pure and frame-rate independent: no DOM, no three.js, so it can be tested directly. */

export interface PlanetBody {
  id: string;
  /** Fixed starting angle of this planet's slot on the ring, radians. */
  baseAngle: number;
  /** Nominal angle before repulsion (baseAngle + elapsed × speed), radians. */
  angle: number;
  /** Constant height above the orbital plane. */
  height: number;
  /** Ring radius, used to convert a push in world units into an angular one. */
  radius: number;
  x: number;
  y: number;
  z: number;
  /** Mutated in place: the angular displacement from the nominal slot. */
  offset: number;
  /** Mutated in place: rate of change of `offset`. */
  velocity: number;
}

/** Planets closer than this (world units) push each other apart. Largest planet radius is
 *  ~1.7, so this starts acting while they are still comfortably separated. */
export const INFLUENCE = 7.5;
const STRENGTH = 14;
const SPRING = 0.5;   // pull back toward the nominal slot — weak, so a neighbour can
                      // actually displace a planet before the spring cancels the push
const DAMPING = 2.5;  // stops the system oscillating
const MAX_OFFSET = 0.5; // radians (~29°), so a planet never swaps place with its neighbour
const MAX_STEP = 1 / 30; // clamp long frames; a tab regaining focus must not explode the sim

/** Advances the offsets one step, mutating `offset` and `velocity` on each body. */
export function stepRepulsion(bodies: PlanetBody[], delta: number): void {
  const dt = Math.min(Math.max(delta, 0), MAX_STEP);
  if (dt === 0) return;

  for (const body of bodies) {
    // Tangent of the elliptical orbit at this angle — the only direction a planet may move.
    const tx = -1.3 * Math.sin(body.angle + body.offset);
    const tz = 0.9 * Math.cos(body.angle + body.offset);
    const tangent = Math.hypot(tx, tz) || 1;

    let acceleration = 0;
    for (const other of bodies) {
      if (other.id === body.id) continue;
      const dx = body.x - other.x;
      const dy = body.y - other.y;
      const dz = body.z - other.z;
      const distance = Math.hypot(dx, dy, dz);
      if (distance >= INFLUENCE || distance === 0) continue;

      // Falls smoothly to zero at INFLUENCE, so planets don't twitch as neighbours enter range.
      const push = STRENGTH * (1 / distance - 1 / INFLUENCE);
      const along = (dx * tx + dz * tz) / (distance * tangent);
      acceleration += (push * along) / Math.max(body.radius, 0.001);
    }

    acceleration -= SPRING * body.offset;          // return to the nominal slot
    acceleration -= DAMPING * body.velocity;       // settle instead of ringing
    body.velocity += acceleration * dt;
    body.offset = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, body.offset + body.velocity * dt));
    if (Math.abs(body.offset) === MAX_OFFSET) body.velocity = 0; // don't wind up against the clamp
  }
}
