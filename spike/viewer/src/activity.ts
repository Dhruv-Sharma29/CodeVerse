import * as THREE from "three";

// Mutable, non-reactive scratch shared between Planets (writer, once per commit-index change)
// and DirectorCamera (reader, every frame). Deliberately outside React/zustand state — it changes
// far too often for either to be a sane home for it.
export const recentActivityCentroid = new THREE.Vector3(0, 0, 0);
export let recentActivityStrength = 0;

export function setRecentActivity(centroid: THREE.Vector3, strength: number) {
  recentActivityCentroid.copy(centroid);
  recentActivityStrength = strength;
}
