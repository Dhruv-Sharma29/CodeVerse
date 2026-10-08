// Shape of spike/out/<repo>.json, produced by notebooks/01_phase0_history_spike.ipynb

export type OpCode = 0 | 1 | 2 | 3; // A, M, D, R

export interface Bundle {
  schemaVersion?: 1; // absent in legacy notebook exports
  repo: string;
  nodes: string[]; // union of every path ever seen; index = node id
  authors: string[]; // author name; index = author id
  commits: [sha: string, t: number, authorIdx: number][];
  // [commit_idx, node_id, op, loc_after, old_node_id_or_-1]
  events: [number, number, OpCode, number, number][];
}

export interface NodeState {
  loc: Float32Array; // current line count, 0 if not alive
  alive: Uint8Array; // 1 if the file exists at this point in time
  lastTouch: Int32Array; // commit_idx of the most recent event, -1 if never touched yet
}

export interface LayoutNode {
  galaxy: number;
  pos: [number, number, number];
  peakLoc: number;
  color: string;
  depth: number; // path depth, used for base scale
}
