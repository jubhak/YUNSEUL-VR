import * as THREE from "three";

// Locally generated, seamless micro-surfaces. No remote assets or API keys.
const surfaces = new Map();
function noise(x, y, seed = 0) {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}
function surface(kind) {
  if (surfaces.has(kind)) return surfaces.get(kind);
  const size = 256;
  const rgb = new Uint8Array(size * size * 4);
  const bump = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    const grain = noise(x, y, 3);
    const broad = 0.5 + 0.25 * Math.sin(x * Math.PI / 32) * Math.cos(y * Math.PI / 64);
    let c;
    if (kind === "grass") {
      const blade = grain > 0.78 ? 1.28 : 0.86;
      c = [67, 85, 40].map(v => v * (0.72 + broad * 0.45) * blade);
    } else if (kind === "paving") {
      const joint = x % 64 < 2 || (y + (Math.floor(x / 64) % 2) * 32) % 64 < 2;
      c = joint ? [103, 104, 99] : [166, 160, 145].map(v => v + grain * 16 - 8);
    } else {
      c = [57, 59, 60].map(v => v + grain * 23 - 11);
    }
    for (let k = 0; k < 3; k++) { rgb[i + k] = c[k]; bump[i + k] = grain * 255; }
    rgb[i + 3] = bump[i + 3] = 255;
  }
  const map = new THREE.DataTexture(rgb, size, size, THREE.RGBAFormat);
  const bumpMap = new THREE.DataTexture(bump, size, size, THREE.RGBAFormat);
  for (const t of [map, bumpMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 4;
    t.needsUpdate = true;
  }
  map.colorSpace = THREE.SRGBColorSpace;
  surfaces.set(kind, { map, bumpMap });
  return { map, bumpMap };
}

function worldSurface(kind, scale, roughness, bumpScale) {
  const material = new THREE.MeshStandardMaterial({
    ...surface(kind), color: 0xffffff, roughness, metalness: 0,
    bumpScale, side: THREE.DoubleSide,
  });
  // Mesh builders use several UV layouts; world-space coordinates keep texel size consistent.
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vSurfaceWorld;");
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvSurfaceWorld = (modelMatrix * vec4(position, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vSurfaceWorld;");
    const uv = `(vSurfaceWorld.xz * ${scale.toFixed(4)})`;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <map_fragment>", THREE.ShaderChunk.map_fragment.replaceAll("vMapUv", uv))
      .replace("#include <bumpmap_pars_fragment>", THREE.ShaderChunk.bumpmap_pars_fragment.replaceAll("vBumpMapUv", uv));
  };
  material.customProgramCacheKey = () => `world-surface-${kind}-${scale}`;
  return material;
}
export function createGrassMaterial() {
  const material = worldSurface("grass", 0.32, 0.98, 0.055);
  material.depthWrite = false;
  return material;
}
export function createAsphaltMaterial() { return worldSurface("asphalt", 0.5, 0.94, 0.025); }
export function createPavingMaterial() { return worldSurface("paving", 0.4, 0.91, 0.015); }

export function createFacadeMaterial() {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true, color: 0xffffff, roughness: 0.32, metalness: 0.42,
    envMapIntensity: 0.8, side: THREE.DoubleSide,
  });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vFacadeWorld;\nvarying vec3 vFacadeNormal;");
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      vFacadeWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      vFacadeNormal = normalize(mat3(modelMatrix) * normal);`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
      varying vec3 vFacadeWorld;
      varying vec3 vFacadeNormal;
      float paneHash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float paneMask;
      float facadeCell(vec2 uv, vec2 border) {
        vec2 f = fract(uv); vec2 aa = max(fwidth(uv), vec2(0.001));
        vec2 edge = smoothstep(border-aa, border+aa, f) * (1.0-smoothstep(1.0-border-aa, 1.0-border+aa, f));
        return edge.x * edge.y;
      }`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
      float sideWall = 1.0 - smoothstep(0.3, 0.8, abs(vFacadeNormal.y));
      float u = abs(vFacadeNormal.x) > abs(vFacadeNormal.z) ? vFacadeWorld.z : vFacadeWorld.x;
      bool tower = vColor.b > vColor.r * 1.12;
      vec2 cell = vec2(u / (tower ? 1.6 : 3.0), vFacadeWorld.y / 3.4);
      paneMask = facadeCell(cell, tower ? vec2(0.026,0.055) : vec2(0.18,0.21)) * sideWall;
      float variety = paneHash(floor(cell));
      vec3 glass = mix(vec3(0.10,0.20,0.23), vec3(0.23,0.34,0.36), variety);
      glass = mix(glass, vec3(0.28,0.25,0.19), step(0.94,variety) * 0.32);
      vec3 cladding = tower ? vec3(0.38,0.43,0.44) : diffuseColor.rgb;
      diffuseColor.rgb = mix(cladding, glass, paneMask);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.37,0.39,0.38), 1.0-sideWall);
      diffuseColor.rgb *= 0.73 + 0.27 * smoothstep(0.0,8.0,vFacadeWorld.y);`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(0.84, 0.19, paneMask);");
    shader.fragmentShader = shader.fragmentShader.replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nmetalnessFactor = mix(0.08, 0.55, paneMask);");
  };
  material.customProgramCacheKey = () => "physical-facade-v1";
  return material;
}

export function createWaterMaterial() {
  const time = { value: 0 };
  const material = new THREE.MeshPhysicalMaterial({
    color: 0x2c4d55, roughness: 0.15, metalness: 0.12,
    clearcoat: 1, clearcoatRoughness: 0.13,
    ior: 1.333, envMapIntensity: 1.1, side: THREE.DoubleSide,
  });
  material.userData.time = time;
  material.onBeforeCompile = shader => {
    shader.uniforms.waterTime = time;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWaterWorld;");
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvWaterWorld = (modelMatrix * vec4(position, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nuniform float waterTime;\nvarying vec3 vWaterWorld;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
      vec2 p = vWaterWorld.xz;
      float t = waterTime;
      vec2 slope = vec2(
        0.048*cos(dot(p,vec2(0.72,0.36))+t*0.85) + 0.027*cos(dot(p,vec2(2.1,-1.3))-t*1.45),
        0.032*cos(dot(p,vec2(0.31,0.79))-t*0.65) + 0.018*sin(dot(p,vec2(1.8,2.6))+t*1.7));
      vec3 waterNormal = normalize(vec3(-slope.x,1.0,-slope.y));
      normal = normalize(mat3(viewMatrix) * waterNormal);
`);
  };
  const originalCompile = material.onBeforeCompile;
  material.onBeforeCompile = shader => {
    originalCompile(shader);
    shader.fragmentShader = shader.fragmentShader.replace("#include <clearcoat_normal_fragment_maps>", "#include <clearcoat_normal_fragment_maps>\nclearcoatNormal = normal;");
  };
  material.customProgramCacheKey = () => "physical-water-v1";
  return material;
}

export function updateMaterialTime(material, time) {
  if (material?.userData.time) material.userData.time.value = time;
}
