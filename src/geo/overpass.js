import { CACHE_KEY_PREFIX, CACHE_TTL_MS } from "../config.js";

const OVERPASS_ENDPOINTS = [
  "/api/overpass",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.nchc.org.tw/api/interpreter",
];

function buildQuery(bbox) {
  const { south, west, north, east } = bbox;
  return `
[out:json][timeout:45];
(
  way["building"](${south},${west},${north},${east});
  relation["building"](${south},${west},${north},${east});
  way["highway"](${south},${west},${north},${east});
  way["natural"="water"](${south},${west},${north},${east});
  way["water"](${south},${west},${north},${east});
  relation["natural"="water"](${south},${west},${north},${east});
  way["waterway"="riverbank"](${south},${west},${north},${east});
  way["leisure"="park"](${south},${west},${north},${east});
  relation["leisure"="park"](${south},${west},${north},${east});
  way["landuse"="grass"](${south},${west},${north},${east});
);
out body;
>;
out skel qt;
`.trim();
}

function cacheKey(tileId) {
  return `${CACHE_KEY_PREFIX}:${tileId}`;
}

function readCache(tileId) {
  try {
    const raw = localStorage.getItem(cacheKey(tileId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCache(tileId, data) {
  try {
    localStorage.setItem(
      cacheKey(tileId),
      JSON.stringify({ savedAt: Date.now(), data }),
    );
  } catch {
    // quota — drop oldest-ish keys
    try {
      const keys = Object.keys(localStorage).filter((k) =>
        k.startsWith(CACHE_KEY_PREFIX),
      );
      keys.slice(0, Math.ceil(keys.length / 3)).forEach((k) => localStorage.removeItem(k));
      localStorage.setItem(
        cacheKey(tileId),
        JSON.stringify({ savedAt: Date.now(), data }),
      );
    } catch {
      /* ignore */
    }
  }
}

async function fetchFromEndpoint(endpoint, query) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  return res.json();
}

export async function fetchOsmBbox(bbox, { tileId, forceRefresh = false } = {}) {
  if (tileId && !forceRefresh) {
    const cached = readCache(tileId);
    if (cached) return { data: cached, fromCache: true };
  }

  const query = buildQuery(bbox);
  let lastError;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const data = await fetchFromEndpoint(endpoint, query);
      if (!data?.elements) throw new Error("빈 응답");
      if (tileId) writeCache(tileId, data);
      return { data, fromCache: false };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError ?? new Error("Overpass 요청 실패");
}

export function clearOsmCache() {
  const keys = Object.keys(localStorage).filter(
    (k) => k.startsWith(CACHE_KEY_PREFIX) || k.startsWith("yunseul-vr-songdo"),
  );
  keys.forEach((k) => localStorage.removeItem(k));
}
