import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls, Stars } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { World, Sun } from "./World";
import { planetStyle, seedFor } from "../github/planetStyle";
import type { Repository, GitCommit } from "../github/api";
import { layoutLabels, type LabelItem, type Rect } from "./labelLayout";
import * as THREE from "three";

/** Planets register their live position and label element here; LabelLayout (below) reads the
 *  registry once per frame and assigns each label a non-overlapping screen offset. Mutable and
 *  outside React on purpose — it changes every frame. */
// Ref objects, not their current values: drei's <Html> portals its children in after the
// parent's effect runs, so the element ref is still null at registration time.
interface PlanetEntry {
  group: React.RefObject<THREE.Group | null>;
  element: React.RefObject<HTMLElement | null>;
  worldRadius: number;
  baseAngle: number;
  height: number;
  radius: number;
}
type PlanetRegistry = Map<string, PlanetEntry>;

function Orbit({ radius, opacity = .1 }: { radius: number; opacity?: number }) {
  return <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
    <ringGeometry args={[radius, radius + .018, 160]} />
    <meshBasicMaterial color="#9a9eb8" transparent opacity={opacity} side={THREE.DoubleSide} depthWrite={false} />
  </mesh>;
}
function Satellite({ commit, index, total, active, onSelect }: {
  commit: GitCommit; index: number; total: number; active: boolean; onSelect: () => void;
}) {
  const angle = index / Math.max(total, 1) * Math.PI * 2;
  const r = 5.4;
  return <group position={[Math.cos(angle) * r, 0, Math.sin(angle) * r]}>
    <mesh onClick={e => { e.stopPropagation(); onSelect(); }}>
      <sphereGeometry args={[active ? .19 : .085, 12, 12]} />
      <meshBasicMaterial color={active ? "#f4d5a0" : "#728daa"} />
    </mesh>
    {active && <>
      <mesh scale={1.8} raycast={() => null}><sphereGeometry args={[.19,16,16]} /><meshBasicMaterial color="#dfb773" transparent opacity={.16} depthWrite={false} /></mesh>
      <Html center position={[0,.65,0]} zIndexRange={[8,0]}><span className="commit-beacon">{commit.sha.slice(0,7)}</span></Html>
    </>}
  </group>;
}

// Orbital motion. The innermost ring completes a revolution in INNER_PERIOD seconds and
// outer rings take proportionally longer (angular speed ∝ 1/radius), so the system spreads
// out over time the way a real one does instead of turning as a rigid disc. Elapsed time is
// accumulated here rather than read from the clock, so pausing holds position instead of
// resetting it. Ellipse factors (1.3 / .9) match the drawn Orbit rings.
const INNER_RADIUS = 5.8;
// Gap between rings. This, not the repulsion, sets how close two planets can ever get:
// the tightest pairs are radially adjacent across rings, and sliding a planet along its own
// ring cannot widen a radial gap.
const RING_GAP = 6.6;
const INNER_PERIOD = 46;
const orbitSpeed = (radius: number) => (Math.PI * 2) / INNER_PERIOD * (INNER_RADIUS / radius);
const orbitPosition = (angle: number, radius: number, y: number) =>
  [Math.cos(angle) * radius * 1.3, y, Math.sin(angle) * radius * .9] as [number, number, number];

function OrbitingRepo({ repo, angle, radius, y, motion, onOpen, onFocus, keyboardActive, registry }: {
  repo: Repository; angle: number; radius: number; y: number; motion: boolean;
  onOpen: () => void; onFocus: () => void; keyboardActive: boolean; registry: PlanetRegistry;
}) {
  const group = useRef<THREE.Group>(null);
  const label = useRef<HTMLButtonElement | null>(null);
  const style = useMemo(() => planetStyle(repo), [repo]);
  const id = String(repo.id);

  useEffect(() => {
    registry.set(id, {
      group, element: label, worldRadius: style.radius,
      baseAngle: angle, height: y, radius,
    });
    return () => { registry.delete(id); };
  }, [registry, id, angle, radius, y, style.radius]);

  // Anchored at the planet's centre; LabelLayout translates the card to a clear spot.
  return <group ref={group} position={orbitPosition(angle, radius, y)}>
    <World repo={repo} radius={style.radius} onClick={onOpen} animate={motion} />
    <Html center position={[0, 0, 0]} zIndexRange={[8, 0]}>
      <button ref={label} title={`${repo.full_name} · ${style.activity.label}`} aria-label={`Open ${repo.full_name}. ${repo.archived ? "Archived repository. " : ""}${style.activity.label}.`}
        className={`planet-label ${keyboardActive ? "is-keyboard-active" : ""} ${repo.archived ? "is-archived" : ""}`}
        onClick={onOpen} onFocus={onFocus}>
        <span className="planet-label-dot" style={{ background: style.glow }} />{repo.name}
        <small>{repo.archived ? "ARCHIVED · BLACK HOLE" : repo.language ?? "Mixed languages"}</small>
      </button>
    </Html>
  </group>;
}

const OVERVIEW_CAMERA = [0, 25, 34] as const;
const REPOSITORY_CAMERA = [0, 7.8, 12.5] as const;
const FLY_SECONDS = 1.05;

/** Keeps one camera alive across overview/detail mode and eases to the new framing. Any
 *  pointer interaction cancels the in-progress flight immediately. */
function CameraRig({ selected, motion }: { selected: boolean; motion: boolean }) {
  const camera = useThree((state) => state.camera);
  const controls = useRef<OrbitControlsImpl>(null);
  const previous = useRef(selected);
  const flight = useRef<null | {
    from: THREE.Vector3; to: THREE.Vector3;
    fromTarget: THREE.Vector3; toTarget: THREE.Vector3; elapsed: number;
  }>(null);

  useEffect(() => {
    if (previous.current === selected) return;
    previous.current = selected;
    const control = controls.current;
    flight.current = {
      from: camera.position.clone(),
      to: new THREE.Vector3(...(selected ? REPOSITORY_CAMERA : OVERVIEW_CAMERA)),
      fromTarget: control?.target.clone() ?? new THREE.Vector3(),
      toTarget: new THREE.Vector3(),
      elapsed: 0,
    };
    if (control) control.autoRotate = false;
  }, [camera, selected]);

  useEffect(() => {
    if (controls.current && !flight.current) controls.current.autoRotate = motion;
  }, [motion]);

  useFrame((_, delta) => {
    const active = flight.current;
    const control = controls.current;
    if (!active || !control) return;
    active.elapsed += Math.min(delta, .1);
    const linear = Math.min(1, active.elapsed / FLY_SECONDS);
    const eased = 1 - Math.pow(1 - linear, 3);
    camera.position.lerpVectors(active.from, active.to, eased);
    control.target.lerpVectors(active.fromTarget, active.toTarget, eased);
    control.update();
    if (linear === 1) {
      flight.current = null;
      control.autoRotate = motion;
    }
  });

  const interrupt = () => {
    flight.current = null;
    if (controls.current) controls.current.autoRotate = motion;
  };
  return <OrbitControls ref={controls} makeDefault enablePan={false} enableDamping dampingFactor={.07}
    autoRotate={motion} autoRotateSpeed={selected ? .5 : .7}
    minDistance={selected ? 7 : 16} maxDistance={selected ? 24 : 52}
    maxPolarAngle={Math.PI * .48} minPolarAngle={.2} onStart={interrupt} />;
}

/** Owns orbital motion for the whole system. Repulsion was removed after a full-orbit
 *  comparison showed that its visible sway did not improve the closest approach. */
function OrbitMotion({ motion, registry }: { motion: boolean; registry: PlanetRegistry }) {
  const elapsed = useRef(0);
  useFrame((_, delta) => {
    if (motion) elapsed.current += delta;
    for (const entry of registry.values()) {
      const angle = entry.baseAngle + elapsed.current * orbitSpeed(entry.radius);
      entry.group.current?.position.set(...orbitPosition(angle, entry.radius, entry.height));
    }
  });
  return null;
}

const isDebugLayout = () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "layout";

/** Places every registered label once per frame so labels avoid each other, the planets and
 *  the sun label. Runs after the planets' own useFrame callbacks (mounted later in the tree),
 *  so it reads this frame's positions. */
function LabelLayout({ registry }: { registry: PlanetRegistry }) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const anchors = useRef(new Map<string, number>());
  const point = useRef(new THREE.Vector3());
  const edge = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const metrics = useRef<{
    start: number; frames: number[]; lastSample: number; samples: number;
    labelOverlap: number; sunCovered: number; offscreen: number; hidden: number; done: boolean;
  } | null>(null);

  useFrame((_, delta) => {
    const canvas = gl.domElement;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;

    const items: LabelItem[] = [];
    for (const [id, entry] of registry) {
      const object = entry.group.current;
      const element = entry.element.current;
      if (!object || !element) continue;
      object.getWorldPosition(point.current);
      const depth = point.current.distanceTo(camera.position);

      // Project the planet centre, then a point one planet-radius to the camera's right,
      // to get the planet's on-screen radius in pixels.
      camera.getWorldDirection(edge.current);
      right.current.crossVectors(edge.current, camera.up).normalize().multiplyScalar(entry.worldRadius);
      edge.current.copy(point.current).add(right.current);
      const centre = point.current.clone().project(camera);
      const rim = edge.current.project(camera);
      const x = (centre.x * 0.5 + 0.5) * bounds.width;
      const yPos = (-centre.y * 0.5 + 0.5) * bounds.height;
      const planetRadius = Math.abs(rim.x - centre.x) * 0.5 * bounds.width;

      if (centre.z > 1) { element.style.visibility = "hidden"; continue; } // behind the camera
      element.style.visibility = "";
      items.push({ id, x, y: yPos, planetRadius, width: element.offsetWidth, height: element.offsetHeight, depth });
    }
    if (!items.length) return;

    // The sun label is fixed furniture: labels route around it rather than covering it.
    const fixed: Rect[] = [];
    // drei portals each <Html> into its own wrapper, so the sun label is a sibling branch of
    // the canvas rather than a descendant — search from the shared stage container.
    const sun = canvas.closest(".system-canvas")?.querySelector<HTMLElement>(".sun-label")
      ?? canvas.parentElement?.parentElement?.querySelector<HTMLElement>(".sun-label");
    if (sun) {
      const rect = sun.getBoundingClientRect();
      if (rect.width) fixed.push({ x: rect.x - bounds.x - 6, y: rect.y - bounds.y - 6, width: rect.width + 12, height: rect.height + 12 });
    }

    const placements = layoutLabels(items, fixed, { width: bounds.width, height: bounds.height }, anchors.current);
    for (const [id, placement] of placements) {
      const element = registry.get(id)?.element.current;
      if (!element) continue;
      element.style.transform = `translate(${Math.round(placement.dx)}px, ${Math.round(placement.dy)}px)`;
      // Keep every repository label present. Farther anchors handle narrow-screen crowding;
      // the sidebar and full accessible name remain available when the visible text truncates.
      element.style.opacity = "1";
      element.style.pointerEvents = "";
      anchors.current.set(id, placement.anchor);
    }

    if (!isDebugLayout()) return;

    if (!metrics.current) {
      metrics.current = { start: performance.now(), frames: [], lastSample: 0, samples: 0, labelOverlap: 0, sunCovered: 0, offscreen: 0, hidden: 0, done: false };
    }
    const measurement = metrics.current;
    if (measurement.done) return;
    measurement.frames.push(delta * 1000);
    const elapsed = performance.now() - measurement.start;
    if (elapsed - measurement.lastSample >= 500) {
      measurement.lastSample = elapsed;
      measurement.samples += 1;
      const canvasRect = canvas.getBoundingClientRect();
      const elements = [...registry.values()].map(entry => entry.element.current).filter((element): element is HTMLElement => Boolean(element));
      const visible = elements.filter(element => element.style.opacity !== "0" && element.style.visibility !== "hidden");
      const rects = visible.map(element => element.getBoundingClientRect());
      if (visible.length !== elements.length) measurement.hidden += 1;
      if (rects.some(rect => rect.left < canvasRect.left || rect.top < canvasRect.top || rect.right > canvasRect.right || rect.bottom > canvasRect.bottom)) measurement.offscreen += 1;
      const intersects = (a: DOMRect, b: DOMRect) => Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);
      if (rects.some((rect, index) => rects.slice(index + 1).some(other => intersects(rect, other)))) measurement.labelOverlap += 1;
      const sunRect = sun?.getBoundingClientRect();
      if (sunRect && rects.some(rect => intersects(rect, sunRect))) measurement.sunCovered += 1;

      const diagnosticOutput = document.querySelector<HTMLOutputElement>("output[data-scene-measurement]");
      if (diagnosticOutput) {
        const sorted = [...measurement.frames].sort((a, b) => a - b);
        diagnosticOutput.textContent = JSON.stringify({
          durationSeconds: elapsed / 1000, frames: measurement.frames.length, samples: measurement.samples,
          labelOverlapSamples: measurement.labelOverlap, sunCoveredSamples: measurement.sunCovered,
          offscreenSamples: measurement.offscreen, hiddenLabelSamples: measurement.hidden,
          meanFrameMs: measurement.frames.reduce((sum, value) => sum + value, 0) / measurement.frames.length,
          p95FrameMs: sorted[Math.floor(sorted.length * .95)], maxFrameMs: sorted.at(-1),
        });
      }
    }
    if (elapsed >= 110_000) {
      measurement.done = true;
    }
  });
  return null;
}

export function RepositorySystem({ repositories, selected, commits, commitIndex, onRepo, onCommit, centerLabel, motion }: {
  repositories: Repository[]; selected: Repository | null; commits: GitCommit[]; commitIndex: number;
  onRepo: (repo: Repository) => void; onCommit: (index: number) => void; centerLabel: string; motion: boolean;
}) {
  // One registry per mounted system; see PlanetRegistry above for why it is not module state.
  const [registry] = useState<PlanetRegistry>(() => new Map());
  const [debugLayout] = useState(() => isDebugLayout());
  const [keyboardIndex, setKeyboardIndex] = useState(0);
  const placements = useMemo(() => repositories.map((repo, i) => {
    const ring = Math.floor(i / 4);
    return {
      repo,
      angle: (i % 4) * Math.PI / 2 + ring * .65 + .3,
      radius: INNER_RADIUS + ring * RING_GAP,
      y: (seedFor(repo.name) - .5) * .8,
    };
  }), [repositories]);
  const safeKeyboardIndex = Math.min(keyboardIndex, Math.max(0, repositories.length - 1));
  const keyboardRepo = repositories[safeKeyboardIndex];
  const handleSystemKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (selected || !repositories.length) return;
    const last = repositories.length - 1;
    if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End", "Enter", " "].includes(event.key)) event.preventDefault();
    if (event.key === "ArrowRight" || event.key === "ArrowDown") setKeyboardIndex(safeKeyboardIndex >= last ? 0 : safeKeyboardIndex + 1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") setKeyboardIndex(safeKeyboardIndex <= 0 ? last : safeKeyboardIndex - 1);
    else if (event.key === "Home") setKeyboardIndex(0);
    else if (event.key === "End") setKeyboardIndex(last);
    else if ((event.key === "Enter" || event.key === " ") && keyboardRepo) onRepo(keyboardRepo);
  };
  return <><Canvas className="repository-system" dpr={[1,1.75]}
    camera={{ position: [0,25,34], fov: 43, near: .1, far: 300 }} tabIndex={0}
    aria-label={selected ? `${selected.full_name} repository orbit` : `Repository planetary system. ${keyboardRepo ? `${keyboardRepo.full_name} selected. ` : ""}Use arrow keys to choose a repository and Enter to open it.`}
    onKeyDown={handleSystemKey}
    fallback={<p className="canvas-fallback">3D needs WebGL. You can still explore every repository and commit from the lists.</p>}>
    <color attach="background" args={["#07090f"]} />
    <Stars radius={90} depth={35} count={2300} factor={3} fade speed={motion ? .15 : 0} />
    {/* autoRotate orbits the camera around the system; three.js pauses it while the user is dragging
        and resumes afterwards. The "Pause rotation" button and reduced-motion both drive `motion`. */}
    <CameraRig selected={Boolean(selected)} motion={motion} />
    {selected ? <>
      <World repo={selected} radius={2.15} active animate={motion} />
      <Orbit radius={5.4} opacity={.2} />
      {commits.map((commit, i) => <Satellite key={commit.sha} commit={commit} index={i} total={commits.length}
        active={i === commitIndex} onSelect={() => onCommit(i)} />)}
    </> : <>
      <Sun animate={motion} />
      <Html center position={[0,3.3,0]} zIndexRange={[12,10]}><span className="sun-label">{centerLabel}</span></Html>
      <group scale={[1.3,1,.9]}><Orbit radius={INNER_RADIUS} opacity={.26} /><Orbit radius={INNER_RADIUS + RING_GAP} opacity={.26} /></group>
      {placements.map(({ repo, angle, radius, y }, index) => (
        <OrbitingRepo key={repo.id} repo={repo} angle={angle} radius={radius} y={y}
          motion={motion} onOpen={() => onRepo(repo)} onFocus={() => setKeyboardIndex(index)}
          keyboardActive={index === safeKeyboardIndex} registry={registry} />
      ))}
      <OrbitMotion motion={motion} registry={registry} />
      <LabelLayout registry={registry} />
    </>}
  </Canvas>{debugLayout && <output data-scene-measurement hidden />}</>;
}
