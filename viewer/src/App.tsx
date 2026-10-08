import { useEffect, useMemo, useRef, useState } from "react";
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
import { MAX_BUNDLE_BYTES, parseBundle } from "./bundle";
import "./App.css";
import Explorer from "./github/Explorer";

const BUNDLE_URL = `${import.meta.env.BASE_URL}repo.json`;
const DEMO_URL = `${import.meta.env.BASE_URL}demo-repo.json`;
const EMPTY_BUNDLE_MESSAGE = "Open a repository bundle to start exploring.";

export default function App() {
  const bundle = useStore((s) => s.bundle);
  const setBundle = useStore((s) => s.setBundle);
  const [view, setView] = useState<"github" | "local">("github");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generation, setGeneration] = useState(0);
  const request = useRef(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    const id = ++request.current;
    fetch(BUNDLE_URL, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok || !r.headers.get("content-type")?.includes("application/json")) throw new Error(EMPTY_BUNDLE_MESSAGE);
        const content = await r.text();
        if (new Blob([content]).size > MAX_BUNDLE_BYTES) throw new Error("Bundle exceeds the 50 MB limit.");
        return parseBundle(JSON.parse(content));
      })
      .then((data) => { if (id === request.current) { setBundle(data); setGeneration(g => g + 1); } })
      .catch((e) => { if (id === request.current && !controller.signal.aborted) setError(String(e.message)); })
      .finally(() => { if (id === request.current) setLoading(false); });
    return () => controller.abort();
  }, [setBundle]);

  async function openBundle(file: File) {
    const id = ++request.current;
    setLoading(true);
    setError(null);
    try {
      if (file.size > MAX_BUNDLE_BYTES) throw new Error("Bundle exceeds the 50 MB limit.");
      const data = parseBundle(JSON.parse(await file.text()));
      if (id !== request.current) return;
      setBundle(data);
      setView("local");
      setGeneration(g => g + 1);
    } catch (e) {
      if (id === request.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (id === request.current) setLoading(false);
    }
  }

  async function openDemo() {
    const id = ++request.current;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(DEMO_URL);
      if (!response.ok) throw new Error("The demo universe could not be loaded.");
      const content = await response.text();
      if (new Blob([content]).size > MAX_BUNDLE_BYTES) throw new Error("Demo bundle exceeds the 50 MB limit.");
      const data = parseBundle(JSON.parse(content));
      if (id !== request.current) return;
      setBundle(data);
      setView("local");
      setGeneration(g => g + 1);
    } catch (e) {
      if (id === request.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (id === request.current) setLoading(false);
    }
  }

  const picker = <>
    <input ref={input} type="file" accept=".json,application/json" hidden
      onChange={e => {
        const file = e.currentTarget.files?.[0];
        e.currentTarget.value = "";
        if (file) void openBundle(file);
      }} />
    <button className="bundle-button" onClick={() => input.current?.click()} disabled={loading}>
      {loading ? "Loading universe…" : "Open repository bundle"}
    </button>
  </>;

  if (view === "github") return <>
    <Explorer onImport={() => input.current?.click()} onDemo={() => setView("local")} />
    <input ref={input} type="file" accept=".json,application/json" hidden onChange={e => {
      const file = e.currentTarget.files?.[0]; e.currentTarget.value = "";
      if (file) void openBundle(file);
    }} />
    {error && error !== EMPTY_BUNDLE_MESSAGE && <div className="import-error-toast" role="alert">{error}<button onClick={() => setError(null)}>Dismiss</button></div>}
  </>;

  if (!bundle) return (
    <main className="loading-screen">
      <div className="welcome-card">
        <button className="local-back" onClick={() => setView("github")}>← GitHub universe</button>
        <p className="welcome-eyebrow">CODEVERSE</p>
        <h1>Your code has a universe.</h1>
        <p>Explore its files, contributors, and evolution through Git history.</p>
        <div className="bundle-actions">{picker}<button className="demo-button" onClick={() => void openDemo()} disabled={loading}>Explore the demo</button></div>
        {error && (error === EMPTY_BUNDLE_MESSAGE
          ? <p className="bundle-empty">No local bundle is open yet. Choose one above or tour the included demo.</p>
          : <p className="bundle-error" role="alert">{error}</p>)}
        <p className="bundle-help">Create a bundle from any local repository:</p>
        <code>codeverse analyze /path/to/repo -o repo.json</code>
        <p className="bundle-help">JSON bundles · up to 50 MB · opened locally in your browser</p>
      </div>
    </main>
  );

  return <>
    <Loaded key={generation} bundle={bundle} />
    <div className="bundle-toolbar">
      <button className="local-back" onClick={() => { useStore.getState().setPlaying(false); setView("github"); }}>← GitHub universe</button>
      {picker}
      {error && <p className="bundle-error" role="alert">{error}</p>}
    </div>
  </>;
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
