import * as THREE from "three";

/**
 * 밝은 커튼월 / 상가 파사드.
 * vColor.b > 0.55 → 통유리 타워, 아니면 상가·스톤+쇼윈도
 */
export function createFacadeMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      time: { value: 0 },
      sunDir: { value: new THREE.Vector3(0.35, 0.9, 0.25).normalize() },
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
        // DoubleSide: 뒷면도 밝게
        if (!gl_FrontFacing) n = -n;
        vec3 v = normalize(vView);
        float ndl = max(dot(n, sunDir), 0.0);
        float hemi = 0.55 + 0.25 * (n.y * 0.5 + 0.5);
        float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.2);
        float vert = abs(n.y);
        bool isGlassTower = vColor.b > 0.55;

        vec3 col;

        if (vert > 0.78) {
          // 밝은 옥상 (검정 금지)
          col = mix(vec3(0.78, 0.82, 0.86), vec3(0.9, 0.92, 0.94), 0.5);
          col *= 0.9 + 0.1 * ndl;
        } else {
          float u = abs(n.x) > abs(n.z) ? vPos.z : vPos.x;
          float yy = max(vPos.y, 0.0);

          if (isGlassTower) {
            // —— 전면 통유리 커튼월 ——
            float floorH = 3.6;
            float floorId = floor(yy / floorH);
            float fy = fract(yy / floorH);
            float cell = 1.4;
            float fx = fract(u / cell);
            float colId = floor(u / cell);

            float mullion = 1.0 - smoothstep(0.0, 0.03, min(fx, 1.0 - fx));
            mullion = max(mullion, 1.0 - smoothstep(0.0, 0.028, min(fy, 1.0 - fy)));

            float lit = 0.55 + 0.45 * hash(vec2(colId, floorId));
            vec3 sky = mix(vec3(0.55, 0.78, 0.98), vec3(0.92, 0.96, 1.0), fres);
            vec3 interior = vec3(0.95, 0.9, 0.75) * lit;
            vec3 glass = mix(sky, interior, 0.22);
            glass += fres * vec3(0.45, 0.55, 0.7);
            vec3 frame = vec3(0.82, 0.88, 0.92);
            col = mix(glass, frame, clamp(mullion * 0.85, 0.0, 1.0));
          } else {
            // —— 상가/스톤 + 1층 쇼윈도 ——
            float floorH = 3.3;
            float fy = fract(yy / floorH);
            float fx = fract(u * 0.35);
            float ground = step(yy, 5.5);

            vec3 stone = mix(vec3(0.88, 0.84, 0.78), vColor, 0.35);
            // 상층 창
            float win = step(0.12, fx) * step(fx, 0.88) * step(0.2, fy) * step(fy, 0.85);
            vec3 upperGlass = mix(vec3(0.6, 0.78, 0.92), vec3(1.0, 0.95, 0.8), 0.2) + fres * 0.3;
            col = mix(stone, upperGlass, win * 0.75);

            // 1층 전면 유리 쇼윈도
            float shopWin = step(0.08, fx) * step(fx, 0.92) * step(0.15, fy) * step(fy, 0.9);
            vec3 shopGlass = vec3(0.75, 0.88, 0.98) + fres * 0.4;
            shopGlass = mix(shopGlass, vec3(1.0, 0.85, 0.55), 0.15); // 간판 조명 느낌
            col = mix(col, shopGlass, ground * shopWin * 0.9);

            // 간판 띠
            float signband = ground * smoothstep(4.6, 4.9, yy) * (1.0 - smoothstep(5.2, 5.5, yy));
            col = mix(col, vec3(0.95, 0.45, 0.35), signband * 0.55);
          }

          col *= 0.88 + 0.12 * smoothstep(0.0, 8.0, yy);
        }

        vec3 h = normalize(sunDir + v);
        float spec = pow(max(dot(n, h), 0.0), 72.0) * (1.0 - vert);
        col *= hemi + ndl * 0.55;
        col += vec3(0.85, 0.92, 1.0) * spec * 0.55;
        col += fres * vec3(0.12, 0.16, 0.22) * (1.0 - vert);
        // 최저 밝기 보장 — 검정 건물 방지
        col = max(col, vec3(0.28, 0.32, 0.36));

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
        float grit = hash(floor(vPos.xz * 12.0)) * 0.08;
        vec3 col = vec3(0.24, 0.25, 0.27) + grit;
        float ndl = 0.5 + 0.5 * clamp(dot(normalize(vNormal), sunDir), 0.0, 1.0);
        col *= ndl;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}
