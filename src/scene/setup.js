import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { VRButton } from "three/addons/webxr/VRButton.js";
import { LOOK } from "../config.js";
import { createAtmosphere } from "./atmosphere.js";

export function createScene(container) {
  const scene = new THREE.Scene();
  // Blue-hour sky matching the reference photograph of the Central Park canal.
  scene.background = new THREE.Color(0x8ba3bb);
  scene.fog = new THREE.FogExp2(0x93a9bf, 0.000105);
  const camera = new THREE.PerspectiveCamera(LOOK.fovDefault,innerWidth/innerHeight,0.25,14000);
  const renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:"high-performance" });
  const gl=renderer.getContext(),info=gl.getExtension('WEBGL_debug_renderer_info');
  const gpu=info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):'';
  renderer.userData={lowPower:new URLSearchParams(location.search).get('quality')==='low'||/SwiftShader|llvmpipe|Software/i.test(gpu)};
  renderer.setPixelRatio(renderer.userData.lowPower?1:Math.min(devicePixelRatio,1.75));
  renderer.setSize(innerWidth,innerHeight);
  renderer.shadowMap.enabled = !renderer.userData.lowPower;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
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
  sky.scale.setScalar(9000);
  sky.renderOrder=-1000;
  const uniforms = sky.material.uniforms;
  uniforms.turbidity.value = 5.5;
  uniforms.rayleigh.value = 2.9;
  uniforms.mieCoefficient.value = 0.006;
  uniforms.mieDirectionalG.value = 0.86;
  // Low western sun: warm light on east-facing glass, deep slate on the shaded facets.
  const sunDirection = new THREE.Vector3(0.68,0.155,0.32).normalize();
  uniforms.sunPosition.value.copy(sunDirection);
  scene.add(sky);
  // PMREM gives glass and water a filtered, physically lit sky to reflect.
  const envScene = new THREE.Scene();
  const envSky = sky.clone();
  envScene.add(envSky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(envScene,0.04,0.1,9000);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.42;
  pmrem.dispose();

  const hemi = new THREE.HemisphereLight(0xa9c6e2,0x5f5c50,0.62);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffcf9e,2.75);
  sun.position.copy(sunDirection).multiplyScalar(650);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera,{near:1,far:1800,left:-210,right:210,top:210,bottom:-210});
  sun.shadow.bias = -0.00008;
  sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 2;
  scene.add(sun,sun.target);
  // Cool fill from the opposite side keeps the shaded tower facets readable rather than black.
  const fill = new THREE.DirectionalLight(0x9dbadd,0.5);
  fill.position.set(-sunDirection.x*400,220,-sunDirection.z*400);
  scene.add(fill);

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
