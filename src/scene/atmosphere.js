import * as THREE from "three";
import { createGrassMaterial } from "../city/materials.js";

function makeCloudTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const g = c.getContext("2d");
  g.clearRect(0, 0, 512, 256);
  const blob = (x, y, r, a) => {
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(255,255,255,${a})`);
    grd.addColorStop(0.55, `rgba(255,255,255,${a * 0.45})`);
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  blob(180, 130, 90, 0.65);
  blob(250, 120, 80, 0.55);
  blob(310, 140, 70, 0.5);
  blob(220, 150, 60, 0.45);
  blob(280, 110, 55, 0.4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createAtmosphere(scene) {
  const group = new THREE.Group();
  group.name = "atmosphere";

  const grassMat = createGrassMaterial();
  grassMat.userData.shared = true;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4500, 4500), grassMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.04;
  ground.receiveShadow = true;
  group.add(ground);

  // 더 풍성한 구름층
  const cloudTex = makeCloudTexture();
  const cloudMat = new THREE.MeshBasicMaterial({
    map: cloudTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.9,
    fog: true,
  });
  const clouds = [];
  for (let i = 0; i < 40; i++) {
    const w = 200 + Math.random() * 320;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, w * 0.42),
      cloudMat,
    );
    const ang = Math.random() * Math.PI * 2;
    const dist = 350 + Math.random() * 1600;
    mesh.position.set(
      Math.cos(ang) * dist,
      180 + Math.random() * 220,
      Math.sin(ang) * dist,
    );
    mesh.userData.drift = 1.5 + Math.random() * 5;
    mesh.userData.baseX = mesh.position.x;
    group.add(mesh);
    clouds.push(mesh);
  }

  // 나무 — 더 자연스러운 왕관 2단
  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x5c4028,
    roughness: 0.95,
  });
  const leafMat = new THREE.MeshStandardMaterial({
    color: 0x3d9a52,
    roughness: 0.8,
  });
  const leafDark = new THREE.MeshStandardMaterial({
    color: 0x2e7340,
    roughness: 0.85,
  });

  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2 + (i % 3) * 0.05;
    const r = 100 + (i % 7) * 10 + (i % 2) * 4;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = 2.8 + (i % 4) * 0.35;

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.34, h, 7),
      trunkMat,
    );
    trunk.position.set(x, h / 2, z);
    trunk.castShadow = true;
    group.add(trunk);

    const s1 = 2.0 + (i % 3) * 0.35;
    const c1 = new THREE.Mesh(new THREE.SphereGeometry(s1, 12, 10), leafMat);
    c1.position.set(x, h + s1 * 0.55, z);
    c1.castShadow = true;
    group.add(c1);
    const c2 = new THREE.Mesh(
      new THREE.SphereGeometry(s1 * 0.7, 10, 8),
      leafDark,
    );
    c2.position.set(x + 0.4, h + s1 * 1.05, z - 0.3);
    c2.castShadow = true;
    group.add(c2);
  }

  // 가로등
  const poleMat = new THREE.MeshStandardMaterial({
    color: 0x2a3038,
    metalness: 0.6,
    roughness: 0.4,
  });
  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0xfff2c8,
    emissive: 0xffd88a,
    emissiveIntensity: 1.2,
  });
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const x = Math.cos(a) * 118;
    const z = Math.sin(a) * 118;
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.12, 6.2, 8),
      poleMat,
    );
    pole.position.set(x, 3.1, z);
    group.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.08), poleMat);
    arm.position.set(x + Math.cos(a) * 0.5, 6.1, z + Math.sin(a) * 0.5);
    group.add(arm);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), bulbMat);
    bulb.position.set(x + Math.cos(a) * 1.0, 5.95, z + Math.sin(a) * 1.0);
    group.add(bulb);
    const light = new THREE.PointLight(0xffe2a8, 1.1, 28, 2);
    light.position.copy(bulb.position);
    group.add(light);
  }

  scene.add(group);

  return {
    group,
    grassMat,
    update(dt, time, playerPos) {
      if (grassMat.uniforms?.time) grassMat.uniforms.time.value = time;
      for (const c of clouds) {
        c.position.x += c.userData.drift * dt;
        if (c.position.x > c.userData.baseX + 1000) {
          c.position.x = c.userData.baseX - 1000;
        }
        if (playerPos) c.lookAt(playerPos.x, c.position.y, playerPos.z);
      }
    },
  };
}
