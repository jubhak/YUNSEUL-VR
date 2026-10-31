import * as THREE from "three";
import { createGrassMaterial } from "../city/materials.js";

export function createAtmosphere(scene) {
  const group = new THREE.Group();
  group.name = "atmosphere";
  const grassMat = createGrassMaterial();
  grassMat.userData.shared = true;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(18000,18000),grassMat);
  ground.rotation.x = -Math.PI/2;
  ground.position.y = -0.22;
  ground.receiveShadow = true;
  ground.renderOrder = -20;
  group.add(ground);
  const cloudMat = new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,side:THREE.DoubleSide,
    uniforms:{time:{value:0}},
    vertexShader:`varying vec3 vWorld; void main(){
      vec4 w = modelMatrix * vec4(position,1.0); vWorld=w.xyz;
      gl_Position=projectionMatrix*viewMatrix*w;
    }`,
    fragmentShader:`varying vec3 vWorld; uniform float time;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      float fbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.03+7.3;a*=0.5;}return v;}
      void main(){
        vec2 p=vWorld.xz*0.00065+vec2(time*0.001,0.0);
        float n=fbm(p),edge=smoothstep(0.48,0.7,n);
        float fade=1.0-smoothstep(2500.0,8000.0,length(vWorld.xz-cameraPosition.xz));
        vec3 c=mix(vec3(0.73,0.79,0.83),vec3(1.0),smoothstep(0.5,0.8,n));
        gl_FragColor=vec4(c,edge*fade*0.77);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const clouds = new THREE.Mesh(new THREE.PlaneGeometry(20000,20000),cloudMat);
  clouds.rotation.x=-Math.PI/2; clouds.position.y=1150;
  group.add(clouds);
  scene.add(group);
  return {group,grassMat,update(dt,time) {cloudMat.uniforms.time.value=time;}};
}
