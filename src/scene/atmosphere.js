import * as THREE from "three";
import { createGrassMaterial } from "../city/materials.js";
import { createStreetTrees } from "./trees.js";

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
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), grassMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.04;
  ground.receiveShadow = true;
  group.add(ground);

  const cloudTex = makeCloudTexture();
  const cloudMat = new THREE.MeshBasicMaterial({
    map: cloudTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.9,
    fog: true,
  });
  const clouds = [];
  for (let i = 0; i < 48; i++) {
    const w = 200 + Math.random() * 320;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, w * 0.42),
      cloudMat,
    );
    const ang = Math.random() * Math.PI * 2;
    const dist = 400 + Math.random() * 2000;
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

  group.add(createStreetTrees({ x: 0, z: 0 }, 80, 108));

  // 가로등
  const poleMat = new THREE.MeshStandardMaterial({
    color: 0x3a4450,
    metalness: 0.55,
    roughness: 0.35,
  });
  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0xfff6d8,
    emissive: 0xffe0a0,
    emissiveIntensity: 1.4,
  });
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const x = Math.cos(a) * 122;
    const z = Math.sin(a) * 122;
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.12, 6.2, 8),
      poleMat,
    );
    pole.position.set(x, 3.1, z);
    group.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 10), bulbMat);
    bulb.position.set(x + Math.cos(a) * 0.9, 6.0, z + Math.sin(a) * 0.9);
    group.add(bulb);
    const light = new THREE.PointLight(0xffe6b0, 0.9, 26, 2);
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
