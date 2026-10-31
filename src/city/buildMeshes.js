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

function facadeColor(type, height) {
  const palette = {
    apartments: 0xd5dde8,
    residential: 0xe0e6ee,
    commercial: 0xc5d0de,
    office: 0xa8bdd4,
    retail: 0xd8cfc0,
    yes: 0xc8d2de,
  };
  const base = new THREE.Color(palette[type] || 0xb8c4d0);
  const t = Math.min(height / 140, 1);
  base.lerp(new THREE.Color(0x6e8fad), t * 0.4);
  return base;
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
      const shape = shapeFromRing(b.footprint);
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: Math.max(b.height, 3),
        bevelEnabled: true,
        bevelThickness: 0.35,
        bevelSize: 0.25,
        bevelSegments: 1,
      });
      geo.rotateX(-Math.PI / 2);

      const color = facadeColor(b.type, b.height);
      const pos = geo.attributes.position;
      const col = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const shade = 0.78 + 0.22 * Math.min(y / Math.max(b.height, 1), 1);
        col[i * 3] = color.r * shade;
        col[i * 3 + 1] = color.g * shade;
        col[i * 3 + 2] = color.b * shade;
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

  // 옥상 디테일 (기계실·난간 느낌)
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x3a414a,
    roughness: 0.7,
    metalness: 0.25,
  });
  let roofCount = 0;
  for (const b of buildings) {
    if (b.height < 20 || roofCount > 80) continue;
    const cx = b.footprint.reduce((s, p) => s + p.x, 0) / b.footprint.length;
    const cz = b.footprint.reduce((s, p) => s + p.z, 0) / b.footprint.length;
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(4 + (roofCount % 3), 2.2, 3.5),
      roofMat,
    );
    box.position.set(cx + 1.5, b.height + 1.1, cz - 1);
    box.castShadow = true;
    group.add(box);
    roofCount += 1;
  }

  return { group, colliders, count: buildings.length };
}

export function createRoadsGroup(roads, sharedAsphaltMat) {
  const group = new THREE.Group();
  group.name = "roads";

  const asphalt = sharedAsphaltMat || createAsphaltMaterial();
  if (!asphalt.userData) asphalt.userData = {};
  asphalt.userData.shared = true;
  const lane = new THREE.MeshStandardMaterial({
    color: 0xf0e2a8,
    roughness: 0.55,
    metalness: 0.1,
    emissive: 0x3a3410,
    emissiveIntensity: 0.08,
  });
  const sidewalk = new THREE.MeshStandardMaterial({
    color: 0x9aa3ad,
    roughness: 0.95,
  });

  for (const road of roads) {
    if (road.path.length < 2) continue;
    const isPath =
      road.highway === "footway" ||
      road.highway === "path" ||
      road.highway === "pedestrian" ||
      road.highway === "cycleway";

    const mesh = ribbonMesh(road.path, road.width, isPath ? 0.05 : 0.08);
    mesh.material = isPath ? sidewalk : asphalt;
    mesh.receiveShadow = true;
    group.add(mesh);

    if (!isPath && road.width >= 6) {
      const center = ribbonMesh(road.path, 0.22, 0.1);
      center.material = lane;
      group.add(center);
    }
  }

  return group;
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
      // ShapeGeometry UVs for shader
      geo.computeBoundingBox();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = 0.08;
      group.add(mesh);
    } catch {
      /* skip */
    }
  }
  return group;
}

export function createGround(size = 5000) {
  const geo = new THREE.PlaneGeometry(size, size, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x1c2830,
    roughness: 1,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.position.y = 0;
  return mesh;
}

export function disposeObject3D(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (Array.isArray(o.material)) o.material.forEach((m) => {
        if (!m.userData?.shared) m.dispose();
      });
      else if (!o.material.userData?.shared) o.material.dispose();
    }
  });
}
