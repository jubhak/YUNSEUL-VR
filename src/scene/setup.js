import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { VRButton } from "three/addons/webxr/VRButton.js";
import { LOOK } from "../config.js";
import { createAtmosphere } from "./atmosphere.js";

export function createScene(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xc3d4de);
  scene.fog = new THREE.FogExp2(0xc3d4de, 0.00017);
  const camera = new THREE.PerspectiveCamera(LOOK.fovDefault,innerWidth/innerHeight,0.25,8000);
  const renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:"high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
  renderer.setSize(innerWidth,innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.72;
  renderer.xr.enabled = true;
  container.appendChild(renderer.domElement);
  const vrButton = VRButton.createButton(renderer);
  Object.assign(vrButton.style,{position:"fixed",bottom:"74px",left:"20px",zIndex:"15"});
  document.body.appendChild(vrButton);
  if (!navigator.xr) vrButton.style.display="none";
  else navigator.xr.isSessionSupported("immersive-vr").then(supported => {
    if (!supported) vrButton.style.display="none";
  }).catch(() => { vrButton.style.display="none"; });

  const sky = new Sky();
  sky.scale.setScalar(6500);
  sky.renderOrder=-1000;
  const uniforms = sky.material.uniforms;
  uniforms.turbidity.value = 3.2;
  uniforms.rayleigh.value = 2.1;
  uniforms.mieCoefficient.value = 0.004;
  uniforms.mieDirectionalG.value = 0.82;
  const sunDirection = new THREE.Vector3(0.52,0.72,0.46).normalize();
  uniforms.sunPosition.value.copy(sunDirection);
  scene.add(sky);
  // PMREM gives glass and water a filtered, physically lit sky to reflect.
  const envScene = new THREE.Scene();
  const envSky = sky.clone();
  envScene.add(envSky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(envScene,0.04,0.1,8000);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.12;
  pmrem.dispose();

  const hemi = new THREE.HemisphereLight(0xc6dbed,0x797664,0.4);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2db,2.6);
  sun.position.copy(sunDirection).multiplyScalar(650);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera,{near:1,far:1500,left:-165,right:165,top:165,bottom:-165});
  sun.shadow.bias = -0.00008;
  sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 2;
  scene.add(sun,sun.target);

  const atmosphere = createAtmosphere(scene);
  function resize() {
    camera.aspect = innerWidth/innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth,innerHeight);
  }
  window.addEventListener("resize",resize);
  return {scene,camera,renderer,sun,sunDirection,skyMat:sky.material,atmosphere,
    dispose() { window.removeEventListener("resize",resize); environment.dispose(); },
  };
}
