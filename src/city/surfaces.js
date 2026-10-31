import * as THREE from 'three';
import { SONGDO } from '../config.js';
import { createFlatPolygons } from './buildMeshes.js';
import { pointInPolygon } from './parseOsm.js';

export function createExplorationGround(projector) {
  const group=new THREE.Group();group.name='continuous-exploration-ground';
  const sw=projector.project(SONGDO.bbox.west,SONGDO.bbox.south);
  const ne=projector.project(SONGDO.bbox.east,SONGDO.bbox.north);
  // Neutral ground guarantees continuity between independently loaded map tiles.
  // This is not a claim of a surveyed coastline/terrain model.
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(60000,60000),new THREE.MeshStandardMaterial({color:0xb3b5aa,roughness:1}));
  ground.renderOrder=-21;ground.material.depthWrite=false;
  ground.rotation.x=-Math.PI/2;ground.position.set((sw.x+ne.x)/2,-0.03,(sw.z+ne.z)/2);ground.receiveShadow=true;
  group.add(ground);return group;
}
export function createMappedDetails(city) {
  const group=new THREE.Group();group.name='mapped-parking-and-artwork-locations';
  const parking=city.parking||[];
  if(parking.length) {
    group.add(createFlatPolygons(parking,0x707875,0.145));
    const lines=[];
    for(const area of parking) {
      // Bay stripes are illustrative. Only mapped parking polygons are filled.
      const minX=Math.min(...area.footprint.map(p=>p.x)),maxX=Math.max(...area.footprint.map(p=>p.x));
      const minZ=Math.min(...area.footprint.map(p=>p.z)),maxZ=Math.max(...area.footprint.map(p=>p.z));
      let count=0;
      for(let z=minZ+2;z<maxZ-5;z+=16)for(let x=minX+2;x<maxX-3;x+=2.6) {
        if(count>500)break;
        const a={x,z},b={x,z:z+5};
        if(!pointInPolygon(a,area)||!pointInPolygon(b,area))continue;
        if(city.buildings.some(building=>pointInPolygon(a,building)||pointInPolygon(b,building)))continue;
        lines.push(a.x,0.153,a.z,b.x,0.153,b.z);count++;
      }
    }
    if(lines.length) {
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(lines,3));
      group.add(new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0xd8dbd6})));
    }
  }
  // Small map markers identify real registered artworks; they are NOT fake replicas of sculptures.
  if(city.artworks?.length) {
    const material=new THREE.MeshStandardMaterial({color:0x7099a4,roughness:0.6});
    const markers=new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2,0.2,0.65,8),material,city.artworks.length);
    const dummy=new THREE.Object3D();
    city.artworks.forEach((a,i)=>{dummy.position.set(a.position.x,0.325,a.position.z);dummy.updateMatrix();markers.setMatrixAt(i,dummy.matrix);});
    markers.userData={meaning:'Mapped artwork location only; sculpture geometry not available',artworks:city.artworks};
    markers.computeBoundingSphere();group.add(markers);
  }
  return group;
}
