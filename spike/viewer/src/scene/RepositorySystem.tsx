import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Html, OrbitControls, Stars } from "@react-three/drei";
import { World, Sun } from "./World";
import { planetStyle, seedFor } from "../github/planetStyle";
import type { Repository, GitCommit } from "../github/api";
import * as THREE from "three";

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

export function RepositorySystem({ repositories, selected, commits, commitIndex, onRepo, onCommit, centerLabel, motion }: {
  repositories: Repository[]; selected: Repository | null; commits: GitCommit[]; commitIndex: number;
  onRepo: (repo: Repository) => void; onCommit: (index: number) => void; centerLabel: string; motion: boolean;
}) {
  const placements = useMemo(() => repositories.map((repo, i) => {
    const ring = Math.floor(i / 4);
    const angle = (i % 4) * Math.PI / 2 + ring * .65 + .3;
    const radius = 5.8 + ring * 4.8;
    return { repo, position: [Math.cos(angle) * radius * 1.3, (seedFor(repo.name) - .5) * .8, Math.sin(angle) * radius * .9] as [number,number,number] };
  }), [repositories]);
  return <Canvas key={selected?.id ?? "overview"} dpr={[1,1.75]}
    camera={{ position: selected ? [0,7.8,12.5] : [0,19,25], fov: 43, near: .1, far: 300 }}
    fallback={<p className="canvas-fallback">3D needs WebGL. You can still explore every repository and commit from the lists.</p>}>
    <color attach="background" args={["#07090f"]} />
    <Stars radius={90} depth={35} count={2300} factor={3} fade speed={motion ? .15 : 0} />
    {/* autoRotate orbits the camera around the system; three.js pauses it while the user is dragging
        and resumes afterwards. The "Pause rotation" button and reduced-motion both drive `motion`. */}
    <OrbitControls makeDefault enablePan={false} enableDamping dampingFactor={.07}
      autoRotate={motion} autoRotateSpeed={selected ? .5 : .7}
      minDistance={selected ? 7 : 14} maxDistance={selected ? 24 : 45}
      maxPolarAngle={Math.PI * .48} minPolarAngle={.2} />
    {selected ? <>
      <World repo={selected} radius={2.15} active animate={motion} />
      <Orbit radius={5.4} opacity={.2} />
      {commits.map((commit, i) => <Satellite key={commit.sha} commit={commit} index={i} total={commits.length}
        active={i === commitIndex} onSelect={() => onCommit(i)} />)}
    </> : <>
      <Sun animate={motion} />
      <Html center position={[0,2,0]} zIndexRange={[5,0]}><span className="sun-label">{centerLabel}</span></Html>
      <group scale={[1.3,1,.9]}><Orbit radius={5.8} /><Orbit radius={10.6} /></group>
      {placements.map(({ repo, position }) => {
        const style = planetStyle(repo);
        return <group key={repo.id} position={position}>
          <World repo={repo} radius={style.radius} onClick={() => onRepo(repo)} animate={motion} />
          <Html center position={[0,-style.radius - .6,0]} zIndexRange={[8,0]}>
            <button title={repo.full_name} className="planet-label" onClick={() => onRepo(repo)}>
              <span className="planet-label-dot" style={{ background: style.glow }} />{repo.name}
              <small>{repo.language ?? "Mixed languages"}</small>
            </button>
          </Html>
        </group>;
      })}
    </>}
  </Canvas>;
}
