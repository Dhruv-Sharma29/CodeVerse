// Tilt-to-steer: device orientation → a move vector in screen directions.

export interface Tilt { x: number; y: number }

/** Degrees of tilt ignored around the rest pose, and the tilt that gives full speed. */
export const TILT = { dead: 3, full: 18 };

/**
 * DeviceOrientation `beta` (front/back) and `gamma` (left/right) re-expressed in the screen's frame
 * for the current orientation angle, so "tilt toward the right edge of the screen" means the same
 * thing in portrait and both landscapes. x: right is positive; y: toward you is positive.
 */
export function screenTilt(beta: number, gamma: number, angle: number): Tilt {
  switch (((Math.round(angle) % 360) + 360) % 360) {
    case 90: return { x: beta, y: -gamma };    // landscape, top of the phone to the left
    case 270: return { x: -beta, y: gamma };   // landscape, top of the phone to the right
    case 180: return { x: -gamma, y: -beta };  // upside down
    default: return { x: gamma, y: beta };     // portrait
  }
}

/**
 * Tilt relative to the rest pose (how the phone was held when tilt was switched on) as a move vector:
 * x right, z down the screen, each in [-1, 1], with a dead zone and a linear ramp to full speed.
 * Tilting the top of the phone away from you flies up the screen.
 */
export function tiltToMove(t: Tilt, rest: Tilt): { x: number; z: number } {
  const axis = (v: number) => {
    const a = Math.abs(v);
    return a < TILT.dead ? 0 : Math.sign(v) * Math.min(1, (a - TILT.dead) / (TILT.full - TILT.dead));
  };
  return { x: axis(t.x - rest.x), z: axis(t.y - rest.y) };
}
