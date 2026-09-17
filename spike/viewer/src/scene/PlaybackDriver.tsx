import { useFrame } from "@react-three/fiber";
import { useStore } from "../store";

/** Advances commitIndex along the timeline while playing. Time moves in commit-index units,
 *  not wall clock, so quiet stretches of history don't drag (PLAN.md §5.3). */
export function PlaybackDriver() {
  const playing = useStore((s) => s.playing);
  const speed = useStore((s) => s.speed);
  const commitIndex = useStore((s) => s.commitIndex);
  const maxCommitIndex = useStore((s) => s.maxCommitIndex);
  const setCommitIndex = useStore((s) => s.setCommitIndex);
  const setPlaying = useStore((s) => s.setPlaying);

  useFrame((_, delta) => {
    if (!playing) return;
    const next = commitIndex + delta * speed;
    if (next >= maxCommitIndex) {
      setCommitIndex(maxCommitIndex);
      setPlaying(false);
    } else {
      setCommitIndex(next);
    }
  });

  return null;
}
