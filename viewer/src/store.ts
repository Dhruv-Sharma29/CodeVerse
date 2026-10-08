import { create } from "zustand";
import type { Bundle } from "./types";

interface CodeverseState {
  bundle: Bundle | null;
  commitIndex: number;
  maxCommitIndex: number;
  playing: boolean;
  speed: number; // commits per second
  selected: number | null; // node id
  hovered: number | null;
  setBundle: (b: Bundle) => void;
  setCommitIndex: (i: number) => void;
  togglePlay: () => void;
  setPlaying: (p: boolean) => void;
  setSpeed: (s: number) => void;
  setSelected: (id: number | null) => void;
  setHovered: (id: number | null) => void;
  restartEvolution: () => void;
}

export const useStore = create<CodeverseState>((set, get) => ({
  bundle: null,
  commitIndex: 0,
  maxCommitIndex: 0,
  playing: false,
  speed: 24,
  selected: null,
  hovered: null,
  setBundle: (b) =>
    set({
      bundle: b,
      playing: false,
      selected: null,
      hovered: null,
      maxCommitIndex: Math.max(0, b.commits.length - 1),
      commitIndex: Math.max(0, b.commits.length - 1), // default: show the fully-formed HEAD
    }),
  setCommitIndex: (i) => {
    const max = get().maxCommitIndex;
    set({ commitIndex: Math.min(Math.max(0, i), max) });
  },
  togglePlay: () => set((s) => ({ playing: !s.playing })),
  setPlaying: (p) => set({ playing: p }),
  setSpeed: (s) => set({ speed: s }),
  setSelected: (id) => set({ selected: id }),
  setHovered: (id) => set({ hovered: id }),
  restartEvolution: () => set({ commitIndex: 0, playing: true }),
}));
