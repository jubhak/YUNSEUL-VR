import * as THREE from "three";

/**
 * 송도 시그니처 — OSM footprint와 별도로 실측 스케일 실루엣을 보강.
 * 좌표는 공개 지도 기준 근사치.
 */
export function createSongdoLandmarks(project) {
  const group = new THREE.Group();
  group.name = "landmarks";
  const colliders = [];

  const glassBlue = new THREE.MeshPhysicalMaterial({
    color: 0x7eb8d4,
    metalness: 0.65,
    roughness: 0.18,
    transmission: 0.15,
    transparent: true,
    opacity: 0.92,
    clearcoat: 0.4,
  });
  const glassTeal = new THREE.MeshPhysicalMaterial({
    color: 0x5aa8b8,
    metalness: 0.7,
    roughness: 0.2,
    emissive: 0x0a3040,
    emissiveIntensity: 0.15,
  });
  const whitePanel = new THREE.MeshStandardMaterial({
    color: 0xe8eef4,
    roughness: 0.45,
    metalness: 0.15,
  });
  const darkFrame = new THREE.MeshStandardMaterial({
    color: 0x2a3340,
    roughness: 0.55,
    metalness: 0.35,
  });
  const canalMat = new THREE.MeshPhysicalMaterial({
    color: 0x2d7a96,
    metalness: 0.45,
    roughness: 0.12,
    transparent: true,
    opacity: 0.82,
    transmission: 0.2,
  });
  const grassMat = new THREE.MeshStandardMaterial({
    color: 0x3f7a4e,
    roughness: 0.95,
  });
  const sandMat = new THREE.MeshStandardMaterial({
    color: 0xc9b896,
    roughness: 1,
  });

  function addBox(lon, lat, w, d, h, mat, y0 = 0) {
    const p = project(lon, lat);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(p.x, y0 + h / 2, p.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push({
      minX: p.x - w / 2,
      maxX: p.x + w / 2,
      minZ: p.z - d / 2,
      maxZ: p.z + d / 2,
      height: h,
      name: "landmark",
    });
    return mesh;
  }

  // Northeast Asia Trade Tower (NEATT) ~305m — 유리 타워 + 층 밴드
  {
    const p = project(126.6395, 37.3895);
    const shaft = new THREE.Mesh(
      new THREE.BoxGeometry(28, 290, 28),
      glassTeal,
    );
    shaft.position.set(p.x, 145, p.z);
    shaft.castShadow = true;
    group.add(shaft);
    const bandMat = new THREE.MeshStandardMaterial({
      color: 0xd8e6f0,
      metalness: 0.55,
      roughness: 0.25,
      emissive: 0x102030,
      emissiveIntensity: 0.2,
    });
    for (let i = 0; i < 18; i++) {
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(28.6, 0.45, 28.6),
        bandMat,
      );
      band.position.set(p.x, 12 + i * 15.5, p.z);
      group.add(band);
    }
    const crown = new THREE.Mesh(
      new THREE.BoxGeometry(32, 18, 32),
      darkFrame,
    );
    crown.position.set(p.x, 299, p.z);
    group.add(crown);
    const spire = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 2.5, 16, 8),
      darkFrame,
    );
    spire.position.set(p.x, 316, p.z);
    group.add(spire);
    const tipLight = new THREE.PointLight(0x9fdfff, 2.5, 80);
    tipLight.position.set(p.x, 320, p.z);
    group.add(tipLight);
    colliders.push({
      minX: p.x - 15,
      maxX: p.x + 15,
      minZ: p.z - 15,
      maxZ: p.z + 15,
      height: 305,
      name: "NEATT",
    });
  }

  // Songdo Convensia — 저층 컨벤션 홀 두 동
  addBox(126.6455, 37.3888, 90, 55, 22, whitePanel);
  addBox(126.6472, 37.3895, 70, 48, 18, glassBlue);

  // G-Tower (인천경제자유구역청)
  addBox(126.6512, 37.3956, 36, 28, 140, glassBlue);

  // Posco Tower / 인근 고층 클러스터 보강
  addBox(126.6418, 37.3908, 24, 24, 210, glassTeal);
  addBox(126.6428, 37.3915, 22, 22, 180, glassBlue);

  // Tri-bowl 근사 — 뒤집힌 삼각 보울
  {
    const p = project(126.6342, 37.3938);
    const bowl = new THREE.Mesh(
      new THREE.ConeGeometry(28, 18, 3, 1, true),
      whitePanel,
    );
    bowl.rotation.x = Math.PI;
    bowl.position.set(p.x, 12, p.z);
    bowl.castShadow = true;
    group.add(bowl);
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(22, 26, 4, 24),
      darkFrame,
    );
    base.position.set(p.x, 2, p.z);
    group.add(base);
  }

  // 센트럴파크 잔디 + 섬
  {
    const park = project(126.6435, 37.3925);
    const lawn = new THREE.Mesh(
      new THREE.CircleGeometry(95, 48),
      grassMat,
    );
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set(park.x, 0.05, park.z);
    lawn.receiveShadow = true;
    group.add(lawn);

    const island = new THREE.Mesh(
      new THREE.CircleGeometry(28, 32),
      grassMat,
    );
    island.rotation.x = -Math.PI / 2;
    island.position.set(park.x + 8, 0.08, park.z - 6);
    group.add(island);
  }

  // 센트럴파크 환형 수로 (송도 시그니처)
  {
    const park = project(126.6435, 37.3925);
    const canal = createCanalRing(park.x, park.z, 78, 58, 18, canalMat);
    group.add(canal);
    // 동서 연결 수로
    const armGeo = new THREE.BoxGeometry(120, 0.35, 16);
    const arm = new THREE.Mesh(armGeo, canalMat);
    arm.position.set(park.x, 0.12, park.z + 42);
    group.add(arm);
    const arm2 = new THREE.Mesh(new THREE.BoxGeometry(16, 0.35, 90), canalMat);
    arm2.position.set(park.x - 55, 0.12, park.z);
    group.add(arm2);
  }

  // 해변/해안 쪽 수면 힌트 (남동 방향 송도 해안)
  {
    const coast = project(126.655, 37.385);
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(420, 180),
      canalMat.clone(),
    );
    sea.material.color.set(0x1f6f8f);
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(coast.x + 40, 0.02, coast.z + 60);
    group.add(sea);

    const beach = new THREE.Mesh(
      new THREE.PlaneGeometry(380, 28),
      sandMat,
    );
    beach.rotation.x = -Math.PI / 2;
    beach.position.set(coast.x + 20, 0.06, coast.z + 10);
    group.add(beach);
  }

  // 가로수/가로등 분위기 — 센트럴파크 둘레
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xddd6c8,
    emissive: 0xffe6a8,
    emissiveIntensity: 0.35,
  });
  const park = project(126.6435, 37.3925);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const lx = park.x + Math.cos(a) * 100;
    const lz = park.z + Math.sin(a) * 100;
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.16, 5.5, 6),
      darkFrame,
    );
    pole.position.set(lx, 2.75, lz);
    group.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), lampMat);
    bulb.position.set(lx, 5.6, lz);
    group.add(bulb);
  }

  return { group, colliders };
}

function createCanalRing(cx, cz, outerR, innerR, segments, mat) {
  const shape = new THREE.Shape();
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const x = Math.cos(a) * outerR;
    const y = Math.sin(a) * outerR;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  const hole = new THREE.Path();
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const x = Math.cos(a) * innerR;
    const y = Math.sin(a) * innerR;
    if (i === 0) hole.moveTo(x, y);
    else hole.lineTo(x, y);
  }
  shape.holes.push(hole);

  const geo = new THREE.ShapeGeometry(shape, segments);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(cx, 0.1, cz);
  mesh.receiveShadow = true;
  return mesh;
}
