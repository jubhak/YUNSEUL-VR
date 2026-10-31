import * as THREE from "three";
import {
  createFacadeMaterial,
  createWaterMaterial,
  createAsphaltMaterial,
  createGrassMaterial,
} from "./materials.js";

function shapeFromRing(ring) {
  const pts = ring.slice().reverse();
  const shape = new THREE.Shape();
  shape.moveTo(pts[0].x, -pts[0].z);
  for (let i = 1; i < pts.length; i++) {
    shape.lineTo(pts[i].x, -pts[i].z);
  }
  shape.closePath();
  return shape;
}

/** b>0.55 → 통유리, 아니면 상가/스톤 (셰이더에서 분기) */
function facadeColor(type, height, style) {
  if (style === "retail") {
    return new THREE.Color(0xe8dcc8); // b 낮음 → 상가
  }
  if (style === "glass" || height > 40) {
    return new THREE.Color(0xa8d4f0); // b 높음 → 통유리
  }
  if (type === "apartments" || type === "residential") {
    return new THREE.Color(0xc5daf0);
  }
  if (type === "office" || type === "commercial") {
    return new THREE.Color(0x9ec8e8);
  }
  return new THREE.Color(0xb8d0e8);
}

function buildingStyle(type) {
  if (
    type === "retail" ||
    type === "shop" ||
    type === "supermarket" ||
    type === "kiosk" ||
    type === "commercial" ||
    type === "mall" ||
    type === "hotel"
  ) {
    return "retail";
  }
  if (type === "office" || type === "apartments" || type === "yes") {
    return "glass";
  }
  return "mixed";
}

function mergeGeometries(geos) {
  let vertexCount = 0;
  let indexCount = 0;
  for (const g of geos) {
    vertexCount += g.attributes.position.count;
    indexCount += g.index ? g.index.count : g.attributes.position.count;
  }

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(indexCount);

  let vOffset = 0;
  let iOffset = 0;

  for (const g of geos) {
    positions.set(g.attributes.position.array, vOffset * 3);
    normals.set(g.attributes.normal.array, vOffset * 3);
    colors.set(g.attributes.color.array, vOffset * 3);

    if (g.index) {
      const idx = g.index.array;
      for (let i = 0; i < idx.length; i++) indices[iOffset + i] = idx[i] + vOffset;
      iOffset += idx.length;
    } else {
      for (let i = 0; i < g.attributes.position.count; i++) {
        indices[iOffset + i] = vOffset + i;
      }
      iOffset += g.attributes.position.count;
    }
    vOffset += g.attributes.position.count;
    g.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  merged.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  return merged;
}

export function createBuildingsGroup(buildings, sharedFacadeMat) {
  const group = new THREE.Group();
  group.name = "buildings";
  const colliders = [];
  const geometries = [];

  for (const b of buildings) {
    if (b.footprint.length < 3) continue;
    try {
      const style = b.style || buildingStyle(b.type);
      const shape = shapeFromRing(b.footprint);
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: Math.max(b.height, 3),
        bevelEnabled: true,
        bevelThickness: 0.2,
        bevelSize: 0.15,
        bevelSegments: 1,
      });
      geo.rotateX(-Math.PI / 2);

      const color = facadeColor(b.type, b.height, style);
      const pos = geo.attributes.position;
      const col = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const shade = 0.88 + 0.12 * Math.min(y / Math.max(b.height, 1), 1);
        col[i * 3] = Math.min(1, color.r * shade);
        col[i * 3 + 1] = Math.min(1, color.g * shade);
        col[i * 3 + 2] = Math.min(1, color.b * shade);
      }
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      geometries.push(geo);

      let minX = Infinity,
        maxX = -Infinity,
        minZ = Infinity,
        maxZ = -Infinity;
      for (const p of b.footprint) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minZ = Math.min(minZ, p.z);
        maxZ = Math.max(maxZ, p.z);
      }
      colliders.push({
        minX,
        maxX,
        minZ,
        maxZ,
        height: b.height,
        name: b.name,
      });
    } catch {
      /* skip */
    }
  }

  if (geometries.length) {
    const merged = mergeGeometries(geometries);
    const mat = sharedFacadeMat || createFacadeMaterial();
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  return { group, colliders, count: buildings.length };
}

export function createRoadsGroup(roads, sharedAsphaltMat) {
  const group = new THREE.Group();
  group.name = "roads";

  const asphalt = sharedAsphaltMat || createAsphaltMaterial();
  asphalt.userData.shared = true;
  const whiteLine = new THREE.MeshStandardMaterial({
    color: 0xf2f4f6,
    roughness: 0.55,
    emissive: 0x222428,
    emissiveIntensity: 0.15,
  });
  const yellowLine = new THREE.MeshStandardMaterial({
    color: 0xf0c93d,
    roughness: 0.5,
    emissive: 0x4a3a08,
    emissiveIntensity: 0.2,
  });
  const curb = new THREE.MeshStandardMaterial({
    color: 0xb0b6be,
    roughness: 0.9,
  });
  const sidewalk = new THREE.MeshStandardMaterial({
    color: 0xa8b0ba,
    roughness: 0.95,
  });

  for (const road of roads) {
    if (road.path.length < 2) continue;
    const isPath =
      road.highway === "footway" ||
      road.highway === "path" ||
      road.highway === "pedestrian" ||
      road.highway === "cycleway";

    if (isPath) {
      const mesh = ribbonMesh(road.path, Math.max(road.width, 2.2), 0.05);
      mesh.material = sidewalk;
      mesh.receiveShadow = true;
      group.add(mesh);
      continue;
    }

    // 차도 본체
    const w = Math.max(road.width, 6.5);
    const roadMesh = ribbonMesh(road.path, w, 0.06);
    roadMesh.material = asphalt;
    roadMesh.receiveShadow = true;
    group.add(roadMesh);

    // 연석(살짝 넓은 보도)
    if (w >= 7) {
      const walk = ribbonMesh(road.path, w + 3.2, 0.045);
      walk.material = curb;
      walk.receiveShadow = true;
      group.add(walk);
      // 보도를 도로 아래로 깔고 도로를 다시 올려 보이게 — 이미 도로가 위
    }

    // 중앙선
    if (w >= 8) {
      const center = ribbonMesh(road.path, 0.18, 0.09);
      center.material =
        road.highway === "primary" ||
        road.highway === "trunk" ||
        road.highway === "motorway"
          ? yellowLine
          : whiteLine;
      group.add(center);
    }

    // 차선(양옆 점선 근사 — 얇은 연속선)
    if (w >= 10) {
      const laneOff = w * 0.22;
      const left = offsetPath(road.path, laneOff);
      const right = offsetPath(road.path, -laneOff);
      const l = ribbonMesh(left, 0.12, 0.088);
      const r = ribbonMesh(right, 0.12, 0.088);
      l.material = whiteLine;
      r.material = whiteLine;
      group.add(l, r);
    }
  }

  return group;
}

function offsetPath(path, dist) {
  const out = [];
  for (let i = 0; i < path.length; i++) {
    const prev = path[Math.max(0, i - 1)];
    const next = path[Math.min(path.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    out.push({ x: path[i].x + nx * dist, z: path[i].z + nz * dist });
  }
  return out;
}

function ribbonMesh(path, width, y) {
  const half = width / 2;
  const left = [];
  const right = [];

  for (let i = 0; i < path.length; i++) {
    const prev = path[Math.max(0, i - 1)];
    const next = path[Math.min(path.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    left.push({ x: path[i].x + nx * half, z: path[i].z + nz * half });
    right.push({ x: path[i].x - nx * half, z: path[i].z - nz * half });
  }

  const verts = [];
  const norms = [];
  const idx = [];

  for (let i = 0; i < path.length; i++) {
    verts.push(left[i].x, y, left[i].z, right[i].x, y, right[i].z);
    norms.push(0, 1, 0, 0, 1, 0);
  }
  for (let i = 0; i < path.length - 1; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    idx.push(a, b, c, b, d, c);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(norms, 3));
  geo.setIndex(idx);
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial());
}

export function createFlatPolygons(items, colorOrMat, y = 0.02) {
  const group = new THREE.Group();
  const mat =
    colorOrMat?.isMaterial
      ? colorOrMat
      : new THREE.MeshStandardMaterial({
          color: colorOrMat ?? 0x3f7a4e,
          roughness: 0.9,
          metalness: 0.02,
          side: THREE.DoubleSide,
        });

  for (const item of items) {
    if (item.footprint.length < 3) continue;
    try {
      const shape = shapeFromRing(item.footprint);
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = y;
      mesh.receiveShadow = true;
      group.add(mesh);
    } catch {
      /* skip */
    }
  }
  return group;
}

export function createParkGroup(items, sharedGrassMat) {
  const grass = sharedGrassMat || createGrassMaterial();
  grass.userData.shared = true;
  return createFlatPolygons(items, grass, 0.03);
}

export function createWaterGroup(items, sharedWaterMat) {
  const group = new THREE.Group();
  group.name = "water";
  const mat = sharedWaterMat || createWaterMaterial();

  for (const item of items) {
    if (item.footprint.length < 3) continue;
    try {
      const shape = shapeFromRing(item.footprint);
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = 0.08;
      group.add(mesh);
    } catch {
      /* skip */
    }
  }
  return group;
}

export function disposeObject3D(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (Array.isArray(o.material))
        o.material.forEach((m) => {
          if (!m.userData?.shared) m.dispose();
        });
      else if (!o.material.userData?.shared) o.material.dispose();
    }
  });
}
