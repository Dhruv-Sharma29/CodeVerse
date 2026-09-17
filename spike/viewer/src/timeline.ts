import type { Bundle, NodeState } from "./types";

/** Full replay of events[0..commitIndex] to get per-node state. O(events), which for spike-scale
 *  bundles (tens of thousands of events) is well under a millisecond in JS — fine every frame.
 *  A real build should use the prefix-indexed worker sampler described in PLAN.md §5.2/§5.3. */
export function computeStateAt(bundle: Bundle, commitIndex: number): NodeState {
  const n = bundle.nodes.length;
  const loc = new Float32Array(n);
  const alive = new Uint8Array(n);
  const lastTouch = new Int32Array(n).fill(-1);

  for (const [ci, nodeId, op, locAfter] of bundle.events) {
    if (ci > commitIndex) break;
    lastTouch[nodeId] = ci;
    if (op === 2) {
      alive[nodeId] = 0;
      loc[nodeId] = 0;
    } else {
      alive[nodeId] = 1;
      loc[nodeId] = locAfter;
    }
  }
  return { loc, alive, lastTouch };
}

export function maxLoc(bundle: Bundle): number {
  let m = 1;
  for (const [, , , loc] of bundle.events) if (loc > m) m = loc;
  return m;
}
