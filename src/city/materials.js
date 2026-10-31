import * as THREE from "three";

/** 송도식 커튼월 유리 파사드 */
export function createFacadeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      sunDir: { value: new THREE.Vector3(0.42, 0.88, 0.2).normalize() },
    },
    vertexColors: true,
    vertexShader: `
      varying vec3 vPos;
      varying vec3 vNormal;
      varying vec3 vColor;
      varying vec3 vView;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vPos = wp.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        vColor = color;
        vView = cameraPosition - wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 sunDir;
      varying vec3 vPos;
      varying vec3 vNormal;
      varying vec3 vColor;
      varying vec3 vView;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      void main() {
        vec3 n = normalize(vNormal);
        vec3 v = normalize(vView);
        float ndl = clamp(dot(n, sunDir), 0.0, 1.0);
        float hemi = 0.42 + 0.28 * (n.y * 0.5 + 0.5);
        float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.4);
        float vert = abs(n.y);

        vec3 col;

        if (vert > 0.72) {
          // 지붕 — 어두운 방수층 + 패널
          float panel = step(0.92, fract(vPos.x * 0.25)) + step(0.92, fract(vPos.z * 0.25));
          col = mix(vec3(0.22, 0.24, 0.27), vec3(0.3, 0.32, 0.35), clamp(panel, 0.0, 1.0));
          col *= 0.85 + 0.15 * ndl;
        } else {
          float u = abs(n.x) > abs(n.z) ? vPos.z : vPos.x;
          float yy = vPos.y;

          float floorH = 3.4;
          float floorId = floor(yy / floorH);
          float fy = fract(yy / floorH);
          float cell = 1.55;
          float fx = fract(u / cell + floorId * 0.02);
          float colId = floor(u / cell);

          // 알루미늄 멀리언 / 스팬드럴
          float mullionV = 1.0 - smoothstep(0.0, 0.035, min(fx, 1.0 - fx));
          float mullionH = 1.0 - smoothstep(0.0, 0.04, min(fy, 1.0 - fy));
          float spandrel = smoothstep(0.0, 0.06, fy) * (1.0 - smoothstep(0.12, 0.18, fy));
          float frame = clamp(mullionV + mullionH + spandrel * 0.9, 0.0, 1.0);

          float lit = hash(vec2(colId, floorId));
          lit = mix(0.25, 1.0, lit);
          lit *= 0.82 + 0.18 * sin(time * 0.25 + floorId * 0.7 + colId);

          // 스카이 컬러 반사 유리
          vec3 skyReflect = mix(vec3(0.45, 0.7, 0.92), vec3(0.85, 0.9, 0.95), fres);
          vec3 warmLit = vec3(0.95, 0.88, 0.65);
          vec3 glass = mix(skyReflect, warmLit, (1.0 - lit) * 0.35);
          glass += fres * vec3(0.4, 0.5, 0.6);

          vec3 metal = mix(vColor, vec3(0.72, 0.78, 0.84), 0.45);
          col = mix(glass, metal * 0.9, frame);

          // 하단 그림자 (지면 접촉감)
          col *= 0.72 + 0.28 * smoothstep(0.0, 18.0, yy);
        }

        vec3 h = normalize(sunDir + v);
        float spec = pow(max(dot(n, h), 0.0), 64.0) * (1.0 - vert);
        col *= hemi + ndl * 0.65;
        col += vec3(0.7, 0.8, 0.95) * spec * 0.45;
        col += fres * vec3(0.1, 0.14, 0.2) * (1.0 - vert);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

export function createWaterMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      time: { value: 0 },
      deep: { value: new THREE.Color(0x0f4f66) },
      shallow: { value: new THREE.Color(0x4ebfd6) },
    },
    vertexShader: `
      varying vec3 vWorld;
      varying vec3 vView;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vView = cameraPosition - wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 deep;
      uniform vec3 shallow;
      varying vec3 vWorld;
      varying vec3 vView;
      void main() {
        float w1 = sin(vWorld.x * 0.08 + time * 0.9);
        float w2 = cos(vWorld.z * 0.1 - time * 0.7);
        float mixv = 0.5 + 0.5 * (w1 * 0.55 + w2 * 0.45);
        vec3 col = mix(deep, shallow, mixv);
        float fres = pow(1.0 - abs(normalize(vView).y), 2.5);
        col = mix(col, vec3(0.75, 0.88, 0.95), fres * 0.45);
        float sparkle = pow(max(0.0, sin(vWorld.x * 0.4 + time * 2.0) * cos(vWorld.z * 0.35 - time)), 12.0);
        col += vec3(0.7, 0.85, 0.95) * sparkle * 0.5;
        gl_FragColor = vec4(col, 0.9);
      }
    `,
  });
}

export function createGrassMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      sunDir: { value: new THREE.Vector3(0.4, 0.88, 0.2).normalize() },
    },
    vertexShader: `
      varying vec2 vXZ;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vXZ = wp.xz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 sunDir;
      varying vec2 vXZ;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p){
        vec2 i=floor(p), f=fract(p);
        float a=hash(i), b=hash(i+vec2(1.,0.)), c=hash(i+vec2(0.,1.)), d=hash(i+vec2(1.,1.));
        vec2 u=f*f*(3.-2.*f);
        return mix(a,b,u.x)+(c-a)*u.y*(1.-u.x)+(d-b)*u.x*u.y;
      }
      void main() {
        float n = noise(vXZ * 0.06);
        float n2 = noise(vXZ * 0.28 + 8.0);
        float n3 = noise(vXZ * 1.2);
        vec3 col = mix(vec3(0.16,0.34,0.15), vec3(0.34,0.55,0.24), n);
        col = mix(col, vec3(0.5,0.68,0.3), n2 * 0.4);
        // 꽃/하이라이트 점
        float flower = step(0.93, n3);
        col = mix(col, vec3(0.95,0.85,0.45), flower * 0.55);
        float ndl = 0.55 + 0.45 * max(dot(vec3(0.,1.,0.), sunDir), 0.0);
        col *= ndl;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

export function createAsphaltMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      sunDir: { value: new THREE.Vector3(0.4, 0.88, 0.2).normalize() },
    },
    vertexShader: `
      varying vec3 vPos;
      varying vec3 vNormal;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vPos = wp.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 sunDir;
      varying vec3 vPos;
      varying vec3 vNormal;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      void main() {
        float grit = hash(floor(vPos.xz * 10.0)) * 0.1;
        vec3 col = vec3(0.18, 0.19, 0.21) + grit;
        // 미끄러운 하이라이트 밴드
        float wet = 0.04 * sin(vPos.x * 0.15) * sin(vPos.z * 0.12);
        col += wet;
        float ndl = 0.4 + 0.6 * clamp(dot(normalize(vNormal), sunDir), 0.0, 1.0);
        col *= ndl;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}
