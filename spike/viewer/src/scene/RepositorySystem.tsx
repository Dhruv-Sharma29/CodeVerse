import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { World, Sun } from "./World";
import { planetStyle, seedFor, starEncoding } from "../github/planetStyle";
import type { Repository, GitCommit, Contributor } from "../github/api";
import { layoutLabels, type LabelItem, type Rect } from "./labelLayout";
import { ORBIT_X_SCALE, ORBIT_Z_SCALE, orbitalAngularSpeed, repositoryOrbit, stepOrbitPhysics } from "./orbitalPhysics";
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
const compactStars = (value: number) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);

function Orbit({ radius, opacity = .1 }: { radius: number; opacity?: number }) {
  return <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
    <ringGeometry args={[radius, radius + .018, 160]} />
    <meshBasicMaterial color="#9a9eb8" transparent opacity={opacity} side={THREE.DoubleSide} depthWrite={false} />
  </mesh>;
}

function TechnologyNebula({ color, seed, radius }: { color: string; seed: number; radius: number }) {
  const positions = useMemo(() => {
    const values = new Float32Array(42 * 3);
    for (let index = 0; index < 42; index++) {
      const phase = seed * 91 + index * 2.39996;
      const spread = radius * (.72 + ((index * 37) % 17) / 28);
      values[index * 3] = Math.cos(phase) * spread;
      values[index * 3 + 1] = Math.sin(phase * 1.71) * radius * .32;
      values[index * 3 + 2] = Math.sin(phase) * spread;
    }
    return values;
  }, [radius, seed]);
  return <points raycast={() => null}>
    <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
    <pointsMaterial color={color} size={.13} transparent opacity={.13} depthWrite={false}
      blending={THREE.AdditiveBlending} sizeAttenuation />
  </points>;
}

function StarSparks({ stars, radius, seed }: { stars: number; radius: number; seed: number }) {
  const encoding = starEncoding(stars);
  return <group raycast={() => null}>{Array.from({ length: encoding.sparks }, (_, index) => {
    const angle = index / Math.max(encoding.sparks, 1) * Math.PI * 2 + seed * Math.PI;
    const distance = radius * (1.25 + (index % 2) * .18);
    return <mesh key={index} position={[Math.cos(angle) * distance, (index % 3 - 1) * radius * .28, Math.sin(angle) * distance]} rotation={[0, angle, Math.PI / 4]}>
      <octahedronGeometry args={[.055 + encoding.intensity * .045, 0]} />
      <meshBasicMaterial color="#ffd879" transparent opacity={.58 + encoding.intensity * .38} />
    </mesh>;
  })}</group>;
}

function CommitComet({ commit, angle, radius, active, onSelect, probe }: {
  commit: GitCommit; angle: number; radius: number; active: boolean; onSelect: () => void;
  probe?: React.RefObject<THREE.Group | null>;
}) {
  return <group ref={probe} position={[Math.cos(angle) * radius, 0, Math.sin(angle) * radius]}>
    <mesh onClick={e => { e.stopPropagation(); onSelect(); }}>
      <sphereGeometry args={[active ? .19 : .095, 12, 12]} />
      <meshBasicMaterial color={active ? "#fff1bd" : "#8edcf2"} />
    </mesh>
    <mesh position={[Math.sin(angle) * .3, 0, -Math.cos(angle) * .3]} rotation={[0, -angle, Math.PI / 2]} raycast={() => null}>
      <coneGeometry args={[active ? .12 : .07, active ? .85 : .58, 7]} />
      <meshBasicMaterial color={active ? "#eabf72" : "#579fc2"} transparent opacity={active ? .42 : .24} depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
    {active && <>
      <Html center position={[0,.65,0]} zIndexRange={[8,0]}><span className="commit-beacon">{commit.sha.slice(0,7)}</span></Html>
    </>}
  </group>;
}

function CometOrbit({ commits, band, activeIndex, motion, onCommit, probe }: {
  commits: { commit: GitCommit; index: number }[]; band: number; activeIndex: number; motion: boolean;
  onCommit: (index: number) => void; probe: React.RefObject<THREE.Group | null>;
}) {
  const group = useRef<THREE.Group>(null);
  const radius = 3.85 + band * .55;
  const direction = band % 2 ? -1 : 1;
  useFrame((_, delta) => {
    if (motion && group.current) group.current.rotation.y += delta * direction * (.43 - band * .055);
  });
  return <group ref={group} rotation={[.12 + band * .12, band * .7, band % 2 ? -.18 : .12]}>
    <Orbit radius={radius} opacity={.12 + band * .025} />
    {commits.map(({ commit, index }, position) => <CommitComet key={commit.sha} commit={commit}
      angle={position / Math.max(commits.length, 1) * Math.PI * 2 + band * .45} radius={radius}
      active={index === activeIndex} onSelect={() => onCommit(index)} probe={band === 0 && position === 0 ? probe : undefined} />)}
  </group>;
}

function DefaultBranchMoon({ branch, motion }: { branch: string; motion: boolean }) {
  const orbit = useRef<THREE.Group>(null);
  useFrame((_, delta) => { if (motion && orbit.current) orbit.current.rotation.y += delta * .31; });
  return <group ref={orbit} rotation={[.18, .3, -.12]}>
    <Orbit radius={2.95} opacity={.24} />
    <group position={[2.95, 0, 0]}>
      <mesh><sphereGeometry args={[.31, 18, 14]} /><meshStandardMaterial color="#a7a7b1" roughness={.92} /></mesh>
      <mesh position={[-.07,.08,.27]}><sphereGeometry args={[.075,10,8]} /><meshBasicMaterial color="#696b78" /></mesh>
      <Html center position={[0,.65,0]} zIndexRange={[7,0]}><span className="moon-label">{branch || "default branch"}</span></Html>
    </group>
  </group>;
}

function ContributorSatellite({ contributor, angle, radius, onOpen }: {
  contributor: Contributor; angle: number; radius: number; onOpen: () => void;
}) {
  const scale = 1 + Math.min(.32, Math.log10(contributor.contributions + 1) * .09);
  return <group position={[Math.cos(angle) * radius, Math.sin(angle * 2) * .28, Math.sin(angle) * radius]} rotation={[0,-angle,0]} scale={scale}>
    <mesh onClick={e => { e.stopPropagation(); onOpen(); }}>
      <boxGeometry args={[.28,.2,.34]} /><meshStandardMaterial color="#d1d5dd" metalness={.72} roughness={.32} />
    </mesh>
    <mesh position={[-.35,0,0]}><boxGeometry args={[.34,.025,.2]} /><meshBasicMaterial color="#326c9a" /></mesh>
    <mesh position={[.35,0,0]}><boxGeometry args={[.34,.025,.2]} /><meshBasicMaterial color="#326c9a" /></mesh>
    <mesh position={[0,.16,0]}><sphereGeometry args={[.055,8,8]} /><meshBasicMaterial color="#f5ba67" /></mesh>
  </group>;
}

function ContributorSatellites({ contributors, motion, onContributor }: {
  contributors: Contributor[]; motion: boolean; onContributor: (contributor: Contributor) => void;
}) {
  const orbit = useRef<THREE.Group>(null);
  const radius = 5.75;
  useFrame((_, delta) => { if (motion && orbit.current) orbit.current.rotation.y -= delta * .18; });
  return <group ref={orbit} rotation={[-.13,.5,.16]}>
    <Orbit radius={radius} opacity={.16} />
    {contributors.map((contributor, index) => <ContributorSatellite key={contributor.id} contributor={contributor}
      angle={index / contributors.length * Math.PI * 2} radius={radius} onOpen={() => onContributor(contributor)} />)}
  </group>;
}

function RepositoryObjects({ repo, commits, contributors, activeIndex, motion, onCommit, onContributor, debug }: {
  repo: Repository; commits: GitCommit[]; contributors: Contributor[]; activeIndex: number; motion: boolean;
  onCommit: (index: number) => void; onContributor: (contributor: Contributor) => void; debug: boolean;
}) {
  const probe = useRef<THREE.Group>(null);
  const bands = [0, 1, 2].map(band => commits.map((commit, index) => ({ commit, index })).filter(({ index }) => index % 3 === band));
  const lastWrite = useRef(0);
  const point = useRef(new THREE.Vector3());
  useFrame((state) => {
    if (!debug || !probe.current || state.clock.elapsedTime - lastWrite.current < .25) return;
    lastWrite.current = state.clock.elapsedTime;
    probe.current.getWorldPosition(point.current);
    const output = document.querySelector<HTMLOutputElement>("output[data-scene-measurement]");
    if (output) output.textContent = JSON.stringify({ cometCount: commits.length, satelliteCount: contributors.length, firstComet: point.current.toArray().map(value => Number(value.toFixed(4))) });
  });
  const style = planetStyle(repo);
  const visualRadius = 2.15 * (repo.archived ? .58 : 1);
  return <>
    <TechnologyNebula color={style.glow} seed={style.seed} radius={visualRadius * 2.1} />
    <StarSparks stars={repo.stargazers_count} radius={visualRadius} seed={style.seed} />
    <DefaultBranchMoon branch={repo.default_branch} motion={motion} />
    {bands.map((bandCommits, band) => bandCommits.length > 0 && <CometOrbit key={band} commits={bandCommits}
      band={band} activeIndex={activeIndex} motion={motion} onCommit={onCommit} probe={probe} />)}
    {contributors.length > 0 && <ContributorSatellites contributors={contributors} motion={motion} onContributor={onContributor} />}
  </>;
}

// Orbital motion. The innermost ring completes a revolution in INNER_PERIOD seconds and
// outer rings take proportionally longer (angular speed ∝ 1/radius), so the system spreads
// out over time the way a real one does instead of turning as a rigid disc. Elapsed time is
// accumulated here rather than read from the clock, so pausing holds position instead of
// resetting it. Ellipse factors (1.3 / .9) match the drawn Orbit rings.
const orbitPosition = (angle: number, radius: number, y: number) =>
  [Math.cos(angle) * radius * ORBIT_X_SCALE, y, Math.sin(angle) * radius * ORBIT_Z_SCALE] as [number, number, number];

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
    <TechnologyNebula color={style.glow} seed={style.seed} radius={style.radius * 2.15} />
    <StarSparks stars={repo.stargazers_count} radius={style.radius} seed={style.seed} />
    <World repo={repo} radius={style.radius} onClick={onOpen} animate={motion} />
    <Html center position={[0, 0, 0]} zIndexRange={[8, 0]}>
      <button ref={label} title={`${repo.full_name} · ${style.activity.label}`} aria-label={`Open ${repo.full_name}. ${repo.archived ? "Archived repository. " : ""}${style.activity.label}.`}
        className={`planet-label ${keyboardActive ? "is-keyboard-active" : ""} ${repo.archived ? "is-archived" : ""}`}
        onClick={onOpen} onFocus={onFocus}>
        <span className="planet-label-dot" style={{ background: style.glow }} />{repo.name} <span className="planet-stars">★ {compactStars(repo.stargazers_count)}</span>
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

/** Owns orbital motion and collision response for the whole system. State stays with this
 * mounted scene, so hot reload cannot strand registrations in module-level maps. */
function OrbitMotion({ motion, registry }: { motion: boolean; registry: PlanetRegistry }) {
  const elapsed = useRef(0);
  const physics = useRef(new Map<string, { x: number; z: number; vx: number; vz: number }>());
  useFrame((_, delta) => {
    if (!motion) return;
    elapsed.current += Math.min(delta, .05);
    const entries = [...registry.entries()];
    const activeIds = new Set(entries.map(([id]) => id));
    for (const id of physics.current.keys()) if (!activeIds.has(id)) physics.current.delete(id);
    const bodies = entries.map(([id, entry]) => {
      const angle = entry.baseAngle + elapsed.current * orbitalAngularSpeed(entry.radius);
      const [targetX,,targetZ] = orbitPosition(angle, entry.radius, entry.height);
      const previous = physics.current.get(id) ?? { x: targetX, z: targetZ, vx: 0, vz: 0 };
      return { id, ...previous, targetX, targetZ, radius: entry.worldRadius };
    });
    for (const body of stepOrbitPhysics(bodies, delta)) {
      physics.current.set(body.id, { x: body.x, z: body.z, vx: body.vx, vz: body.vz });
      const entry = registry.get(body.id);
      entry?.group.current?.position.set(body.x, entry.height, body.z);
    }
  });
  return null;
}

const isDebugLayout = () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "layout";

/** Places every registered label once per frame so labels avoid each other, the planets and
 *  the sun label. Runs after the planets' own useFrame callbacks (mounted later in the tree),
 *  so it reads this frame's positions. */
function LabelLayout({ registry, debug }: { registry: PlanetRegistry; debug: boolean }) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const anchors = useRef(new Map<string, number>());
  const point = useRef(new THREE.Vector3());
  const edge = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const metrics = useRef<{
    start: number; frames: number[]; lastSample: number; samples: number;
    labelOverlap: number; sunCovered: number; offscreen: number; hidden: number;
    minimumPlanetClearance: number; done: boolean;
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
      if (rect.width) fixed.push({ x: rect.x - bounds.x - 12, y: rect.y - bounds.y - 12, width: rect.width + 24, height: rect.height + 24 });
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

    if (!debug) return;

    if (!metrics.current) {
      metrics.current = { start: performance.now(), frames: [], lastSample: 0, samples: 0, labelOverlap: 0, sunCovered: 0, offscreen: 0, hidden: 0, minimumPlanetClearance: Infinity, done: false };
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
      const planets = [...registry.values()].flatMap(entry => {
        if (!entry.group.current) return [];
        const position = new THREE.Vector3();
        entry.group.current.getWorldPosition(position);
        return [{ position, radius: entry.worldRadius }];
      });
      for (let i = 0; i < planets.length; i++) for (let j = i + 1; j < planets.length; j++) {
        measurement.minimumPlanetClearance = Math.min(measurement.minimumPlanetClearance,
          planets[i].position.distanceTo(planets[j].position) - planets[i].radius - planets[j].radius);
      }

      const diagnosticOutput = document.querySelector<HTMLOutputElement>("output[data-scene-measurement]");
      if (diagnosticOutput) {
        const sorted = [...measurement.frames].sort((a, b) => a - b);
        diagnosticOutput.textContent = JSON.stringify({
          durationSeconds: elapsed / 1000, frames: measurement.frames.length, samples: measurement.samples,
          labelOverlapSamples: measurement.labelOverlap, sunCoveredSamples: measurement.sunCovered,
          offscreenSamples: measurement.offscreen, hiddenLabelSamples: measurement.hidden,
          minimumPlanetClearance: Number(measurement.minimumPlanetClearance.toFixed(4)),
          meanFrameMs: measurement.frames.reduce((sum, value) => sum + value, 0) / measurement.frames.length,
          p95FrameMs: sorted[Math.floor(sorted.length * .95)], maxFrameMs: sorted.at(-1),
        });
      }
    }
    if (elapsed >= 110_500) {
      measurement.done = true;
    }
  });
  return null;
}

export function RepositorySystem({ repositories, selected, commits, contributors, commitIndex, onRepo, onCommit, onContributor, centerLabel, motion }: {
  repositories: Repository[]; selected: Repository | null; commits: GitCommit[]; contributors: Contributor[]; commitIndex: number;
  onRepo: (repo: Repository) => void; onCommit: (index: number) => void; onContributor: (contributor: Contributor) => void;
  centerLabel: string; motion: boolean;
}) {
  // One registry per mounted system; see PlanetRegistry above for why it is not module state.
  const [registry] = useState<PlanetRegistry>(() => new Map());
  const [debugLayout] = useState(() => isDebugLayout());
  const [keyboardIndex, setKeyboardIndex] = useState(0);
  const placements = useMemo(() => repositories.map((repo, i) => ({ repo, ...repositoryOrbit(i, seedFor(repo.name)) })), [repositories]);
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
    <ambientLight intensity={.75} />
    <directionalLight position={[8,12,10]} intensity={1.1} color="#f2dfbf" />
    {/* autoRotate orbits the camera around the system; three.js pauses it while the user is dragging
        and resumes afterwards. The "Pause rotation" button and reduced-motion both drive `motion`. */}
    <CameraRig selected={Boolean(selected)} motion={motion} />
    {selected ? <>
      <World repo={selected} radius={2.15} active animate={motion} />
      <RepositoryObjects repo={selected} commits={commits} contributors={contributors} activeIndex={commitIndex}
        motion={motion} onCommit={onCommit} onContributor={onContributor} debug={debugLayout} />
    </> : <>
      <Sun animate={motion} />
      <Html center position={[0,3.3,0]} zIndexRange={[12,10]}><span className="sun-label">{centerLabel}</span></Html>
      <group scale={[ORBIT_X_SCALE,1,ORBIT_Z_SCALE]}>{placements.map(({ repo, radius }, index) =>
        <Orbit key={repo.id} radius={radius} opacity={Math.max(.08, .24 - index * .018)} />)}</group>
      {placements.map(({ repo, angle, radius, y }, index) => (
        <OrbitingRepo key={repo.id} repo={repo} angle={angle} radius={radius} y={y}
          motion={motion} onOpen={() => onRepo(repo)} onFocus={() => setKeyboardIndex(index)}
          keyboardActive={index === safeKeyboardIndex} registry={registry} />
      ))}
      <OrbitMotion motion={motion} registry={registry} />
      <LabelLayout registry={registry} debug={debugLayout} />
    </>}
  </Canvas>{debugLayout && <output data-scene-measurement hidden />}</>;
}
