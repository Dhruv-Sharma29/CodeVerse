import type { Layout } from "../layout";

const GALAXY_COLORS = ["#6ea8ff", "#ff8a65", "#ffd54f", "#7cf0c2", "#c792ea", "#ff6e91", "#5ce1e6", "#f7a072"];

/** Faint emissive markers at each galaxy's center, purely decorative — a stand-in for the
 *  nebula/dust shader described in PLAN.md §5.1 (kept simple for the Phase 0 spike). */
export function GalaxyGlow({ layout }: { layout: Layout }) {
  const { galaxyPos } = layout;

  return (
    <group>
      {galaxyPos.map((pos, i) => (
        <mesh key={i} position={pos}>
          <sphereGeometry args={[1.4, 16, 16]} />
          <meshBasicMaterial
            color={GALAXY_COLORS[i % GALAXY_COLORS.length]}
            transparent
            opacity={0.16}
          />
        </mesh>
      ))}
    </group>
  );
}
