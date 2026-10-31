/** 인천 송도국제도시 — 센트럴파크 / 컨벤시아 / 해안 일대 */
export const SONGDO = {
  name: "인천 송도",
  center: { lat: 37.3925, lon: 126.6435 },
  bbox: {
    south: 37.378,
    west: 126.620,
    north: 37.410,
    east: 126.670,
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

/**
 * 시선 = 각속도 제한이 전부.
 * 마우스 이동량과 무관하게 초당 이 각도 이상으로는 절대 안 돎.
 * (약 좌우 28°/s, 상하 18°/s — 일반 FPS보다 훨씬 느림)
 */
export const LOOK = {
  maxYawRate: 0.48,
  maxPitchRate: 0.32,
  pitchLimit: 0.55,
  /** 픽셀→목표 입력 스케일 (남아도 각속도에서 잘림) */
  yawGain: 0.00008,
  pitchGain: 0.00005,
  fovDefault: 65,
  fovMin: 35,
  fovMax: 80,
  zoomStep: 2.5,
};

export const STREAM = {
  tileSizeM: 280,
  bootRadius: 0,
  loadRadius: 1,
  preloadRadius: 2,
  unloadRadius: 3,
  maxConcurrentFetches: 2,
};

export const CACHE_KEY_PREFIX = "yunseul-vr-tile-v2";
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
