import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import { useStore } from "./store";
import { buildLayout, layoutBounds } from "./layout";
import { Planets } from "./scene/Planets";
import { GalaxyGlow } from "./scene/GalaxyGlow";
import { DirectorCamera } from "./scene/DirectorCamera";
import { PlaybackDriver } from "./scene/PlaybackDriver";
import { Timeline } from "./hud/Timeline";
import { InfoPanel } from "./hud/InfoPanel";
import { Legend } from "./hud/Legend";
import type { Bundle } from "./types";
import "./App.css";

const BUNDLE_URL = `${import.meta.env.BASE_URL}repo.json`;

export default function App() {
  const bundle = useStore((s) => s.bundle);
  const setBundle = useStore((s) => s.setBundle);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(BUNDLE_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json();
      })
      .then((data: Bundle) => setBundle(data))
      .catch((e) => setError(String(e)));
  }, [setBundle]);

  if (error) {
    return (
      <div className="loading-screen">
        Failed to load {BUNDLE_URL}: {error}
        <br />
        Run notebooks/01_phase0_history_spike.ipynb and copy the output into public/repo.json.
      </div>
    );
  }
  if (!bundle) return <div className="loading-screen">🌌 loading universe…</div>;

  return <Loaded bundle={bundle} />;
}

function Loaded({ bundle }: { bundle: Bundle }) {
  const layout = useMemo(() => buildLayout(bundle), [bundle]);
  const bounds = useMemo(() => layoutBounds(layout), [layout]);
  const [cx, cy, cz] = bounds.center;
  const camDistance = bounds.radius * 2.4 + 4;

  return (
    <div className="app">
      <Canvas
        camera={{ position: [cx, cy + camDistance * 0.35, cz + camDistance], fov: 55, far: bounds.radius * 40 }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#05060a"]} />
        <ambientLight intensity={0.35} />
        <pointLight position={[cx, cy + bounds.radius, cz]} intensity={200} decay={2} />
        <Stars radius={bounds.radius * 8} depth={bounds.radius * 4} count={4000} factor={bounds.radius * 0.06} fade speed={0.4} />
        <GalaxyGlow layout={layout} />
        <Planets layout={layout} />
        <PlaybackDriver />
        <DirectorCamera
          initialTarget={bounds.center}
          minDistance={Math.max(bounds.radius * 0.03, 0.5)}
          maxDistance={bounds.radius * 8}
        />
        {/* EffectComposer (Bloom/Vignette) is disabled for now: combined with the ~5k-instance
            Planets mesh it renders solid black in this environment's software/headless GPU,
            with no console error. Untested whether this reproduces on a real GPU — worth
            revisiting before Phase 2 (see PLAN.md §5.1 bloom via postprocessing). */}
      </Canvas>
      <Legend />
      <InfoPanel />
      <Timeline />
    </div>
  );
}
