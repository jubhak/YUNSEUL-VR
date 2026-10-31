import * as THREE from "three";
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
export function createParkDetails(city, spawn) {
  const group=new THREE.Group();group.name="central-park-details";
  const random=seededRandom(725),trees=[];
  const parks=city.parks.filter(p=>p.footprint.some(v=>Math.hypot(v.x-spawn.x,v.z-spawn.z)<1250));
  const blocked=p=>city.waters.some(w=>pointInPolygon(p,w)) || city.buildings.some(b=>pointInPolygon(p,b));
  // Geographic park polygons, not rings centered on the camera. Clear paths and waterfront views.
  placements: for(let z=spawn.z-850;z<spawn.z+850;z+=20) for(let x=spawn.x-1000;x<spawn.x+700;x+=20) {
    const p={x:x+random()*13,z:z+random()*13};
    if (Math.hypot(p.x-spawn.x,p.z-spawn.z)<17 || random()>0.62) continue;
    if (!parks.some(park=>pointInPolygon(p,park)) || blocked(p)) continue;
    if (city.roads.some(road=>distanceToRoad(p,road)<road.width/2+3)) continue;
    trees.push(p);
    if(trees.length>=380)break placements;
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
  // Benches only beside mapped walkways, never inside water or road carriageways.
  const paths=city.roads.filter(r=>["footway","path","pedestrian"].includes(r.highway));
  const wood=new THREE.MeshStandardMaterial({color:0x65503a,roughness:0.89});
  const metal=new THREE.MeshStandardMaterial({color:0x373f3e,roughness:0.75,metalness:0.4});
  let count=0;
  for(const path of paths) {
    if(count>=34)break;
    const a=path.path[0],b=path.path[1];if(!a||!b)continue;
    const len=Math.hypot(b.x-a.x,b.z-a.z);if(len<12)continue;
    const p={x:a.x-(b.z-a.z)/len*(path.width/2+1.4),z:a.z+(b.x-a.x)/len*(path.width/2+1.4)};
    if(Math.hypot(p.x-spawn.x,p.z-spawn.z)>520 || blocked(p) || !parks.some(park=>pointInPolygon(p,park)))continue;
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
  return group;
}
