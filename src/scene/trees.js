import * as THREE from "three";

/**
 * 가로수 — 원뿔+구 다층 왕관 (저폴리 돌덩이 느낌 제거)
 */
export function createStreetTrees(center = { x: 0, z: 0 }, count = 72, radius = 110) {
  const group = new THREE.Group();
  group.name = "trees";

  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x6b4a30,
    roughness: 0.92,
    metalness: 0.05,
  });
  const leafMats = [
    new THREE.MeshStandardMaterial({
      color: 0x4caf60,
      roughness: 0.72,
      metalness: 0.02,
    }),
    new THREE.MeshStandardMaterial({
      color: 0x3d9a4e,
      roughness: 0.75,
      metalness: 0.02,
    }),
    new THREE.MeshStandardMaterial({
      color: 0x66bb6a,
      roughness: 0.7,
      metalness: 0.02,
    }),
  ];

  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (i % 5) * 0.04;
    const r = radius + (i % 8) * 9 + (i % 3) * 3;
    const x = center.x + Math.cos(a) * r;
    const z = center.z + Math.sin(a) * r;
    group.add(makeTree(x, z, trunkMat, leafMats[i % leafMats.length], i));
  }

  // 공원 안쪽 산점
  for (let i = 0; i < 28; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 20 + Math.random() * 55;
    group.add(
      makeTree(
        center.x + Math.cos(a) * r,
        center.z + Math.sin(a) * r,
        trunkMat,
        leafMats[i % leafMats.length],
        i + 100,
      ),
    );
  }

  return group;
}

function makeTree(x, z, trunkMat, leafMat, seed) {
  const g = new THREE.Group();
  const h = 3.2 + (seed % 5) * 0.45;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.32, h, 8),
    trunkMat,
  );
  trunk.position.set(x, h / 2, z);
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  g.add(trunk);

  // 겹친 원뿔 왕관 — 구보다 나무답게
  const layers = 3 + (seed % 2);
  for (let L = 0; L < layers; L++) {
    const t = L / layers;
    const rad = 2.4 - t * 0.7 + (seed % 3) * 0.15;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(rad, 2.2 - t * 0.3, 10),
      leafMat,
    );
    cone.position.set(x, h - 0.2 + L * 1.15, z);
    cone.castShadow = true;
    g.add(cone);
  }
  // 상단 둥근 마감
  const top = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 10), leafMat);
  top.position.set(x, h + layers * 1.05, z);
  top.scale.set(1, 0.75, 1);
  top.castShadow = true;
  g.add(top);

  return g;
}
