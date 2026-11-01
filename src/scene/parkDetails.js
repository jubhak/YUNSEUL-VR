import * as THREE from 'three';
import { pointInPolygon } from "../city/parseOsm.js";
import { createTrees, seededRandom } from "./trees.js";

function segmentDistance(p,a,b) {
  const dx=b.x-a.x,dz=b.z-a.z,den=dx*dx+dz*dz;
  const t=den ? Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/den)) : 0;
  return Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);
}
export function distanceToRoad(p,road) {
  let distance=Infinity;
  for(let i=1;i<road.path.length;i++) distance=Math.min(distance,segmentDistance(p,road.path[i-1],road.path[i]));
  return distance;
}

const bronze = () => new THREE.MeshStandardMaterial({ color: 0x8d6a3c, roughness: 0.48, metalness: 0.62 });
const paleStone = () => new THREE.MeshStandardMaterial({ color: 0xc3bcae, roughness: 0.82 });
const darkSteel = () => new THREE.MeshStandardMaterial({ color: 0x3d4442, roughness: 0.55, metalness: 0.5 });
const stainless = () => new THREE.MeshStandardMaterial({ color: 0xb9c2c6, roughness: 0.25, metalness: 0.85 });

/** Deterministic 0..1 from an OSM id, so the park looks the same on every load. */
function hashOf(id) {
  const n = Math.sin(Number(String(id).replace(/\D/g, '') || 7) * 12.9898) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Four park-sculpture families observed inside Songdo Central Park
 * (totem poles, trumpet/horn forms, mask clusters, cat & figure pieces).
 * Silhouette-level procedural approximations — not replicas of the artworks.
 */
export function sculpture(kind, seed) {
  const g = new THREE.Group();
  const add = mesh => { mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); return mesh; };
  if (kind === 'totem') {
    const m = bronze();
    let y = 0;
    for (let i = 0; i < 5; i++) {
      const w = 0.9 * (0.72 + 0.32 * ((Math.sin(seed * 9 + i) + 1) / 2));
      const block = add(new THREE.Mesh(new THREE.BoxGeometry(w, 1.15, w * 0.85), m));
      block.position.y = y + 0.575;
      block.rotation.y = (seed * 3 + i) * 0.22;
      y += 1.12;
      const ring = add(new THREE.Mesh(new THREE.TorusGeometry(w * 0.54, 0.055, 6, 14), stainless()));
      ring.rotation.x = Math.PI / 2; ring.position.y = y; g.add(ring);
      y += 0.08;
    }
    const crown = add(new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.5, 5), bronze()));
    crown.position.y = y + 0.7;
  } else if (kind === 'horn') {
    // Flared trumpet / 나팔 form leaning out of the lawn.
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      pts.push(new THREE.Vector2(0.16 + 0.92 * Math.pow(t, 3.1), t * 4.2));
    }
    const horn = add(new THREE.Mesh(new THREE.LatheGeometry(pts, 26), bronze()));
    horn.rotation.z = 0.36 + seed * 0.22;
    horn.rotation.y = seed * Math.PI * 2;
    horn.position.y = 0.15;
    const mouth = add(new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.07, 8, 24), stainless()));
    mouth.position.set(Math.sin(0.36 + seed * 0.22) * 4.1, Math.cos(0.36 + seed * 0.22) * 4.1 + 0.15, 0);
    mouth.rotation.y = Math.PI / 2; mouth.rotation.x = 0.36;
  } else if (kind === 'masks') {
    // 'Faces of the Global Village' — clustered mask panels.
    const count = 7 + Math.floor(seed * 4);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const r = 1.2 + (i % 3) * 0.75;
      const face = add(new THREE.Mesh(new THREE.SphereGeometry(0.55 + (i % 2) * 0.14, 16, 12), paleStone()));
      face.scale.set(1, 1.24, 0.42);
      face.position.set(Math.cos(a) * r, 1.5 + (i % 4) * 0.85, Math.sin(a) * r);
      face.rotation.y = -a + Math.PI / 2;
      for (const ex of [-0.17, 0.17]) {
        const eye = add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), darkSteel()));
        eye.position.set(Math.cos(a) * r + Math.cos(face.rotation.y) * ex, face.position.y + 0.1, Math.sin(a) * r - Math.sin(face.rotation.y) * ex);
      }
    }
  } else if (kind === 'figure') {
    const m = darkSteel();
    const body = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.5, 8, 14), m));
    body.position.y = 1.5; body.rotation.z = 0.18;
    const head = add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), m));
    head.position.set(-0.28, 2.75, 0);
    const tail = add(new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.08, 8, 24, Math.PI * 1.25), m));
    tail.position.set(0.85, 1.35, 0); tail.rotation.y = Math.PI / 2; tail.rotation.z = 0.6;
    for (const [x, z] of [[-0.35, -0.4], [-0.35, 0.4], [0.45, -0.38], [0.45, 0.38]]) {
      const leg = add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 1.1, 8), m));
      leg.position.set(x, 0.55, z);
    }
  } else {
    const a = add(new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.19, 12, 40), stainless()));
    a.position.y = 2.2; a.rotation.x = 0.35 + seed * 0.5;
    const b = add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.2, 0.5), paleStone()));
    b.position.y = 1.6;
  }
  return g;
}

function kindFor(artwork, seed) {
  const name = artwork.name || '';
  if (/나팔|트럼펫|horn|trumpet/i.test(name)) return 'horn';
  if (/토템|totem/i.test(name)) return 'totem';
  if (/얼굴|가면|Faces|mask/i.test(name)) return 'masks';
  if (/고양이|포옹|기지개|사람|figure/i.test(name)) return 'figure';
  return seed < 0.34 ? 'totem' : seed < 0.62 ? 'horn' : seed < 0.82 ? 'ring' : 'figure';
}

export function createParkDetails(city, spawn) {
  const group=new THREE.Group();group.name="central-park-details";
  const random=seededRandom(725),trees=[];
  const parks=city.parks.filter(p=>p.footprint.some(v=>Math.hypot(v.x-spawn.x,v.z-spawn.z)<1600));
  const blocked=p=>city.waters.some(w=>pointInPolygon(p,w)) || city.buildings.some(b=>pointInPolygon(p,b));
  // Geographic park polygons, not rings centered on the camera. Clear paths and waterfront views.
  placements: for(let z=spawn.z-1100;z<spawn.z+1100;z+=19) for(let x=spawn.x-1300;x<spawn.x+900;x+=19) {
    const p={x:x+random()*13,z:z+random()*13};
    if (Math.hypot(p.x-spawn.x,p.z-spawn.z)<17 || random()>0.62) continue;
    if (!parks.some(park=>pointInPolygon(p,park)) || blocked(p)) continue;
    if (city.roads.some(road=>distanceToRoad(p,road)<road.width/2+3)) continue;
    trees.push(p);
    if(trees.length>=520)break placements;
  }
  group.add(createTrees(trees));
  // Low stone coping traces the real water edge. It is not a fabricated circular canal.
  const copingMat=new THREE.MeshStandardMaterial({color:0x9d9c8e,roughness:0.91});
  const edges=[];
  for(const water of city.waters) for(const ring of [water.footprint,...(water.holes||[])]) {
    for(let i=1;i<ring.length;i++) {
      const a=ring[i-1],b=ring[i],length=Math.hypot(b.x-a.x,b.z-a.z);
      if(length>0.2)edges.push({a,b,length});
    }
  }
  const edging=new THREE.InstancedMesh(new THREE.BoxGeometry(1,0.28,0.55),copingMat,edges.length);
  const dummy=new THREE.Object3D();
  edges.forEach(({a,b,length},i)=>{
    dummy.position.set((a.x+b.x)/2,0.12,(a.z+b.z)/2);
    dummy.rotation.set(0,-Math.atan2(b.z-a.z,b.x-a.x),0);
    dummy.scale.set(length+0.04,1,1);dummy.updateMatrix();edging.setMatrixAt(i,dummy.matrix);
  });
  edging.castShadow=true;edging.receiveShadow=true;edging.computeBoundingSphere();group.add(edging);

  // Sculptures go on their registered OSM artwork positions, if that spot is clear of water/buildings.
  let sculptures = 0;
  for (const artwork of city.artworks || []) {
    const p = artwork.position;
    if (!p) continue;
    const seed = hashOf(artwork.id);
    if (blocked(p)) continue;
    if (city.roads.some(road=>distanceToRoad(p,road)<1.6)) continue;
    const kind = kindFor(artwork, seed);
    const model = sculpture(kind, seed);
    model.position.set(p.x, 0.05, p.z);
    model.rotation.y = seed * Math.PI * 2;
    const scale = kind === 'totem' ? 1.15 : 1;
    model.scale.setScalar(scale);
    model.userData = { kind, sourceId: artwork.id, name: artwork.name || '이름 미등록 작품', accuracy: 'procedural sculpture approximation' };
    group.add(model);
    sculptures++;
    // Small interpretive plaque.
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.55, 0.08), new THREE.MeshStandardMaterial({ color: 0x2f3634, roughness: 0.7 }));
    plaque.position.set(p.x + 1.6, 0.85, p.z + 1.6); plaque.rotation.y = -0.6;
    group.add(plaque);
  }
  // Benches only beside mapped walkways, never inside water or road carriageways.
  const paths=city.roads.filter(r=>["footway","path","pedestrian"].includes(r.highway));
  const wood=new THREE.MeshStandardMaterial({color:0x65503a,roughness:0.89});
  const metal=new THREE.MeshStandardMaterial({color:0x373f3e,roughness:0.75,metalness:0.4});
  let count=0;
  for(const path of paths) {
    if(count>=48)break;
    const a=path.path[0],b=path.path[1];if(!a||!b)continue;
    const len=Math.hypot(b.x-a.x,b.z-a.z);if(len<12)continue;
    const p={x:a.x-(b.z-a.z)/len*(path.width/2+1.4),z:a.z+(b.x-a.x)/len*(path.width/2+1.4)};
    if(Math.hypot(p.x-spawn.x,p.z-spawn.z)>780 || blocked(p) || !parks.some(park=>pointInPolygon(p,park)))continue;
    const bench=new THREE.Group();bench.position.set(p.x,0,p.z);bench.rotation.y=-Math.atan2(b.z-a.z,b.x-a.x);
    for(let j=0;j<4;j++) {
      const slat=new THREE.Mesh(new THREE.BoxGeometry(1.8,0.07,0.11),wood);
      slat.position.set(0,0.48,(j-1.5)*0.13);slat.castShadow=true;bench.add(slat);
    }
    for(const x of [-0.68,0.68]) {const leg=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.45,0.48),metal);leg.position.set(x,0.23,0);leg.castShadow=true;bench.add(leg);}
    const back=new THREE.Mesh(new THREE.BoxGeometry(1.8,0.35,0.06),wood);back.position.set(0,0.78,-0.26);back.castShadow=true;bench.add(back);
    group.add(bench);count++;
  }
  group.userData.treeCount=trees.length;
  group.userData.sculptureCount=sculptures;
  return group;
}

/**
 * Places sculpture models on registered artwork nodes.
 * `city` provides the real park/water/building/road geometry used for the siting check.
 */
export function createSculptures(items, city) {
  const group = new THREE.Group();
  group.name = 'park-sculptures';
  const blocked = p => city.waters.some(w => pointInPolygon(p, w)) || city.buildings.some(b => pointInPolygon(p, b));
  let count = 0;
  for (const artwork of items || []) {
    const p = { x: artwork.x ?? artwork.position?.x, z: artwork.z ?? artwork.position?.z };
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
    if (blocked(p)) continue;
    if ((city.roads || []).some(road => distanceToRoad(p, road) < 6.5)) continue;
    const seed = hashOf(artwork.id);
    const kind = kindFor({ name: artwork.name }, seed);
    const model = sculpture(kind, seed);
    model.position.set(p.x, 0.05, p.z);
    model.rotation.y = seed * Math.PI * 2;
    model.userData = {
      kind, sourceId: artwork.id, name: artwork.name || '이름 미등록 작품',
      accuracy: 'procedural sculpture approximation',
    };
    group.add(model);
    group.userData.items = [...(group.userData.items || []), { ...model.userData, x: p.x, z: p.z }];
    count++;
  }
  group.userData.count = count;
  return group;
}
