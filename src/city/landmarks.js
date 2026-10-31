import * as THREE from "three";
import { createSignatureBuilding } from "./signatures.js";

/** Compatibility wrapper. Landmarks must be tied to actual mapped building footprints. */
export function createSongdoLandmarks(project, buildings = []) {
  const group = new THREE.Group(); group.name = "landmarks";
  for (const building of buildings) {
    const mesh = createSignatureBuilding(building);
    if (mesh) group.add(mesh);
  }
  return {group, colliders: []};
}
