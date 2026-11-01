import * as THREE from "three";

export function seededRandom(seed = 1) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
let foliage;
function foliageTexture() {
  if (foliage) return foliage;
  const canvas = document.createElement("canvas"); canvas.width=128;canvas.height=128;
  const ctx = canvas.getContext("2d"), random = seededRandom(504);
  // Alpha-cutout leaflets leave sky visible between leaves instead of solid cones.
  for (let i=0; i<76; i++) {
    const a=random()*Math.PI*2,r=Math.sqrt(random())*49;
    const x=64+Math.cos(a)*r,y=64+Math.sin(a)*r;
    const shade=172+Math.floor(random()*65);
    ctx.fillStyle=`rgb(${shade},${shade+15},${shade-15})`;
    ctx.beginPath();ctx.ellipse(x,y,5+random()*5,3+random()*3,a,0,Math.PI*2);ctx.fill();
  }
  foliage=new THREE.CanvasTexture(canvas);foliage.colorSpace=THREE.SRGBColorSpace;
  foliage.anisotropy=4;
  return foliage;
}

export function createTrees(positions, seed=71) {
  const group=new THREE.Group();group.name="park-trees";
  if (!positions.length) return group;
  const random=seededRandom(seed),dummy=new THREE.Object3D(),color=new THREE.Color();
  const trunkMaterial=new THREE.MeshStandardMaterial({color:0x605346,roughness:1});
  const leafMaterial=new THREE.MeshStandardMaterial({
    map:foliageTexture(),color:0xffffff,roughness:0.97,metalness:0,
    alphaTest:0.48,side:THREE.DoubleSide,transparent:false,
  });
  leafMaterial.userData.shared=true;
  const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13,0.25,1,7),trunkMaterial,positions.length*5);
  const leafCount=100;
  const leaves=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),leafMaterial,positions.length*leafCount);
  const up=new THREE.Vector3(0,1,0);
  let ti=0,li=0;
  function branch(a,b,radius=1) {
    const direction=new THREE.Vector3().subVectors(b,a);
    dummy.position.copy(a).add(b).multiplyScalar(0.5);
    dummy.quaternion.setFromUnitVectors(up,direction.clone().normalize());
    dummy.scale.set(radius,direction.length(),radius);dummy.updateMatrix();trunks.setMatrixAt(ti++,dummy.matrix);
  }
  for (const p of positions) {
    const h=5.5+random()*5.5,w=2.2+random()*1.5;
    branch(new THREE.Vector3(p.x,0,p.z),new THREE.Vector3(p.x,h*0.7,p.z),0.9+random()*0.5);
    for(let j=0;j<4;j++) {
      const a=j*Math.PI/2+random();
      branch(new THREE.Vector3(p.x,h*0.4,p.z),new THREE.Vector3(p.x+Math.cos(a)*w*0.65,h*0.81,p.z+Math.sin(a)*w*0.65),0.45);
    }
    const tint=random();
    for(let j=0;j<leafCount;j++) {
      const a=random()*Math.PI*2, v=random()*2-1, radius=Math.cbrt(random()),r=w*radius*Math.sqrt(1-v*v);
      dummy.position.set(p.x+Math.cos(a)*r,h*0.7+v*radius*h*0.32,p.z+Math.sin(a)*r);
      dummy.rotation.set(random()*Math.PI,random()*Math.PI*2,random()*Math.PI);
      const size=1.45+random()*0.85;dummy.scale.set(size,size,1);dummy.updateMatrix();
      leaves.setMatrixAt(li,dummy.matrix);
      color.setHSL(0.24+tint*0.06,0.34+random()*0.12,0.24+random()*0.1);
      leaves.setColorAt(li++,color);
    }
  }
  for(const mesh of [trunks,leaves]) {
    mesh.castShadow=true;mesh.receiveShadow=true;mesh.instanceMatrix.needsUpdate=true;
    mesh.computeBoundingSphere();group.add(mesh);
  }
  leaves.customDepthMaterial=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,map:foliageTexture(),alphaTest:0.48,side:THREE.DoubleSide});
  leaves.userData.depthMaterial=leaves.customDepthMaterial;
  return group;
}

export function createStreetTrees(center={x:0,z:0},count=72,radius=110) {
  const random=seededRandom(42), positions=[];
  for(let i=0;i<count;i++) {const a=i/count*Math.PI*2,r=radius+random()*12;positions.push({x:center.x+Math.cos(a)*r,z:center.z+Math.sin(a)*r});}
  return createTrees(positions);
}
