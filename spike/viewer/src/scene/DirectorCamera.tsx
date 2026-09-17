import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { recentActivityCentroid, recentActivityStrength } from "../activity";
import { useStore } from "../store";

/** During playback, the camera target drifts toward wherever commits are currently
 *  landing (PLAN.md §5.3 "director camera") — this one feature sells the GIF. Manual
 *  orbiting/zooming always wins; the drift only nudges the *target*, never the distance. */
export function DirectorCamera({
  initialTarget,
  minDistance,
  maxDistance,
}: {
  initialTarget: [number, number, number];
  minDistance: number;
  maxDistance: number;
}) {
  const controlsRef = useRef<OrbitControlsImpl>(null!);
  const userActive = useRef(false);
  const playing = useStore((s) => s.playing);

  useEffect(() => {
    controlsRef.current?.target.set(...initialTarget);
    controlsRef.current?.update();
    // only on first mount for this bundle — the drift/user-drag logic owns the target after that
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;

    controls.autoRotate = !playing && !userActive.current;
    if (playing && !userActive.current && recentActivityStrength > 0.4) {
      controls.target.lerp(recentActivityCentroid, Math.min(1, delta * 0.6));
    }
    controls.update();
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      minDistance={minDistance}
      maxDistance={maxDistance}
      enableDamping
      dampingFactor={0.08}
      autoRotateSpeed={0.35}
      onStart={() => (userActive.current = true)}
      onEnd={() => {
        setTimeout(() => (userActive.current = false), 4000);
      }}
    />
  );
}
