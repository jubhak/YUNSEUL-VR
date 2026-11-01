/** 인천 송도국제도시 전역 */
export const SONGDO = {
  name: "인천 송도",
  center: { lat: 37.3929286, lon: 126.6386891 },
  // 송도 IBD·캠퍼스·해안까지 넓게
  bbox: {
    south: 37.325,
    west: 126.585,
    north: 37.440,
    east: 126.725,
  },
};

/** Verified OSM footway node, on the north bank of Central Park's canal. */
export const SPAWN = {
  lat: 37.3929286,
  lon: 126.6386891,
  // Look southwest across the actual canal, not at the pavement.
  lookAt: { lat: 37.39228, lon: 126.63745 },
};

export const MODES = {
  walk: {
    id: "walk",
    label: "걷기",
    eyeHeight: 1.7,
    maxSpeed: 16.5,
    accel: 42,
    friction: 14,
    canJump: true,
  },
  bike: {
    id: "bike",
    label: "자전거",
    eyeHeight: 1.45,
    maxSpeed: 49.5,
    accel: 55,
    friction: 5,
    canJump: false,
  },
  car: {
    id: "car",
    label: "자동차",
    eyeHeight: 1.35,
    maxSpeed: 95,
    accel: 70,
    friction: 4.5,
    canJump: false,
  },
};

export const LOOK = {
  keyboardYawRate: 1.15,
  maxYawRate: 0.48,
  maxPitchRate: 0.32,
  // 휠·마우스 모두 하늘과 땅을 거의 끝까지 볼 수 있게 ±85°
  pitchDown: (85 * Math.PI) / 180,
  pitchUp: (85 * Math.PI) / 180,
  horizonMargin: 0,

  // 휠 1노치(≈100 deltaY)당 약 9°
  wheelPitchGain: 0.0016,
  yawGain: 0.00008,
  pitchGain: 0.00005,
  fovDefault: 65,
  fovMin: 35,
  fovMax: 80,
  zoomStep: 2.5,
};

/** 해안·인천대교 연출 반경 (실제 해안선 좌표 기준 오프셋) */
export const COAST = {
  seaWidthM: 1900,
  seaY: 0.02,
  promenadeOffsetM: 18,
  promenadeWidthM: 5.2,
  bridgeDeckY: 46,
};

/** OSM way 376712704 (아트센터 인천) 중심 + 옥상 높이 — 도보 진입 목적지 */
export const ARTS_CENTER = {
  x: -963,
  z: -108,
  roofHeight: 42.89,
  name: "아트센터 인천 옥상 테라스",
};

/**
 * GTA식 스트리밍:
 * - 시작: 현재 타일만 빠르게 (≤20초)
 * - 이후: 캐릭터 주변 계속 프리로드
 */
export const STREAM = {
  tileSizeM: 280,
  bootRadius: 0,
  loadRadius: 2,
  preloadRadius: 4,
  unloadRadius: 7,
  maxConcurrentFetches: 6,
  bootWaitMs: 18000, // 하드 상한 18초
};

export const CACHE_KEY_PREFIX = "yunseul-vr-tile-v5";
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
