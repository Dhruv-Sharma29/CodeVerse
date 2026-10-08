import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useStore } from "../store";
import type { Layout } from "../layout";
import { computeStateAt, maxLoc } from "../timeline";
import { setRecentActivity } from "../activity";
import type { Bundle } from "../types";

const HEAT_WINDOW = 60; // commits over which a "just touched" glow fades out
const HOT = new THREE.Color("#ffffff");
const NEW = new THREE.Color("#7CFC9A");
const GHOST = new THREE.Color("#2a3040");

function usePlanetTimingInfo(bundle: Bundle) {
  return useMemo(() => {
    const peak = maxLoc(bundle);
    const bornAt = new Int32Array(bundle.nodes.length).fill(-1);
    for (const [ci, nodeId, op] of bundle.events) {
      if (op !== 2 && bornAt[nodeId] === -1) bornAt[nodeId] = ci;
    }
    return { peak, bornAt };
  }, [bundle]);
}

export function Planets({ layout }: { layout: Layout }) {
  const bundle = useStore((s) => s.bundle)!;
  const commitIndex = useStore((s) => Math.floor(s.commitIndex));
  const setSelected = useStore((s) => s.setSelected);
  const setHovered = useStore((s) => s.setHovered);

  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const { peak, bornAt } = usePlanetTimingInfo(bundle);
  const n = bundle.nodes.length;

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const baseColors = useMemo(() => layout.nodes.map((ln) => new THREE.Color(ln.color)), [layout]);
  const lastComputed = useRef(-1);

  useEffect(() => {
    // static per-node color buffer, written once
    const mesh = meshRef.current;
    for (let i = 0; i < n; i++) mesh.setColorAt(i, baseColors[i]);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [baseColors, n]);

  useFrame(() => {
    if (lastComputed.current === commitIndex) return;
    lastComputed.current = commitIndex;

    const state = computeStateAt(bundle, commitIndex);
    const mesh = meshRef.current;
    const centroid = new THREE.Vector3();
    let weight = 0;
    const tmpColor = new THREE.Color();

    for (let i = 0; i < n; i++) {
      const ln = layout.nodes[i];
      const alive = state.alive[i] === 1;
      const born = bornAt[i];
      const notYetBorn = born === -1 || born > commitIndex;

      let scale = 0.0001;
      if (alive && !notYetBorn) {
        const loc = Math.max(state.loc[i], 4);
        scale = 0.14 + 1.0 * Math.sqrt(loc / peak);
      } else if (!alive && !notYetBorn) {
        scale = 0.12; // ghost: small dead husk, still visible (GitGhost lens preview)
      }

      dummy.position.set(...ln.pos);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      const age = commitIndex - state.lastTouch[i];
      if (!alive && !notYetBorn) {
        tmpColor.copy(GHOST);
      } else if (age >= 0 && age < HEAT_WINDOW) {
        const t = 1 - age / HEAT_WINDOW;
        const flavor = born === state.lastTouch[i] ? NEW : HOT;
        tmpColor.copy(baseColors[i]).lerp(flavor, t * 0.85);
        if (t > 0.05) {
          centroid.x += ln.pos[0] * t;
          centroid.y += ln.pos[1] * t;
          centroid.z += ln.pos[2] * t;
          weight += t;
        }
      } else {
        tmpColor.copy(baseColors[i]);
      }
      mesh.setColorAt(i, tmpColor);
    }

    if (weight > 0) centroid.divideScalar(weight);
    setRecentActivity(centroid, weight);

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.instanceId !== undefined) setSelected(e.instanceId);
  };
  const handleOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (e.instanceId !== undefined) setHovered(e.instanceId);
  };

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, n]}
      onClick={handleClick}
      onPointerMove={handleOver}
      onPointerOut={() => setHovered(null)}
    >
      <sphereGeometry args={[1, 12, 12]} />
      <meshStandardMaterial toneMapped={false} roughness={0.55} metalness={0.15} />
    </instancedMesh>
  );
}
