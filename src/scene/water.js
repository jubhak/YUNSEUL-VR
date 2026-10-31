import * as THREE from "three";
import { Water } from "three/addons/objects/Water.js";
import { updateMaterialTime } from "../city/materials.js";

function waterNormals() {
  const size=128, data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const u=x/size*Math.PI*2,v=y/size*Math.PI*2;
    const dx=0.19*Math.cos(u*5+v*3)+0.07*Math.sin(u*13-v*7);
    const dz=0.18*Math.sin(u*3-v*5)+0.07*Math.cos(v*11+u*9);
    const n=new THREE.Vector3(dx,dz,1).normalize(),i=(y*size+x)*4;
    data[i]=(n.x*0.5+0.5)*255;data[i+1]=(n.y*0.5+0.5)*255;data[i+2]=(n.z*0.5+0.5)*255;data[i+3]=255;
  }
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;
  return texture;
}
function area(ring) {
  let sum=0;for(let i=0;i<ring.length;i++) {const a=ring[i],b=ring[(i+1)%ring.length];sum+=a.x*b.z-b.x*a.z;}
  return Math.abs(sum/2);
}
/** A single planar pass for the main canal; smaller ponds use the shared PBR material. */
export function installCanalReflection(group,sunDirection) {
  const candidates=group.children.filter(o=>o.userData.waterPolygon);
  candidates.sort((a,b)=>area(b.userData.waterPolygon.footprint)-area(a.userData.waterPolygon.footprint));
  const main=candidates[0];if(!main)return {update(){},dispose(){}};
  const normals=waterNormals();
  const water=new Water(main.geometry.clone().rotateX(Math.PI/2),{
    textureWidth:768,textureHeight:768,waterNormals:normals,
    sunDirection,sunColor:0xfff4df,waterColor:0x397568,
    distortionScale:0.75,alpha:1,fog:true,clipBias:0.003,
  });
  water.name="central-canal-reflection";
  water.renderOrder=-18;
  water.rotation.x=-Math.PI/2;water.position.copy(main.position);
  water.material.uniforms.size.value=1.5;
  const reflectionMaterial=water.material,pbr=main.material;
  const reflect=water.onBeforeRender;
  water.onBeforeRender=function(renderer,scene,camera,...args) {
    if (!renderer.xr.isPresenting && this.material===reflectionMaterial) reflect.call(this,renderer,scene,camera,...args);
  };
  group.remove(main);main.geometry.dispose();group.add(water);
  return {
    water,
    update(time,isXR=false) {
      // Do not run desktop planar-camera math on an XR ArrayCamera.
      water.material=isXR ? pbr : reflectionMaterial;
      reflectionMaterial.uniforms.time.value=time*0.32;
      updateMaterialTime(pbr,time);
    },
    dispose() { reflectionMaterial.uniforms.mirrorSampler.value?.dispose();normals.dispose();reflectionMaterial.dispose(); },
  };
}
