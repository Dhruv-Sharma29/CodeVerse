import { memo, useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, Stars } from "@react-three/drei";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Sun, World } from "../scene/World";
import { seedFor } from "../github/planetStyle";
import { PORTAL_R, SUN_R, novaRadius, type HullId, type Input, type Planet, type Sim } from "./sim";
import { HOLD, STORM } from "./events";
import { QUALITY, type Palette } from "./settings";

/** Mutable bridge between the React shell and the render loop (never triggers React renders). */
export interface Control {
  sim: Sim; input: Input; zoom: number; warp: number; color: string; reduceMotion: boolean;
  /** Lobby backdrop: ship hidden, camera circles the sun. */
  attract?: boolean;
  /** Hyperjumping out of this universe: the sim is frozen while the ship rides the tunnel. */
  jumping?: boolean;
  /** Docked at this planet: the ship is parked on its surface, shielded, weapons off. */
  docked?: Planet | null;
  pointer: { x: number; y: number; mouse: boolean };
  onStep: (dt: number) => void;
}
export interface Peer { id: number; name: string; color: string; hull: HullId }

const TAU = Math.PI * 2;
const tmp = new THREE.Object3D(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3(), chase = new THREE.Vector3(), aim = new THREE.Vector3();
let glowTexture: THREE.Texture | null = null;
function glow() {
  if (glowTexture) return glowTexture;
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d")!, gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(.22, "rgba(255,255,255,.5)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return glowTexture = new THREE.CanvasTexture(c);
}
const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false } as const;

/** A faceted five-point star, centred, facing +Z. Shared by commit satellites and star-shield pickups. */
let starGeo: THREE.ExtrudeGeometry | null = null;
function starGeometry() {
  if (starGeo) return starGeo;
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? .42 : 1, a = Math.PI / 2 + i * Math.PI / 5;
    if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r); else s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  starGeo = new THREE.ExtrudeGeometry(s, { depth: .12, bevelEnabled: true, bevelThickness: .18, bevelSize: .08, bevelSegments: 1, steps: 1 });
  return starGeo.center();
}
/** Soft additive glow points; brightness per point (vertex colour) makes them twinkle. */
function makeHalo(max: number, size: number) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(max * 3), 3));
  g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(max * 3), 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ map: glow(), size, vertexColors: true, ...additive }));
  pts.frustumCulled = false;
  return pts;
}
function setHalo(h: THREE.Points, i: number, x: number, y: number, z: number, c: THREE.Color, b: number) {
  const g = h.geometry; (g.attributes.position as THREE.BufferAttribute).setXYZ(i, x, y, z);
  (g.attributes.color as THREE.BufferAttribute).setXYZ(i, c.r * b, c.g * b, c.b * b);
}
function commitHalo(h: THREE.Points, n: number) {
  const g = h.geometry; g.setDrawRange(0, n);
  g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
}
/** Face the camera, then spin in the screen plane. */
function billboard(q: THREE.Quaternion, spin: number) { tmp.quaternion.copy(q); tmp.rotateZ(spin); }
const GOLD = new THREE.Color("#ffb83d"), SHIELD = new THREE.Color("#fff0b8");

function Driver({ ctl }: { ctl: Control }) {
  useFrame((_, dt) => ctl.onStep(Math.min(dt, .05)), -1);
  return null;
}

function CameraRig({ ctl }: { ctl: Control }) {
  const { camera, size, raycaster } = useThree();
  const look = useRef(new THREE.Vector3(ctl.sim.ship.x, 0, ctl.sim.ship.z));
  useFrame(({ clock }, dt) => {
    const { sim, pointer, input } = ctl, s = sim.ship;
    const portrait = Math.max(1, size.height / size.width * .85);
    if (ctl.attract) {
      // Lobby: slow circle around the sun, looking slightly past it so the title sits over the sky.
      const t = ctl.reduceMotion ? 0.6 : clock.elapsedTime * .035, r = 250 * portrait;
      look.current.lerp(hit.set(0, 0, 0), Math.min(1, dt * 2));
      camera.position.set(Math.sin(t) * r, 90 * portrait, Math.cos(t) * r);
      camera.lookAt(look.current.x, -18, look.current.z);
      return;
    }
    const lead = s.dead > 0 ? 0 : 6, killer = s.dead > 0 && sim.killedBy != null ? sim.remotes.get(sim.killedBy) : undefined;
    // Follow-cam: while waiting to respawn, watch the pilot who shot you down.
    if (killer) look.current.lerp(hit.set(killer.x, 0, killer.z), Math.min(1, dt * 3));
    else look.current.lerp(hit.set(s.x + Math.cos(s.a) * lead + s.vx * .12, 0, s.z + Math.sin(s.a) * lead + s.vz * .12), Math.min(1, dt * 5));
    const d = ctl.zoom * portrait, w = ctl.warp, ax = Math.cos(s.a), az = Math.sin(s.a);
    // Hyperjump: the camera drops in behind the ship and looks down the tunnel (blend by warp).
    hit.set(look.current.x, 64 * d, look.current.z + 46 * d).lerp(chase.set(s.x - ax * 17, 6, s.z - az * 17), w);
    // Lerp (not set) so leaving the lobby swoops down to the ship instead of cutting.
    camera.position.lerp(hit, Math.min(1, dt * (4 + w * 4)));
    if (sim.shake > 0 && !ctl.reduceMotion) camera.position.add(hit.set((Math.random() - .5) * 2.6, (Math.random() - .5) * 1.4, (Math.random() - .5) * 2.6).multiplyScalar(sim.shake));
    if (w > .02 && !ctl.reduceMotion) camera.position.add(hit.set(0, (Math.random() - .5) * .35 * w, 0)); // tunnel rumble
    camera.lookAt(aim.copy(look.current).lerp(chase.set(s.x + ax * 30, 1, s.z + az * 30), w));
    const cam = camera as THREE.PerspectiveCamera, fov = 50 + w * 38;
    if (Math.abs(cam.fov - fov) > .01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    // Mouse aim: project the pointer onto the play plane.
    if (pointer.mouse) {
      raycaster.setFromCamera(new THREE.Vector2(pointer.x / size.width * 2 - 1, -(pointer.y / size.height) * 2 + 1), camera);
      input.aim = raycaster.ray.intersectPlane(plane, hit) ? { x: hit.x, z: hit.z } : null;
    }
  });
  return null;
}

/** Hyperjump tunnel: light streaks rushing past the ship inside a violet tube, faded in and out by `warp`. */
const STREAKS = 260;
function HyperTunnel({ ctl }: { ctl: Control }) {
  const group = useRef<THREE.Group>(null), lines = useRef<THREE.InstancedMesh>(null), tube = useRef<THREE.MeshBasicMaterial>(null);
  const streaks = useMemo(() => Array.from({ length: STREAKS }, (_, i) => {
    const r = (k: number) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
    return { th: r(1) * TAU, rad: 4 + r(2) * 11, x: r(3) * 200 - 50, len: 3 + r(4) * 9 };
  }), []);
  useFrame((_, dt) => {
    const g = group.current, m = lines.current, w = ctl.warp, s = ctl.sim.ship; if (!g || !m) return;
    g.visible = w > .01; if (!g.visible) return;
    g.position.set(s.x, 1, s.z); g.rotation.y = -s.a;
    const speed = ctl.reduceMotion ? 40 : 320 * w;
    streaks.forEach((k, i) => {
      k.x -= speed * dt; if (k.x < -50) k.x += 200;
      tmp.position.set(k.x, Math.sin(k.th) * k.rad, Math.cos(k.th) * k.rad); tmp.rotation.set(0, 0, 0);
      tmp.scale.set(k.len * (.4 + w * 2.2), 1, 1); tmp.updateMatrix(); m.setMatrixAt(i, tmp.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    (m.material as THREE.MeshBasicMaterial).opacity = Math.min(1, w * 1.5);
    if (tube.current) tube.current.opacity = w * .8;
  });
  return <group ref={group} visible={false}>
    <instancedMesh ref={lines} args={[undefined, undefined, STREAKS]} frustumCulled={false}>
      <boxGeometry args={[1, .09, .09]} /><meshBasicMaterial color="#b9e6ff" {...additive} opacity={0} />
    </instancedMesh>
    <mesh rotation={[0, 0, Math.PI / 2]} position={[50, 0, 0]}>
      <cylinderGeometry args={[17, 17, 220, 40, 1, true]} /><meshBasicMaterial ref={tube} color="#1c1450" transparent opacity={0} depthWrite={false} side={THREE.BackSide} />
    </mesh>
  </group>;
}

function Nebula({ seed }: { seed: number }) {
  const clouds = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const r = seedFor(`${seed}:${i}`), a = r * TAU, d = 180 + r * 420;
    const hue = (seed * 360 + i * 47 + r * 60) % 360;
    return { pos: [Math.cos(a) * d, -140 - r * 80, Math.sin(a) * d] as THREE.Vector3Tuple, size: 380 + r * 420, color: new THREE.Color(`hsl(${hue}, 70%, ${18 + r * 14}%)`) };
  }), [seed]);
  return <group>{clouds.map((c, i) => <sprite key={i} position={c.pos} scale={[c.size, c.size, 1]}>
    <spriteMaterial map={glow()} color={c.color} opacity={.55} {...additive} />
  </sprite>)}</group>;
}

function OrbitLines({ sim }: { sim: Sim }) {
  const lines = useMemo(() => [...sim.planets.map(p => ({ r: p.orbit, c: "#7a8ce0", o: .14 })), { r: sim.edge, c: "#ff6f7f", o: .22 }].map(({ r, c, o }) => {
    const pts = Array.from({ length: 200 }, (_, i) => new THREE.Vector3(Math.cos(i / 200 * TAU) * r, 0, Math.sin(i / 200 * TAU) * r));
    return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: o }));
  }), [sim]);
  return <group>{lines.map((l, i) => <primitive key={i} object={l} />)}</group>;
}

function AsteroidBelt({ sim, count }: { sim: Sim; count: number }) {
  const ref = useRef<THREE.InstancedMesh>(null), group = useRef<THREE.Group>(null);
  const radius = sim.planets.length > 4 ? (sim.planets[2].orbit + sim.planets[3].orbit) / 2 : sim.edge - 14;
  // Place rocks once per universe. (This used to run in an inline ref callback, which re-ran on
  // every re-render and re-scattered the whole belt: the flicker.) Seeded so all pilots match.
  useLayoutEffect(() => {
    const mesh = ref.current; if (!mesh) return;
    let h = Math.floor(seedFor(sim.universe.room + ":belt") * 4294967296);
    const rnd = () => { h = (h + 0x6d2b79f5) | 0; let t = Math.imul(h ^ (h >>> 15), 1 | h); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    for (let i = 0; i < count; i++) {
      const a = rnd() * TAU, r = radius + (rnd() - .5) * 7;
      tmp.position.set(Math.cos(a) * r, (rnd() - .5) * 3, Math.sin(a) * r);
      tmp.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6);
      tmp.scale.setScalar(.15 + rnd() ** 3 * 1.1); tmp.updateMatrix(); mesh.setMatrixAt(i, tmp.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [sim, radius, count]);
  useFrame((_, dt) => { if (group.current) group.current.rotation.y += dt * .02; });
  return <group ref={group}><instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}>
    <dodecahedronGeometry args={[1, 0]} /><meshStandardMaterial color="#8a7d70" roughness={1} flatShading />
  </instancedMesh></group>;
}

function Planets({ sim }: { sim: Sim }) {
  const groups = useRef<(THREE.Group | null)[]>([]), rings = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(() => {
    sim.planets.forEach((p, i) => {
      const g = groups.current[i]; if (!g) return;
      g.position.set(p.x, 0, p.z);
      const ring = rings.current[i];
      if (ring) { ring.visible = p.mode !== "orbit"; ring.rotation.z = sim.t * 2; ring.scale.setScalar(1 + Math.sin(sim.t * 8) * .05); }
    });
  });
  return <>{sim.planets.map((p, i) => <group key={p.repo.id + ":" + i} ref={el => { groups.current[i] = el; }}>
    <World repo={p.repo} radius={p.R} sunAtOrigin />
    <mesh ref={el => { rings.current[i] = el; }} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <ringGeometry args={[p.R * 1.25, p.R * 1.4, 6]} /><meshBasicMaterial color="#74e2ff" {...additive} opacity={.8} side={THREE.DoubleSide} />
    </mesh>
    <Html center position={[0, p.R + 2.2, 0]} zIndexRange={[5, 0]} pointerEvents="none"><span className="orbit-label">{p.repo.name}</span></Html>
  </group>)}</>;
}

function Satellites({ sim }: { sim: Sim }) {
  const ref = useRef<THREE.InstancedMesh>(null), halo = useMemo(() => makeHalo(400, 7.5), []);
  useFrame(({ camera }) => {
    const m = ref.current; if (!m) return;
    let n = 0;
    for (const p of sim.planets) for (const s of p.sats) {
      if (s.done || n >= 400) continue;
      const x = p.x + Math.cos(s.a) * s.r, y = Math.sin(s.a * 2) * .8 + .6, z = p.z + Math.sin(s.a) * s.r;
      tmp.position.set(x, y, z); billboard(camera.quaternion, s.a * 5 + sim.t * .8);
      tmp.scale.setScalar(.85 + Math.sin(sim.t * 3 + s.a * 7) * .08); tmp.updateMatrix(); m.setMatrixAt(n, tmp.matrix);
      setHalo(halo, n++, x, y, z, GOLD, .7 + .3 * Math.sin(sim.t * 4.3 + s.a * 11));
    }
    m.count = n; m.instanceMatrix.needsUpdate = true; commitHalo(halo, n);
  });
  return <>
    <instancedMesh ref={ref} args={[starGeometry(), undefined, 400]} frustumCulled={false}>
      <meshStandardMaterial color="#ffd04f" emissive="#ff9d1a" emissiveIntensity={1.7} metalness={.3} roughness={.3} flatShading toneMapped={false} />
    </instancedMesh>
    <primitive object={halo} />
  </>;
}

function Portal({ ctl }: { ctl: Control }) {
  const sim = ctl.sim;
  const swirl = useRef<THREE.ShaderMaterial>(null), ring = useRef<THREE.Group>(null), root = useRef<THREE.Group>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  useFrame((_, dt) => {
    // Hidden during a hyperjump: the ship starts inside the gate, which would wrap around it in the tunnel.
    if (root.current) { root.current.position.set(sim.portal.x, 0, sim.portal.z); root.current.visible = ctl.warp < .02; }
    uniforms.uTime.value += dt;
    if (ring.current) ring.current.rotation.z += dt * .6;
    if (swirl.current) swirl.current.opacity = sim.portalCool > 0 && sim.portalCool < 9 ? .4 : 1;
  });
  return <group ref={root}>
    {/* Dedicated gate: light pillar visible from far away + docking ring on the plane. */}
    <mesh position={[0, 40, 0]}><cylinderGeometry args={[.9, 2.4, 80, 24, 1, true]} /><meshBasicMaterial color="#9b6dff" {...additive} opacity={.22} side={THREE.DoubleSide} /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .08, 0]}><ringGeometry args={[HOLD.r - .5, HOLD.r, 96]} /><meshBasicMaterial color="#ffcf6e" {...additive} opacity={.28} side={THREE.DoubleSide} /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .1, 0]}><ringGeometry args={[PORTAL_R + 4, PORTAL_R + 4.8, 64]} /><meshBasicMaterial color="#b18cff" {...additive} opacity={.55} side={THREE.DoubleSide} /></mesh>
    <group position={[0, 2.2, 0]} rotation={[-1.05, 0, 0]}>
    <group ref={ring}>
      <mesh><torusGeometry args={[PORTAL_R, .42, 20, 96]} /><meshStandardMaterial color="#b18cff" emissive="#8f5cff" emissiveIntensity={2.2} toneMapped={false} /></mesh>
      {Array.from({ length: 8 }, (_, i) => <mesh key={i} position={[Math.cos(i / 8 * TAU) * PORTAL_R, Math.sin(i / 8 * TAU) * PORTAL_R, 0]}>
        <boxGeometry args={[.5, .5, 1.1]} /><meshStandardMaterial color="#e8dcff" emissive="#74e2ff" emissiveIntensity={1.5} toneMapped={false} />
      </mesh>)}
    </group>
    <mesh>
      <circleGeometry args={[PORTAL_R - .2, 96]} />
      <shaderMaterial ref={swirl} uniforms={uniforms} {...additive} side={THREE.DoubleSide}
        vertexShader={`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`}
        fragmentShader={`varying vec2 vUv; uniform float uTime;
          void main(){ vec2 p=vUv-.5; float r=length(p)*2.0; float a=atan(p.y,p.x);
            float s=sin(a*5.0 + r*14.0 - uTime*5.0)*.5+.5; float s2=sin(a*3.0 - r*9.0 + uTime*3.0)*.5+.5;
            vec3 c=mix(vec3(.45,.2,1.0), vec3(.3,.9,1.0), s*s2); float core=smoothstep(.45,0.0,r);
            gl_FragColor=vec4(c*(.5+s*.8)+core*vec3(1.0,.95,1.0), (1.0-smoothstep(.85,1.0,r))*(.55+s*.45)); }`} />
    </mesh>
    <sprite scale={[22, 22, 1]}><spriteMaterial map={glow()} color="#7d4dff" opacity={.6} {...additive} /></sprite>
    <Html center position={[0, PORTAL_R + 2, 0]} zIndexRange={[5, 0]} pointerEvents="none"><span className="orbit-label portal">Hyperjump gate</span></Html>
    </group>
  </group>;
}

/** The creator's comet (links to their GitHub profile): icy core, glowing coma, and a tail streaming behind its motion. */
function Comet({ sim }: { sim: Sim }) {
  const g = useRef<THREE.Group>(null), core = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    const c = sim.comet; if (!g.current) return;
    g.current.position.set(c.x, 1.6, c.z); g.current.rotation.y = -Math.atan2(c.vz, c.vx);
    if (core.current) { core.current.rotation.x += dt * .7; core.current.rotation.z += dt * .4; }
  });
  return <group ref={g}>
    <mesh ref={core}><icosahedronGeometry args={[1.5, 1]} /><meshStandardMaterial color="#e8fbff" emissive="#9fe8ff" emissiveIntensity={2.2} flatShading toneMapped={false} /></mesh>
    <sprite scale={[16, 16, 1]}><spriteMaterial map={glow()} color="#9fe8ff" opacity={.85} {...additive} /></sprite>
    {/* soft tail: overlapping glows that fade and widen behind the direction of travel (-x) */}
    {Array.from({ length: 12 }, (_, i) => { const k = (i + 1) / 12; return <sprite key={i} position={[-k * 30, 0, 0]} scale={[8 + k * 10, 4 + k * 9, 1]}>
      <spriteMaterial map={glow()} color={i < 4 ? "#e8fbff" : "#7fd8ff"} opacity={.42 * (1 - k) + .04} {...additive} />
    </sprite>; })}
    <Html center position={[0, 4.2, 0]} zIndexRange={[5, 0]} pointerEvents="none"><span className="orbit-label comet">@Dhruv-Sharma29</span></Html>
  </group>;
}

const metal = { metalness: .3, roughness: .35 } as const; // no env map here, so high metalness renders near-black
const glass = (c: string) => <meshStandardMaterial color={c} emissive={c} emissiveIntensity={.9} metalness={.2} roughness={.05} />;
const paint = (c: string) => <meshStandardMaterial color={c} emissive={c} emissiveIntensity={.3} metalness={.5} roughness={.35} />;
const Flame = ({ x, z = 0, s = 1 }: { x: number; z?: number; s?: number }) => <group position={[x, 0, z]}>
  <mesh rotation={[0, 0, Math.PI / 2]}><coneGeometry args={[.5 * s, 2.2 * s, 10]} /><meshBasicMaterial color="#ffb547" {...additive} opacity={.9} /></mesh>
  <mesh rotation={[0, 0, Math.PI / 2]} position={[.3, 0, 0]}><coneGeometry args={[.25 * s, 1.2 * s, 8]} /><meshBasicMaterial color="#ffffff" {...additive} opacity={.9} /></mesh>
</group>;

/** Three hulls, nose along +x. Colour paints the wings/armour; the engine glow takes it too. */
function ShipModel({ color, hull, flame }: { color: string; hull: HullId; flame?: React.RefObject<THREE.Group | null> }) {
  if (hull === "wasp") return <group scale={.95}>
    <mesh rotation={[0, 0, -Math.PI / 2]} position={[.4, 0, 0]}><coneGeometry args={[.5, 5.2, 8]} /><meshStandardMaterial color="#eef1ff" {...metal} /></mesh>
    <mesh position={[.9, .3, 0]} scale={[1.4, .4, .4]}><sphereGeometry args={[.6, 14, 10]} />{glass("#7dffb4")}</mesh>
    {[-1, 1].map(side => <group key={side}>
      {/* forward-swept blades */}
      <mesh position={[-.3, 0, side * 1.05]} rotation={[0, side * -.55, 0]}><boxGeometry args={[2.8, .1, .8]} />{paint(color)}</mesh>
      <mesh position={[.75, 0, side * 1.75]}><sphereGeometry args={[.16, 8, 6]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>
      <mesh position={[-1.6, .35, side * .5]} rotation={[side * .5, 0, 0]}><boxGeometry args={[.9, .7, .08]} /><meshStandardMaterial color="#c8cde6" {...metal} /></mesh>
    </group>)}
    <mesh position={[-2.1, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[.45, .55, .7, 12]} /><meshStandardMaterial color="#5b6178" {...metal} /></mesh>
    <group ref={flame}><Flame x={-3.2} s={1.1} /></group>
    <sprite position={[-2.7, 0, 0]} scale={[3, 3, 1]}><spriteMaterial map={glow()} color={color} opacity={.8} {...additive} /></sprite>
  </group>;
  if (hull === "titan") return <group scale={1.1}>
    <mesh><boxGeometry args={[3.6, .9, 2]} /><meshStandardMaterial color="#d7dbea" {...metal} /></mesh>
    <mesh position={[.6, .55, 0]} scale={[1.2, .5, .7]}><sphereGeometry args={[.7, 14, 10]} />{glass("#ffcf6e")}</mesh>
    {/* armour plates and three cannons */}
    {[-1, 1].map(side => <mesh key={side} position={[-.2, 0, side * 1.6]}><boxGeometry args={[3, .5, 1.3]} />{paint(color)}</mesh>)}
    {[-.75, 0, .75].map(z => <mesh key={z} position={[2.3, 0, z]} rotation={[0, 0, -Math.PI / 2]}><cylinderGeometry args={[.16, .2, 1.6, 8]} /><meshStandardMaterial color="#3d4152" {...metal} /></mesh>)}
    {[-1, 1].map(side => <mesh key={side} position={[-2.2, 0, side * .6]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[.42, .5, .9, 12]} /><meshStandardMaterial color="#5b6178" {...metal} /></mesh>)}
    <group ref={flame}><Flame x={-3.1} z={-.6} /><Flame x={-3.1} z={.6} /></group>
    <sprite position={[-2.6, 0, 0]} scale={[4, 4, 1]}><spriteMaterial map={glow()} color={color} opacity={.75} {...additive} /></sprite>
  </group>;
  return <group>
    <mesh rotation={[0, 0, -Math.PI / 2]}><coneGeometry args={[.8, 4, 10]} /><meshStandardMaterial color="#e9ecff" {...metal} /></mesh>
    <mesh position={[.4, .45, 0]} scale={[1.1, .55, .6]}><sphereGeometry args={[.6, 16, 12]} />{glass("#74e2ff")}</mesh>
    {[-1, 1].map(side => <group key={side}>
      <mesh position={[-.7, 0, side * 1.25]} rotation={[0, side * .5, 0]}><boxGeometry args={[2.1, .14, 1.8]} />{paint(color)}</mesh>
      <mesh position={[-1.6, 0, side * 2]}><boxGeometry args={[.9, .5, .16]} /><meshStandardMaterial color="#c8cde6" {...metal} /></mesh>
      <mesh position={[.1, 0, side * .8]} rotation={[0, 0, -Math.PI / 2]}><cylinderGeometry args={[.1, .12, 1.4, 6]} /><meshStandardMaterial color="#3d4152" {...metal} /></mesh>
    </group>)}
    <group ref={flame}><Flame x={-2.7} /></group>
    <sprite position={[-2.2, 0, 0]} scale={[3, 3, 1]}><spriteMaterial map={glow()} color={color} opacity={.8} {...additive} /></sprite>
  </group>;
}

function LocalShip({ ctl, color, hull }: { ctl: Control; color: string; hull: HullId }) {
  const g = useRef<THREE.Group>(null), body = useRef<THREE.Group>(null), flame = useRef<THREE.Group>(null), shield = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const s = ctl.sim.ship; if (!g.current || !body.current) return;
    g.current.visible = !ctl.attract && s.dead <= 0;
    g.current.position.set(s.x, 1.2, s.z); g.current.rotation.y = -s.a;
    const lateral = (-Math.sin(s.a) * s.vx + Math.cos(s.a) * s.vz) / 46;
    body.current.rotation.x += (-lateral * .7 - body.current.rotation.x) * .15;
    if (flame.current) { flame.current.visible = s.thrust > .05; flame.current.scale.set(1, .5 + s.thrust * (.8 + Math.random() * .5), 1); }
    if (shield.current) shield.current.visible = s.inv > .2 && Math.floor(ctl.sim.t * 10) % 2 === 0;
  });
  return <group ref={g}><group ref={body}><ShipModel color={color} hull={hull} flame={flame} /></group>
    <mesh ref={shield}><sphereGeometry args={[3.2, 20, 14]} /><meshBasicMaterial color="#74e2ff" {...additive} opacity={.25} /></mesh>
    <EmoteBubble sim={ctl.sim} />
  </group>;
}

function EmoteBubble({ sim }: { sim: Sim }) {
  const el = useRef<HTMLSpanElement>(null);
  useFrame(() => showEmote(el.current, sim.emote, sim.emoteUntil));
  return <Html center position={[0, 3.6, 0]} zIndexRange={[6, 0]} pointerEvents="none"><span ref={el} className="orbit-emote" style={{ display: "none" }} /></Html>;
}

/** Show an emote bubble while it is fresh; updated per frame without React re-renders. */
function showEmote(el: HTMLElement | null, text: string | undefined, until: number | undefined) {
  if (!el) return;
  const on = !!text && (until ?? 0) > performance.now();
  if (on && el.textContent !== text) el.textContent = text!;
  el.style.display = on ? "" : "none";
}

function RemoteShip({ sim, peer }: { sim: Sim; peer: Peer }) {
  const g = useRef<THREE.Group>(null), bubble = useRef<HTMLSpanElement>(null), tag = useRef<HTMLSpanElement>(null);
  useFrame(() => {
    const r = sim.remotes.get(peer.id); if (!g.current || !r) return;
    g.current.visible = r.hp > 0;
    g.current.position.set(r.x, 1.2, r.z); g.current.rotation.y = -r.a;
    showEmote(bubble.current, r.emote, r.emoteUntil);
    if (tag.current) { const label = sim.bountyId === peer.id ? `${peer.name} · BOUNTY` : peer.name; if (tag.current.textContent !== label) tag.current.textContent = label; }
  });
  return <group ref={g}><ShipModel color={peer.color} hull={peer.hull} />
    <Html center position={[0, 3.4, 0]} zIndexRange={[6, 0]} pointerEvents="none"><div className="orbit-shiplabel">
      <span ref={bubble} className="orbit-emote" style={{ display: "none" }} />
      <span ref={tag} className="orbit-tag rival" style={{ borderColor: peer.color }}>{peer.name}</span>
    </div></Html>
  </group>;
}

/** Floating combat text: damage numbers and points, rising and fading where they happened. */
const FLOAT_POOL = 24;
function Floats({ sim }: { sim: Sim }) {
  const groups = useRef<(THREE.Group | null)[]>([]), labels = useRef<(HTMLSpanElement | null)[]>([]);
  useFrame(() => {
    for (let i = 0; i < FLOAT_POOL; i++) {
      const g = groups.current[i], f = sim.floats[i], el = labels.current[i]; if (!g) continue;
      g.visible = !!f; if (!f || !el) continue;
      g.position.set(f.x, 3 + f.t * 7, f.z);
      if (el.textContent !== f.text) el.textContent = f.text;
      el.style.color = f.color; el.style.opacity = String(Math.max(0, 1 - f.t / .9));
    }
  });
  return <>{Array.from({ length: FLOAT_POOL }, (_, i) => <group key={i} ref={el => { groups.current[i] = el; }} visible={false}>
    <Html center zIndexRange={[6, 0]} pointerEvents="none"><span ref={el => { labels.current[i] = el; }} className="orbit-float" /></Html>
  </group>)}</>;
}

/** Real-data extras around planets: issue asteroids, star-shield pickups and an activity glow. */
const ROCK_POOL = 220, STAR_POOL = 24, GLOW_POOL = 24;
function PlanetExtras({ sim }: { sim: Sim }) {
  const rocks = useRef<THREE.InstancedMesh>(null), stars = useRef<THREE.InstancedMesh>(null), shields = useRef<THREE.InstancedMesh>(null);
  const halo = useMemo(() => makeHalo(STAR_POOL, 13), []);
  const glows = useRef<(THREE.Sprite | null)[]>([]);
  useFrame(({ clock, camera }) => {
    let nr = 0, ns = 0, ng = 0;
    const t = clock.elapsedTime;
    for (const p of sim.planets) {
      for (const rock of p.rocks) {
        if (!rock.alive || nr >= ROCK_POOL) continue;
        tmp.position.set(p.x + Math.cos(rock.a) * rock.r, 1.2, p.z + Math.sin(rock.a) * rock.r);
        tmp.rotation.set(t + rock.a, t * .7, 0); tmp.scale.setScalar(.9); tmp.updateMatrix(); rocks.current?.setMatrixAt(nr++, tmp.matrix);
      }
      if (p.star && p.star.cool <= 0 && ns < STAR_POOL) {
        const x = p.x + Math.cos(p.star.a) * p.star.r, y = 1.8 + Math.sin(t * 2 + p.i) * .3, z = p.z + Math.sin(p.star.a) * p.star.r;
        tmp.position.set(x, y, z); billboard(camera.quaternion, Math.sin(t * 1.5 + p.i) * .35);
        tmp.scale.setScalar(1.35); tmp.updateMatrix(); stars.current?.setMatrixAt(ns, tmp.matrix);
        billboard(camera.quaternion, -t * 1.2); tmp.scale.setScalar(2.2 + Math.sin(t * 3 + p.i) * .2); tmp.updateMatrix(); shields.current?.setMatrixAt(ns, tmp.matrix);
        setHalo(halo, ns++, x, y, z, SHIELD, .8 + .2 * Math.sin(t * 5 + p.i));
      }
      if (p.fresh && ng < GLOW_POOL) {
        const g = glows.current[ng++];
        if (g) { g.visible = true; g.position.set(p.x, 0, p.z); g.scale.setScalar(p.R * (4.2 + Math.sin(t * 2 + p.i) * .5)); (g.material as THREE.SpriteMaterial).color.set(p.glow); }
      }
    }
    for (const [m, n] of [[rocks, nr], [stars, ns], [shields, ns]] as const) if (m.current) { m.current.count = n; m.current.instanceMatrix.needsUpdate = true; }
    commitHalo(halo, ns);
    for (let i = ng; i < GLOW_POOL; i++) { const g = glows.current[i]; if (g) g.visible = false; }
  });
  return <>
    <instancedMesh ref={rocks} args={[undefined, undefined, ROCK_POOL]} frustumCulled={false}><dodecahedronGeometry args={[1, 0]} /><meshStandardMaterial color="#6b1d2a" emissive="#ff4f6a" emissiveIntensity={.7} flatShading /></instancedMesh>
    <instancedMesh ref={stars} args={[starGeometry(), undefined, STAR_POOL]} frustumCulled={false}><meshStandardMaterial color="#fff4c4" emissive="#ffc23d" emissiveIntensity={1.6} metalness={.3} roughness={.25} flatShading toneMapped={false} /></instancedMesh>
    <instancedMesh ref={shields} args={[undefined, undefined, STAR_POOL]} frustumCulled={false}><ringGeometry args={[.86, 1, 48]} /><meshBasicMaterial color="#ffe08a" {...additive} opacity={.55} side={THREE.DoubleSide} /></instancedMesh>
    <primitive object={halo} />
    {Array.from({ length: GLOW_POOL }, (_, i) => <sprite key={i} ref={el => { glows.current[i] = el; }} visible={false}><spriteMaterial map={glow()} opacity={.22} {...additive} /></sprite>)}
  </>;
}

/** Meteor storm: glowing rocks with a fiery trail along their flight. */
const METEOR_POOL = 80;
function Meteors({ sim }: { sim: Sim }) {
  const rocks = useRef<THREE.InstancedMesh>(null), trails = useRef<THREE.InstancedMesh>(null);
  useFrame(({ clock }) => {
    let n = 0;
    for (const m of sim.meteors) {
      if (n >= METEOR_POOL) break;
      const yaw = -Math.atan2(m.vz, m.vx);
      tmp.position.set(m.x, 1.6, m.z); tmp.rotation.set(clock.elapsedTime * 2 + m.id, clock.elapsedTime + m.id, 0); tmp.scale.setScalar(STORM.r * .9); tmp.updateMatrix();
      rocks.current?.setMatrixAt(n, tmp.matrix);
      tmp.position.set(m.x - Math.cos(-yaw) * 6, 1.6, m.z - Math.sin(-yaw) * 6); tmp.rotation.set(0, yaw, Math.PI / 2); tmp.scale.set(1, 1, 1); tmp.updateMatrix();
      trails.current?.setMatrixAt(n++, tmp.matrix);
    }
    for (const r of [rocks, trails]) if (r.current) { r.current.count = n; r.current.instanceMatrix.needsUpdate = true; }
  });
  return <>
    <instancedMesh ref={rocks} args={[undefined, undefined, METEOR_POOL]} frustumCulled={false}><dodecahedronGeometry args={[1, 0]} /><meshStandardMaterial color="#5a2a10" emissive="#ff7a1a" emissiveIntensity={1.4} flatShading toneMapped={false} /></instancedMesh>
    <instancedMesh ref={trails} args={[undefined, undefined, METEOR_POOL]} frustumCulled={false}><coneGeometry args={[1.6, 12, 10, 1, true]} /><meshBasicMaterial color="#ffb547" {...additive} opacity={.35} side={THREE.DoubleSide} /></instancedMesh>
  </>;
}

/** Ping markers: a light beam, a pulsing ring and a label, drawn from a fixed pool. */
const PING_POOL = 12;
function Pings({ sim }: { sim: Sim }) {
  const groups = useRef<(THREE.Group | null)[]>([]), rings = useRef<(THREE.Mesh | null)[]>([]), labels = useRef<(HTMLSpanElement | null)[]>([]);
  useFrame(({ clock }) => {
    for (let i = 0; i < PING_POOL; i++) {
      const g = groups.current[i], p = sim.pings[i]; if (!g) continue;
      g.visible = !!p; if (!p) continue;
      g.position.set(p.x, 0, p.z);
      const left = p.until - sim.t, pulse = 1 + ((clock.elapsedTime * 1.6) % 1) * 1.4;
      const ring = rings.current[i];
      if (ring) { ring.scale.setScalar(pulse); const m = ring.material as THREE.MeshBasicMaterial; m.opacity = Math.min(1, left) * (1.5 - pulse * .5); m.color.set(p.color); }
      g.children.forEach(ch => { const m = (ch as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined; if (m && ch !== ring && "color" in m) m.color.set(p.color); });
      const el = labels.current[i];
      if (el) { const t = `${p.label} · ${p.name}`; if (el.textContent !== t) el.textContent = t; el.style.borderColor = p.color; }
    }
  });
  return <>{Array.from({ length: PING_POOL }, (_, i) => <group key={i} ref={el => { groups.current[i] = el; }} visible={false}>
    <mesh position={[0, 9, 0]}><cylinderGeometry args={[.25, .9, 18, 12, 1, true]} /><meshBasicMaterial {...additive} opacity={.45} side={THREE.DoubleSide} /></mesh>
    <mesh ref={el => { rings.current[i] = el; }} rotation={[-Math.PI / 2, 0, 0]} position={[0, .2, 0]}><ringGeometry args={[2.2, 2.7, 40]} /><meshBasicMaterial {...additive} side={THREE.DoubleSide} /></mesh>
    <Html center position={[0, 19.5, 0]} zIndexRange={[6, 0]} pointerEvents="none"><span ref={el => { labels.current[i] = el; }} className="orbit-ping" /></Html>
  </group>)}</>;
}

/** Alien hulls, built once. Each kind reads by shape as well as colour: lens saucer, arrowhead hunter, spiked mine. */
let alienGeo: { saucer: THREE.BufferGeometry; hunter: THREE.BufferGeometry; swarmer: THREE.BufferGeometry } | null = null; // swarmer = spikes only; its core is a separate glowing mesh
function alienGeometry() {
  if (alienGeo) return alienGeo;
  const lens = [[0, -.55], [1.2, -.5], [2.3, -.18], [2.75, 0], [2.3, .2], [1.4, .42], [0, .46]].map(([x, y]) => new THREE.Vector2(x, y));
  const arrow = new THREE.Shape();
  [[2.3, 0], [-1.4, 1.7], [-.7, .35], [-1.2, 0], [-.7, -.35], [-1.4, -1.7]].forEach(([x, y], i) => i ? arrow.lineTo(x, y) : arrow.moveTo(x, y));
  const hunter = new THREE.ExtrudeGeometry(arrow, { depth: .3, bevelEnabled: true, bevelThickness: .14, bevelSize: .1, bevelSegments: 1, steps: 1 });
  hunter.translate(0, 0, -.15).rotateX(-Math.PI / 2);
  // Spiked mine: six dark spikes along the axes around a glowing core.
  const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const spikes = dirs.map(([x, y, z]) => {
    const c = new THREE.ConeGeometry(.24, .95, 5).translate(0, .8, 0);
    c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x, y, z)));
    return c.toNonIndexed();
  });
  const swarmer = mergeGeometries(spikes)!;
  return alienGeo = { saucer: new THREE.LatheGeometry(lens, 32), hunter, swarmer };
}
const RIM_BULBS = 8;
function Aliens({ sim, palette }: { sim: Sim; palette: Palette }) {
  const hull = useRef<THREE.InstancedMesh>(null), dome = useRef<THREE.InstancedMesh>(null), bulbs = useRef<THREE.InstancedMesh>(null);
  const hunter = useRef<THREE.InstancedMesh>(null), core = useRef<THREE.InstancedMesh>(null), swarm = useRef<THREE.InstancedMesh>(null), swarmCore = useRef<THREE.InstancedMesh>(null);
  const motherships = useRef<(THREE.Group | null)[]>([]);
  const geo = alienGeometry(), halo = useMemo(() => makeHalo(140, 9), []);
  const tint = useMemo(() => ({ saucer: new THREE.Color(palette.saucer), hunter: new THREE.Color(palette.hunter), swarmer: new THREE.Color(palette.swarmer), mothership: new THREE.Color(palette.mothership) }), [palette]);
  useFrame(() => {
    let ns = 0, nb = 0, nh = 0, nw = 0, nm = 0, ng = 0;
    for (const a of sim.aliens) {
      const bob = Math.sin(a.spin * .7) * .4 + 1.5, yaw = -Math.atan2(a.vz, a.vx);
      if (a.kind === "saucer") {
        const tilt = a.held || a.flung > 0 ? a.spin : Math.hypot(a.vx, a.vz) * .015;
        tmp.position.set(a.x, bob, a.z); tmp.rotation.set(tilt, a.spin * .3, 0); tmp.scale.setScalar(1); tmp.updateMatrix();
        hull.current?.setMatrixAt(ns, tmp.matrix);
        tmp.position.y = bob + .3; tmp.updateMatrix(); dome.current?.setMatrixAt(ns++, tmp.matrix);
        // Rim lights chase around the hull.
        for (let k = 0; k < RIM_BULBS && nb < 40 * RIM_BULBS; k++) {
          const ang = k / RIM_BULBS * TAU + a.spin * .3;
          tmp.position.set(a.x + Math.cos(ang) * 2.75, bob, a.z - Math.sin(ang) * 2.75); tmp.rotation.set(0, 0, 0);
          tmp.scale.setScalar(.55 + .55 * Math.max(0, Math.cos(k / RIM_BULBS * TAU - a.spin * 2.5))); tmp.updateMatrix();
          bulbs.current?.setMatrixAt(nb++, tmp.matrix);
        }
      } else if (a.kind === "hunter") {
        tmp.position.set(a.x, bob, a.z); tmp.rotation.set(Math.sin(a.spin * .5) * .3, yaw, 0, "YXZ"); tmp.scale.setScalar(1); tmp.updateMatrix();
        hunter.current?.setMatrixAt(nh, tmp.matrix);
        tmp.position.y = bob + .4; tmp.scale.setScalar(1 + Math.sin(a.spin * 2) * .25); tmp.updateMatrix(); core.current?.setMatrixAt(nh++, tmp.matrix);
      } else if (a.kind === "swarmer") {
        tmp.position.set(a.x, 1.4, a.z); tmp.rotation.set(a.spin, a.spin * 1.3, 0, "XYZ"); tmp.scale.setScalar(1); tmp.updateMatrix();
        swarm.current?.setMatrixAt(nw, tmp.matrix);
        tmp.scale.setScalar(.9 + Math.sin(a.t * 9) * .15); tmp.updateMatrix(); swarmCore.current?.setMatrixAt(nw++, tmp.matrix);
      } else {
        const g = motherships.current[nm++]; if (!g) continue;
        g.visible = true; g.position.set(a.x, 2.5 + Math.sin(a.spin) * .5, a.z); g.rotation.y = a.spin;
        g.scale.setScalar(a.hitCool > .45 ? 1.06 : 1); // flinch on heavy hits
        continue; // has its own glow
      }
      if (ng < 140) setHalo(halo, ng++, a.x, .6, a.z, tint[a.kind], a.kind === "swarmer" ? .45 : .6);
    }
    for (const [m, n] of [[hull, ns], [dome, ns], [bulbs, nb], [hunter, nh], [core, nh], [swarm, nw], [swarmCore, nw]] as const) if (m.current) { m.current.count = n; m.current.instanceMatrix.needsUpdate = true; }
    commitHalo(halo, ng);
    for (let i = nm; i < motherships.current.length; i++) { const g = motherships.current[i]; if (g) g.visible = false; }
  });
  return <>
    <primitive object={halo} />
    <instancedMesh ref={hull} args={[geo.saucer, undefined, 40]} frustumCulled={false}><meshStandardMaterial color="#b9c2da" metalness={.35} roughness={.35} /></instancedMesh>
    <instancedMesh ref={dome} args={[undefined, undefined, 40]} frustumCulled={false}><sphereGeometry args={[1.15, 20, 10, 0, TAU, 0, Math.PI / 2]} /><meshStandardMaterial color={palette.saucer} emissive={palette.saucer} emissiveIntensity={1.3} roughness={.1} transparent opacity={.9} toneMapped={false} /></instancedMesh>
    <instancedMesh ref={bulbs} args={[undefined, undefined, 40 * RIM_BULBS]} frustumCulled={false}><sphereGeometry args={[.22, 8, 6]} /><meshBasicMaterial color={palette.alienShot} toneMapped={false} /></instancedMesh>
    <instancedMesh ref={hunter} args={[geo.hunter, undefined, 40]} frustumCulled={false}><meshStandardMaterial color="#4a4f63" emissive={palette.hunter} emissiveIntensity={.18} metalness={.35} roughness={.35} flatShading /></instancedMesh>
    <instancedMesh ref={core} args={[undefined, undefined, 40]} frustumCulled={false}><octahedronGeometry args={[.6, 0]} /><meshBasicMaterial color={palette.hunter} toneMapped={false} /></instancedMesh>
    <instancedMesh ref={swarm} args={[geo.swarmer, undefined, 60]} frustumCulled={false}><meshStandardMaterial color="#3d4152" metalness={.4} roughness={.35} flatShading /></instancedMesh>
    <instancedMesh ref={swarmCore} args={[undefined, undefined, 60]} frustumCulled={false}><icosahedronGeometry args={[.62, 1]} /><meshBasicMaterial color={palette.swarmer} toneMapped={false} /></instancedMesh>
    {[0, 1].map(i => <group key={i} ref={el => { motherships.current[i] = el; }} visible={false}>
      <mesh><cylinderGeometry args={[5.4, 6.6, 1.3, 40]} /><meshStandardMaterial color="#5d5a78" metalness={.4} roughness={.35} /></mesh>
      <mesh position={[0, -.9, 0]}><cylinderGeometry args={[3.4, 2.2, .8, 32]} /><meshStandardMaterial color="#3a3650" metalness={.4} roughness={.4} /></mesh>
      <mesh position={[0, .6, 0]}><sphereGeometry args={[3, 24, 14, 0, TAU, 0, Math.PI / 2]} /><meshStandardMaterial color={palette.mothership} emissive={palette.mothership} emissiveIntensity={1.5} transparent opacity={.85} toneMapped={false} /></mesh>
      <mesh><torusGeometry args={[6.4, .2, 8, 48]} /><meshBasicMaterial color="#ff4fd8" toneMapped={false} /></mesh>
      {Array.from({ length: 8 }, (_, k) => <mesh key={k} position={[Math.cos(k / 8 * TAU) * 7.2, 0, Math.sin(k / 8 * TAU) * 7.2]} rotation={[0, -k / 8 * TAU, 0]}>
        <boxGeometry args={[1.8, .35, .5]} /><meshStandardMaterial color="#8c86b3" emissive="#ff4fd8" emissiveIntensity={.5} metalness={.7} roughness={.3} />
      </mesh>)}
      <sprite position={[0, -1.5, 0]} scale={[22, 22, 1]}><spriteMaterial map={glow()} color={palette.mothership} opacity={.55} {...additive} /></sprite>
    </group>)}
  </>;
}

function Bullets({ sim, palette }: { sim: Sim; palette: Palette }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const colors = useMemo(() => ({ me: new THREE.Color("#7cf2ff").multiplyScalar(2), ally: new THREE.Color(palette.ally).multiplyScalar(2), alien: new THREE.Color(palette.alienShot).multiplyScalar(2) }), [palette]);
  useFrame(() => {
    const m = ref.current; if (!m) return;
    let n = 0;
    for (const b of sim.bullets) {
      if (n >= 500) break;
      tmp.position.set(b.x, 1.2, b.z); tmp.rotation.set(0, -Math.atan2(b.vz, b.vx), 0);
      tmp.scale.set(b.from === "alien" ? 1 : 1.6, b.big ? 1.9 : 1, b.big ? 1.9 : 1); tmp.updateMatrix();
      m.setMatrixAt(n, tmp.matrix); m.setColorAt(n++, colors[b.from]);
    }
    m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[undefined, undefined, 500]} frustumCulled={false}>
    <capsuleGeometry args={[.22, 1.3, 2, 6]} /><meshBasicMaterial toneMapped={false} />
  </instancedMesh>;
}

function Particles({ sim }: { sim: Sim }) {
  const max = 1400;
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    return g;
  }, []);
  useFrame(() => {
    const pos = geo.attributes.position as THREE.BufferAttribute, col = geo.attributes.color as THREE.BufferAttribute;
    const n = Math.min(max, sim.particles.length);
    for (let i = 0; i < n; i++) {
      const p = sim.particles[i], f = Math.max(0, p.life / p.max) * 1.6;
      pos.setXYZ(i, p.x, p.y, p.z); col.setXYZ(i, p.r * f, p.g * f, p.b * f);
    }
    geo.setDrawRange(0, n); pos.needsUpdate = col.needsUpdate = true;
  });
  return <points geometry={geo} frustumCulled={false}>
    <pointsMaterial size={.9} map={glow()} vertexColors sizeAttenuation {...additive} />
  </points>;
}

function Flashes({ sim }: { sim: Sim }) {
  const pool = useRef<(THREE.Sprite | null)[]>([]);
  useFrame(() => {
    pool.current.forEach((s, i) => {
      if (!s) return;
      const f = sim.flashes[sim.flashes.length - 1 - i];
      s.visible = !!f; if (!f) return;
      const k = f.t / f.max; s.position.set(f.x, 1.5, f.z); s.scale.setScalar(f.size * (.4 + k * 1.4));
      const mat = s.material as THREE.SpriteMaterial; mat.opacity = 1 - k; mat.color.set(f.color);
    });
  });
  return <>{Array.from({ length: 24 }, (_, i) => <sprite key={i} ref={el => { pool.current[i] = el; }} visible={false}>
    <spriteMaterial map={glow()} {...additive} />
  </sprite>)}</>;
}

function Novas({ sim }: { sim: Sim }) {
  const rings = useRef<(THREE.Group | null)[]>([]);
  useFrame(() => {
    rings.current.forEach((g, i) => {
      if (!g) return;
      const n = sim.novas[i]; g.visible = !!n; if (!n) return;
      const r = Math.max(.1, novaRadius(n.t)), fade = Math.max(0, 1 - n.t / 1.6);
      g.position.set(n.x, 1, n.z); g.scale.setScalar(r);
      g.children.forEach((c, j) => { ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = fade * (j === 0 ? .9 : .18); });
    });
  });
  return <>{Array.from({ length: 4 }, (_, i) => <group key={i} ref={el => { rings.current[i] = el; }} visible={false}>
    <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[.93, 1, 128]} /><meshBasicMaterial color="#fff2c4" {...additive} side={THREE.DoubleSide} /></mesh>
    <mesh><sphereGeometry args={[1, 40, 20]} /><meshBasicMaterial color="#ffb547" {...additive} side={THREE.BackSide} /></mesh>
  </group>)}</>;
}

function Beam({ sim }: { sim: Sim }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    const grab = sim.grab, b = g.current; if (!b) return;
    b.visible = !!grab; if (!grab) return;
    const o = grab.planet ?? grab.alien!, s = sim.ship;
    const dx = o.x - s.x, dz = o.z - s.z, len = Math.hypot(dx, dz);
    b.position.set((s.x + o.x) / 2, 1.2, (s.z + o.z) / 2);
    b.rotation.set(0, -Math.atan2(dz, dx), Math.PI / 2);
    b.scale.set(1 + Math.sin(sim.t * 40) * .25, len, 1 + Math.cos(sim.t * 37) * .25);
  });
  return <group ref={g} visible={false}>
    <mesh><cylinderGeometry args={[.5, .9, 1, 12, 1, true]} /><meshBasicMaterial color="#74e2ff" {...additive} opacity={.35} side={THREE.DoubleSide} /></mesh>
    <mesh><cylinderGeometry args={[.12, .2, 1, 8, 1, true]} /><meshBasicMaterial color="#ffffff" {...additive} opacity={.9} /></mesh>
  </group>;
}

export const GameScene = memo(function GameScene({ ctl, peers, color, hull, palette, quality }: { ctl: Control; peers: Peer[]; color: string; hull: HullId; palette: Palette; quality: "high" | "low" }) {
  const sim = ctl.sim;
  const seed = useMemo(() => seedFor(sim.universe.room), [sim]);
  return <>
    <color attach="background" args={["#03040c"]} />
    <ambientLight intensity={.45} color="#8fa0d8" />
    <pointLight position={[0, 4, 0]} intensity={3.2} decay={0} color="#ffe2b0" />
    <directionalLight position={[20, 60, 40]} intensity={.6} />
    <Stars radius={1100} depth={400} count={QUALITY[quality].stars} factor={9} fade speed={.6} />
    <Nebula seed={seed} />
    <group scale={SUN_R / 1.95}><Sun /></group>
    <Html center position={[0, SUN_R + 4, 0]} zIndexRange={[5, 0]} pointerEvents="none"><span className="orbit-label sun">{sim.universe.title}</span></Html>
    <OrbitLines sim={sim} />
    <AsteroidBelt sim={sim} count={QUALITY[quality].belt} />
    <Planets sim={sim} />
    <Satellites sim={sim} />
    <Portal ctl={ctl} />
    <Comet sim={sim} />
    <Pings sim={sim} />
    <Meteors sim={sim} />
    <PlanetExtras sim={sim} />
    <Floats sim={sim} />
    <LocalShip ctl={ctl} color={color} hull={hull} />
    {peers.map(p => <RemoteShip key={p.id} sim={sim} peer={p} />)}
    <Aliens sim={sim} palette={palette} />
    <Bullets sim={sim} palette={palette} />
    <Beam sim={sim} />
    <Particles sim={sim} />
    <Flashes sim={sim} />
    <Novas sim={sim} />
    <HyperTunnel ctl={ctl} />
    <CameraRig ctl={ctl} />
    <Driver ctl={ctl} />
  </>;
});

/** Lobby hangar: the chosen hull turning slowly in its own small canvas. */
function Turntable({ children }: { children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (g.current) g.current.rotation.y += dt * .6; });
  return <group ref={g} rotation={[0, .6, 0]}>{children}</group>;
}
export function ShipPreview({ color, hull }: { color: string; hull: HullId }) {
  return <div className="orbit-preview" aria-hidden="true">
    <Canvas camera={{ position: [0, 4.5, 8.5], fov: 38 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
      <ambientLight intensity={.6} color="#8fa0d8" />
      <directionalLight position={[4, 8, 6]} intensity={2.2} />
      <pointLight position={[-6, 2, -4]} intensity={30} color={color} />
      <Turntable><ShipModel color={color} hull={hull} /></Turntable>
    </Canvas>
  </div>;
}
