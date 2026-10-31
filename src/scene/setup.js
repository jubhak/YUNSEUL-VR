import * as THREE from "three";
import { VRButton } from "three/addons/webxr/VRButton.js";
import { LOOK } from "../config.js";
import { createAtmosphere } from "./atmosphere.js";

export function createScene(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x7eb8e4);
  scene.fog = new THREE.FogExp2(0xb9d9ee, 0.00034);

  const camera = new THREE.PerspectiveCamera(
    LOOK.fovDefault,
    window.innerWidth / window.innerHeight,
    0.12,
    6000,
  );

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.xr.enabled = true;
  container.appendChild(renderer.domElement);

  const vrButton = VRButton.createButton(renderer);
  vrButton.style.position = "fixed";
  vrButton.style.bottom = "88px";
  vrButton.style.left = "16px";
  vrButton.style.zIndex = "15";
  document.body.appendChild(vrButton);

  const hemi = new THREE.HemisphereLight(0xeef7ff, 0x6a8a5a, 0.85);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff3df, 1.7);
  sun.position.set(280, 420, 160);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 1200;
  sun.shadow.camera.left = -500;
  sun.shadow.camera.right = 500;
  sun.shadow.camera.top = 500;
  sun.shadow.camera.bottom = -500;
  sun.shadow.bias = -0.00025;
  scene.add(sun);
  scene.add(sun.target);

  const fill = new THREE.DirectionalLight(0xa8c8e8, 0.35);
  fill.position.set(-160, 90, -120);
  scene.add(fill);

  const skyGeo = new THREE.SphereGeometry(2800, 48, 24);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x2f74b8) },
      midColor: { value: new THREE.Color(0x7ebfe8) },
      bottomColor: { value: new THREE.Color(0xe4f3fb) },
      offset: { value: 12 },
      exponent: { value: 0.7 },
      time: { value: 0 },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      uniform float time;
      varying vec3 vWorldPosition;

      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p){
        vec2 i = floor(p); vec2 f = fract(p);
        float a=hash(i), b=hash(i+vec2(1.,0.)), c=hash(i+vec2(0.,1.)), d=hash(i+vec2(1.,1.));
        vec2 u=f*f*(3.-2.*f);
        return mix(a,b,u.x)+(c-a)*u.y*(1.-u.x)+(d-b)*u.x*u.y;
      }

      void main() {
        vec3 dir = normalize(vWorldPosition);
        float h = dir.y;
        float t = max(pow(max(h + 0.02, 0.0), exponent), 0.0);
        vec3 col = mix(bottomColor, midColor, smoothstep(0.0, 0.4, t));
        col = mix(col, topColor, smoothstep(0.3, 1.0, t));

        // soft procedural cloud layer in sky dome
        if (h > 0.05) {
          vec2 uv = dir.xz / max(h, 0.08);
          float c = noise(uv * 0.55 + time * 0.01);
          c = smoothstep(0.55, 0.78, c) * smoothstep(0.05, 0.35, h);
          col = mix(col, vec3(1.0, 1.0, 1.0), c * 0.45);
        }

        float sun = pow(max(dot(dir, normalize(vec3(0.4, 0.55, 0.2))), 0.0), 40.0);
        col += vec3(1.0, 0.93, 0.75) * sun * 0.55;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);

  const atmosphere = createAtmosphere(scene);

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener("resize", onResize);

  return {
    scene,
    camera,
    renderer,
    sun,
    skyMat,
    atmosphere,
    dispose: () => window.removeEventListener("resize", onResize),
  };
}
