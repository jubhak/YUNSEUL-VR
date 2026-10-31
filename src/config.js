/** 인천 송도국제도시 전역 */
export const SONGDO = {
  name: "인천 송도",
  center: { lat: 37.3925, lon: 126.6435 },
  // 송도 IBD·캠퍼스·해안까지 넓게
  bbox: {
    south: 37.358,
    west: 126.608,
    north: 37.422,
    east: 126.688,
  },
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
  maxYawRate: 0.48,
  maxPitchRate: 0.32,
  pitchLimit: 0.55,
  yawGain: 0.00008,
  pitchGain: 0.00005,
  fovDefault: 65,
  fovMin: 35,
  fovMax: 80,
  zoomStep: 2.5,
};

/**
 * GTA식 스트리밍:
 * - 시작: 현재 타일만 빠르게 (≤20초)
 * - 이후: 캐릭터 주변 계속 프리로드
 */
export const STREAM = {
  tileSizeM: 280,
  bootRadius: 0, // 시작은 현재 타일만 대기
  loadRadius: 2,
  preloadRadius: 3,
  unloadRadius: 5,
  maxConcurrentFetches: 4,
  bootWaitMs: 18000, // 하드 상한 18초
};

export const CACHE_KEY_PREFIX = "yunseul-vr-tile-v3";
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
