import * as THREE from 'three';
import { COAST } from '../config.js';
import { createPavingMaterial, createWaterMaterial, updateMaterialTime } from '../city/materials.js';

/**
 * Waterfront layer built from real OSM data that the tiled city pipeline drops:
 * natural=coastline and the Incheon Bridge carriageway.
 * Sea / sand / promenade / jogging lane are offset from the surveyed coastline,
 * never drawn as an invented circle.
 */

function perpNormal(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
  let nx = -dz / len, nz = dx / len;
  // Seaward = the side farther from Songdo's built centre.
  const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
  if (Math.hypot(mx + nx * 120, mz + nz * 120) < Math.hypot(mx - nx * 120, mz - nz * 120)) {
    nx = -nx; nz = -nz;
  }
  return { nx, nz };
}

function strip(way, from, to, y) {
  const positions = [], normals = [], indices = [];
  for (let i = 0; i < way.length; i++) {
    const a = way[Math.max(0, i - 1)], b = way[Math.min(way.length - 1, i + 1)];
    const { nx, nz } = perpNormal(a, b);
    const p = way[i];
    positions.push(p.x + nx * from, y, p.z + nz * from, p.x + nx * to, y, p.z + nz * to);
    normals.push(0, 1, 0, 0, 1, 0);
  }
  for (let i = 0; i < way.length - 1; i++) {
    const o = i * 2;
    indices.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setIndex(indices);
  return geo;
}

function mergeLike(geometries) {
  const positions = [], normals = [], indices = [];
  let offset = 0;
  for (const geo of geometries) {
    const pos = geo.attributes.position.array, nor = geo.attributes.normal.array;
    for (let i = 0; i < pos.length; i++) { positions.push(pos[i]); normals.push(nor[i]); }
    const idx = geo.index.array;
    for (let i = 0; i < idx.length; i++) indices.push(idx[i] + offset);
    offset += pos.length / 3;
    geo.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setIndex(indices);
  merged.computeBoundingSphere();
  return merged;
}

function pathLength(line) {
  let total = 0;
  for (let i = 1; i < line.length; i++) total += Math.hypot(line[i].x - line[i - 1].x, line[i].z - line[i - 1].z);
  return total;
}
function pointAt(line, distance) {
  let travelled = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (travelled + len >= distance) {
      const t = len ? (distance - travelled) / len : 0;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    }
    travelled += len;
  }
  return line.at(-1);
}

function createSea(coastWays, material) {
  const group = new THREE.Group();
  group.name = 'yellow-sea';
  const geo = mergeLike(coastWays.map(w => strip(w, 0, COAST.seaWidthM, COAST.seaY)));
  const sea = new THREE.Mesh(geo, material);
  sea.name = 'sea-surface';
  sea.renderOrder = -17;
  sea.receiveShadow = true;
  group.add(sea);

  const sandMat = new THREE.MeshStandardMaterial({ color: 0xcabfa4, roughness: 0.95 });
  const pavingMat = createPavingMaterial();
  const jogMat = new THREE.MeshStandardMaterial({ color: 0x8d5a45, roughness: 0.86 });

  const sand = new THREE.Mesh(mergeLike(coastWays.map(w => strip(w, 1, COAST.promenadeOffsetM * 0.62, 0.05))), sandMat);
  sand.receiveShadow = true; group.add(sand);

  const promenade = new THREE.Mesh(
    mergeLike(coastWays.map(w => strip(w, COAST.promenadeOffsetM * 0.6, COAST.promenadeOffsetM + COAST.promenadeWidthM, 0.09))),
    pavingMat,
  );
  promenade.receiveShadow = true; group.add(promenade);

  // Jogging lane: painted strip along the promenade, matching the seaside running route.
  const jogging = new THREE.Mesh(
    mergeLike(coastWays.map(w => strip(w, COAST.promenadeOffsetM + COAST.promenadeWidthM + 0.6, COAST.promenadeOffsetM + COAST.promenadeWidthM + 3.4, 0.11))),
    jogMat,
  );
  jogging.receiveShadow = true; group.add(jogging);

  // Lamp posts and railing along the promenade.
  const lampPoints = [];
  const railPoints = [];
  for (const way of coastWays) {
    const total = pathLength(way);
    for (let d = 0; d < total; d += 32) {
      const p = pointAt(way, d);
      const q = pointAt(way, Math.min(total, d + 1));
      const { nx, nz } = perpNormal(p, q);
      lampPoints.push({ x: p.x + nx * (COAST.promenadeOffsetM + 1.2), z: p.z + nz * (COAST.promenadeOffsetM + 1.2) });
      railPoints.push({ x: p.x + nx * 2.6, z: p.z + nz * 2.6 });
    }
  }
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x394042, roughness: 0.6, metalness: 0.5 });
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.11, 0.15, 5.2, 6), poleMat, lampPoints.length);
  const heads = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.34, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xfff1d2, emissive: 0xffdca8, emissiveIntensity: 2.4, roughness: 0.4 }),
    lampPoints.length,
  );
  const dummy = new THREE.Object3D();
  lampPoints.forEach((p, i) => {
    dummy.position.set(p.x, 2.6, p.z); dummy.updateMatrix(); poles.setMatrixAt(i, dummy.matrix);
    dummy.position.set(p.x, 5.3, p.z); dummy.updateMatrix(); heads.setMatrixAt(i, dummy.matrix);
  });
  poles.computeBoundingSphere(); heads.computeBoundingSphere();
  group.add(poles, heads);

  const railGeo = new THREE.BoxGeometry(0.08, 1.0, 1);
  const rails = new THREE.InstancedMesh(railGeo, poleMat, railPoints.length);
  railPoints.forEach((p, i) => {
    dummy.position.set(p.x, 0.6, p.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
    dummy.updateMatrix(); rails.setMatrixAt(i, dummy.matrix);
  });
  rails.computeBoundingSphere(); group.add(rails);
  dummy.rotation.set(0, 0, 0);

  return { group, sea, promenadePoints: lampPoints };
}

function createBridge(data) {
  const group = new THREE.Group();
  group.name = 'incheon-bridge';
  const concrete = new THREE.MeshStandardMaterial({ color: 0xb6bcc0, roughness: 0.82, metalness: 0.1 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xd8dee2, roughness: 0.45, metalness: 0.55 });
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x4a4d50, roughness: 0.9 });

  const longest = data.ways.slice().sort((a, b) => pathLength(b) - pathLength(a))[0];
  const deckY = data.deckY ?? COAST.bridgeDeckY;
  const halfWidth = (data.deckWidth ?? 31.4) / 2;

  const segments = data.ways.filter(w => w.length > 1);
  const geos = [];
  for (const way of segments) {
    const total = pathLength(way);
    for (let i = 1; i < way.length; i++) {
      const a = way[i - 1], b = way[i];
      const { nx, nz } = perpNormal(a, b);
      const y0 = deckY, y1 = deckY;
      geos.push((() => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute([
          a.x + nx * halfWidth, y0, a.z + nz * halfWidth,
          a.x - nx * halfWidth, y0, a.z - nz * halfWidth,
          b.x + nx * halfWidth, y1, b.z + nz * halfWidth,
          b.x - nx * halfWidth, y1, b.z - nz * halfWidth,
        ], 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
        g.setIndex([0, 2, 1, 1, 2, 3]);
        return g;
      })());
      // Deck soffit (the shallow box girder silhouette seen from Songdo).
      geos.push((() => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute([
          a.x + nx * halfWidth, y0 - 3.2, a.z + nz * halfWidth,
          b.x + nx * halfWidth, y1 - 3.2, b.z + nz * halfWidth,
          a.x + nx * halfWidth, y0, a.z + nz * halfWidth,
          b.x + nx * halfWidth, y1, b.z + nz * halfWidth,
        ], 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute([nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz], 3));
        g.setIndex([0, 1, 2, 2, 1, 3]);
        return g;
      })());
      void total;
    }
  }
  if (geos.length) group.add(new THREE.Mesh(mergeLike(geos), asphalt));

  // Pylons: reverse-Y concrete masts with fan stays.
  const stayPositions = [];
  const cableTop = deckY + (data.mastHeight ?? 238.5) - 8;
  for (const pylon of data.pylons || []) {
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(7, deckY + 34, 7), concrete);
      leg.position.set(pylon.x + side * 10, (deckY + 34) / 2, pylon.z);
      group.add(leg);
    }
    const mastBottom = deckY + 34;
    const mast = new THREE.Mesh(new THREE.BoxGeometry(9, cableTop - mastBottom, 9), concrete);
    mast.position.set(pylon.x, (mastBottom + cableTop) / 2 - 8, pylon.z);
    group.add(mast);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(11, 5, 11), concrete);
    cap.position.set(pylon.x, cableTop, pylon.z);
    group.add(cap);
    if (longest) {
      const center = pathLength(longest);
      for (let k = 1; k <= 14; k++) {
        for (const dir of [-1, 1]) {
          const anchor = pointAt(longest, (data.mainSpan ?? 800) / 2 + k * 26 * (center > 1600 ? 1 : 1) * (dir > 0 ? 1 : -1) + Math.max(0, center - (data.mainSpan ?? 800)) / 2);
          if (!anchor) continue;
          stayPositions.push(pylon.x, cableTop - 10 - k * 1.2, pylon.z, anchor.x, deckY + 1.2, anchor.z);
        }
      }
    }
  }
  if (stayPositions.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(stayPositions, 3));
    group.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xe8eef2, transparent: true, opacity: 0.85 })));
  }

  // Piers down into the sea.
  if (longest) {
    const total = pathLength(longest);
    for (let d = 40; d < total; d += 90) {
      const p = pointAt(longest, d);
      const pier = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 4.4, deckY, 10), concrete);
      pier.position.set(p.x, deckY / 2, p.z);
      group.add(pier);
    }
  }
  group.userData = { deckY, mastHeight: data.mastHeight ?? 238.5, mainSpan: data.mainSpan ?? 800 };
  return group;
}

export async function createWaterfront({ baseUrl = '/', player, scene }) {
  const load = name => fetch(`${baseUrl}data/${name}.json`).then(r => {
    if (!r.ok) throw new Error(`${name}.json ${r.status}`);
    return r.json();
  });
  const [coast, bridge] = await Promise.all([load('coastline'), load('incheon-bridge')]);
  const group = new THREE.Group();
  group.name = 'waterfront';

  const seaMat = createWaterMaterial();
  seaMat.userData.shared = true;
  const sea = createSea(coast.ways, seaMat);
  group.add(sea.group);
  group.add(createBridge(bridge));

  const destinations = [];
  if (sea.promenadePoints.length) {
    const nearest = sea.promenadePoints.reduce((best, p) =>
      (Math.hypot(p.x - player.position.x, p.z - player.position.z) < Math.hypot(best.x - player.position.x, best.z - player.position.z) ? p : best));
    destinations.unshift({
      id: 'waterfront-jog', name: '해안 산책·조깅 코스', position: nearest, arrival: nearest,
    });
  }
  const pylon = (bridge.pylons || [])[0];
  if (pylon) {
    let best = null, dist = Infinity;
    for (const p of sea.promenadePoints) {
      const d = Math.hypot(p.x - pylon.x, p.z - pylon.z);
      if (d < dist) { dist = d; best = p; }
    }
    if (best) destinations.push({ id: 'incheon-bridge-view', name: '인천대교 전망 산책로', position: { x: pylon.x, z: pylon.z }, arrival: best });
  }

  return {
    group,
    platforms: [],
    destinations,
    update(time) { updateMaterialTime(seaMat, time); },
    dispose() { scene.remove(group); },
  };
}
