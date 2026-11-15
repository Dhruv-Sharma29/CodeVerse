// Gamepad support for the standard mapping (Xbox / PlayStation layouts in the browser Gamepad API).

/** Stick movement below this is ignored (sticks rarely rest at exactly zero). */
export const DEAD = 0.18;

export interface PadState {
  move: { x: number; z: number };      // left stick, screen directions
  aim: { x: number; z: number } | null; // right stick direction, or null when centred
  fire: boolean; grab: boolean; boost: boolean;
  nova: boolean; ping: boolean; dock: boolean; board: boolean;
  active: boolean;                      // any stick or button in use
}

type PadLike = { axes: readonly number[]; buttons: readonly { pressed: boolean; value?: number }[] };

const stick = (x: number, y: number) => {
  const l = Math.hypot(x, y);
  if (l < DEAD) return { x: 0, y: 0 };
  const k = Math.min(1, (l - DEAD) / (1 - DEAD)) / l; // rescale so movement starts smoothly past the dead zone
  return { x: x * k, y: y * k };
};

/**
 * Standard mapping: left stick flies, right stick aims, RT fires, LT gravity beam, A boost,
 * Y supernova, X ping, B dock, Back/Select pilots board.
 */
export function readPad(pad: PadLike): PadState {
  const b = (i: number) => !!pad.buttons[i] && (pad.buttons[i].pressed || (pad.buttons[i].value ?? 0) > .5);
  const l = stick(pad.axes[0] ?? 0, pad.axes[1] ?? 0), r = stick(pad.axes[2] ?? 0, pad.axes[3] ?? 0);
  const state: PadState = {
    move: { x: l.x, z: l.y },
    aim: r.x || r.y ? { x: r.x, z: r.y } : null,
    fire: b(7) || b(5), grab: b(6), boost: b(0), nova: b(3), ping: b(2), dock: b(1), board: b(8),
    active: false,
  };
  state.active = !!(l.x || l.y || r.x || r.y) || pad.buttons.some((_, i) => b(i));
  return state;
}
