export const INNER_ORBIT_RADIUS = 5.2;
export const ORBIT_STEP = 1.35;
export const MAX_REPOSITORIES = 8;
export const ORBIT_X_SCALE = 1.2;
export const ORBIT_Z_SCALE = .8;

const INNER_PERIOD_SECONDS = 38;
const COMPRESSED_OUTER_RADIUS = 1.86;
const BASE_ANGULAR_SPEED = Math.PI * 2 / INNER_PERIOD_SECONDS;

export interface RepositoryOrbit {
  angle: number;
  radius: number;
  y: number;
}

export interface OrbitBody {
  id: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  targetX: number;
  targetZ: number;
  radius: number;
}

/** One repository per orbit, staggered by the golden angle so the initial view is legible. */
export function repositoryOrbit(index: number, seed: number): RepositoryOrbit {
  return {
    angle: index * Math.PI * (3 - Math.sqrt(5)) + seed * .45,
    radius: INNER_ORBIT_RADIUS + index * ORBIT_STEP,
    y: (seed - .5) * 1.1,
  };
}

/** Kepler's inverse-r^(3/2) angular-speed curve over a compressed visual distance. The
 * compression keeps the eighth planet's period under the measured 110-second window. */
export function orbitalAngularSpeed(visualRadius: number): number {
  const outerVisualRadius = INNER_ORBIT_RADIUS + (MAX_REPOSITORIES - 1) * ORBIT_STEP;
  const progress = Math.max(0, Math.min(1, (visualRadius - INNER_ORBIT_RADIUS) / (outerVisualRadius - INNER_ORBIT_RADIUS)));
  const physicalRadius = 1 + progress * (COMPRESSED_OUTER_RADIUS - 1);
  return BASE_ANGULAR_SPEED / Math.pow(physicalRadius, 1.5);
}

export function orbitalPeriod(visualRadius: number): number {
  return Math.PI * 2 / orbitalAngularSpeed(visualRadius);
}

/** Spring bodies toward their moving orbit, then resolve sphere collisions. This is local,
 * deterministic physics: it prevents planets passing through each other without changing
 * repository data or inventing a metric. */
export function stepOrbitPhysics(input: OrbitBody[], deltaSeconds: number): OrbitBody[] {
  const dt = Math.min(Math.max(deltaSeconds, 0), 1 / 30);
  const damping = Math.exp(-5 * dt);
  const bodies = input.map(body => {
    const vx = (body.vx + (body.targetX - body.x) * 7 * dt) * damping;
    const vz = (body.vz + (body.targetZ - body.z) * 7 * dt) * damping;
    return { ...body, vx, vz, x: body.x + vx * dt, z: body.z + vz * dt };
  });

  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i];
      const b = bodies[j];
      let dx = b.x - a.x;
      let dz = b.z - a.z;
      let distance = Math.hypot(dx, dz);
      const minimum = a.radius + b.radius + .42;
      if (distance >= minimum) continue;
      if (distance < 1e-6) {
        dx = a.id.localeCompare(b.id) <= 0 ? 1 : -1;
        dz = 0;
        distance = 1;
      }
      const nx = dx / distance;
      const nz = dz / distance;
      const correction = (minimum - distance) / 2;
      a.x -= nx * correction; a.z -= nz * correction;
      b.x += nx * correction; b.z += nz * correction;
      const separatingImpulse = correction * 2.4;
      a.vx -= nx * separatingImpulse; a.vz -= nz * separatingImpulse;
      b.vx += nx * separatingImpulse; b.vz += nz * separatingImpulse;
    }
  }
  return bodies;
}
