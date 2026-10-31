import * as THREE from "three";
import { STREAM, SONGDO } from "../config.js";
import { fetchOsmBbox } from "../geo/overpass.js";
import { parseOsmCity } from "./parseOsm.js";
import {
  createBuildingsGroup,
  createRoadsGroup,
  createParkGroup,
  createWaterGroup,
  disposeObject3D,
} from "./buildMeshes.js";
import {
  createFacadeMaterial,
  createWaterMaterial,
  createAsphaltMaterial,
  createGrassMaterial,
} from "./materials.js";
import { createFallbackCity } from "./fallback.js";

function tileKey(tx, tz) {
  return `${tx},${tz}`;
}

export class CityStreamer {
  constructor({ sceneRoot, projector, onStats, onStatus }) {
    this.root = sceneRoot;
    this.projector = projector;
    this.onStats = onStats;
    this.onStatus = onStatus;

    this.tiles = new Map(); // key -> { state, group, colliders, counts }
    this.queue = [];
    this.activeFetches = 0;
    this.baseColliders = [];
    this.stats = { buildings: 0, roads: 0, tiles: 0 };

    this.facadeMat = createFacadeMaterial();
    this.facadeMat.userData.shared = true;
    this.waterMat = createWaterMaterial();
    this.waterMat.userData.shared = true;
    this.asphaltMat = createAsphaltMaterial();
    this.asphaltMat.userData.shared = true;
    this.grassMat = createGrassMaterial();
    this.grassMat.userData.shared = true;

    this._lastTile = null;
  }

  setBaseColliders(colliders) {
    this.baseColliders = colliders || [];
  }

  worldToTile(x, z) {
    const s = STREAM.tileSizeM;
    return {
      tx: Math.floor(x / s),
      tz: Math.floor(z / s),
    };
  }

  tileBbox(tx, tz) {
    const s = STREAM.tileSizeM;
    const minX = tx * s;
    const maxX = (tx + 1) * s;
    const minZ = tz * s;
    const maxZ = (tz + 1) * s;
    // world: x east, z south-negative of north → unproject corners
    const sw = this.projector.unproject(minX, maxZ);
    const ne = this.projector.unproject(maxX, minZ);
    // pad slightly to avoid seams
    const pad = 0.0003;
    return {
      south: Math.min(sw.lat, ne.lat) - pad,
      west: Math.min(sw.lon, ne.lon) - pad,
      north: Math.max(sw.lat, ne.lat) + pad,
      east: Math.max(sw.lon, ne.lon) + pad,
    };
  }

  inSongdoBounds(bbox) {
    const b = SONGDO.bbox;
    return !(
      bbox.north < b.south ||
      bbox.south > b.north ||
      bbox.east < b.west ||
      bbox.west > b.east
    );
  }

  getColliders() {
    const all = [...this.baseColliders];
    for (const tile of this.tiles.values()) {
      if (tile.colliders) all.push(...tile.colliders);
    }
    return all;
  }

  #recomputeStats() {
    let buildings = 0;
    let roads = 0;
    let tiles = 0;
    for (const t of this.tiles.values()) {
      if (t.state !== "ready") continue;
      tiles += 1;
      buildings += t.counts?.buildings || 0;
      roads += t.counts?.roads || 0;
    }
    this.stats = { buildings, roads, tiles };
    this.onStats?.(this.stats);
  }

  requestAround(x, z, { radius = STREAM.loadRadius, priority = false } = {}) {
    const { tx, tz } = this.worldToTile(x, z);
    this._playerTile = { tx, tz };

    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const key = tileKey(tx + dx, tz + dz);
        const dist = Math.max(Math.abs(dx), Math.abs(dz));
        const bbox = this.tileBbox(tx + dx, tz + dz);
        if (!this.inSongdoBounds(bbox)) continue;

        const existing = this.tiles.get(key);
        if (existing) {
          existing.dist = dist;
          if (existing.state === "queued") {
            const q = this.queue.find((j) => j.key === key);
            if (q) q.dist = dist;
          }
          continue;
        }

        this.tiles.set(key, {
          state: "queued",
          tx: tx + dx,
          tz: tz + dz,
          dist,
        });
        const job = { key, tx: tx + dx, tz: tz + dz, dist };
        if (priority && dist === 0) this.queue.unshift(job);
        else this.queue.push(job);
      }
    }

    const unloadR = STREAM.unloadRadius;
    for (const [key, tile] of this.tiles) {
      const dx = Math.abs(tile.tx - tx);
      const dz = Math.abs(tile.tz - tz);
      if (Math.max(dx, dz) > unloadR && tile.state === "ready") {
        this.#unloadTile(key);
      }
    }

    this.#pump();
  }

  async boot(x, z, { onProgress } = {}) {
    this.onStatus?.("현재 위치 빠른 로딩…");
    // 1) 현재 타일만 우선
    this.requestAround(x, z, { radius: STREAM.bootRadius, priority: true });
    // 2) 주변은 백그라운드 큐에만 넣고 대기하지 않음
    this.requestAround(x, z, { radius: STREAM.preloadRadius });
    this.#pump();

    const { tx, tz } = this.worldToTile(x, z);
    const centerKey = tileKey(tx, tz);
    const start = performance.now();

    while (performance.now() - start < STREAM.bootWaitMs) {
      const t = this.tiles.get(centerKey);
      const elapsed = performance.now() - start;
      const pct = Math.min(0.95, elapsed / STREAM.bootWaitMs);
      onProgress?.(
        t?.state === "ready" ? 1 : pct,
        t?.state === "ready"
          ? "현재 구역 준비됨"
          : `빠른 시작 로딩… ${Math.ceil((STREAM.bootWaitMs - elapsed) / 1000)}s`,
      );
      this.onStatus?.(
        t?.state === "ready"
          ? "스트리밍 중"
          : `시작 타일 로딩… (${Math.round(elapsed / 1000)}s)`,
      );
      if (t?.state === "ready" || t?.state === "error") break;
      this.#pump();
      await new Promise((r) => setTimeout(r, 50));
    }

    this.onStatus?.("GTA식 스트리밍 — 이동하며 주변 로딩");
    onProgress?.(1, "입장 — 주변은 이동하며 자동 로딩");
  }

  update(x, z) {
    const cur = this.worldToTile(x, z);
    const key = tileKey(cur.tx, cur.tz);
    // 타일 변경 시 풀 프리로드, 같은 타일에서도 주기적으로 큐 재정렬
    if (this._lastTile !== key) {
      this._lastTile = key;
      this.requestAround(x, z, { radius: STREAM.preloadRadius });
    } else {
      this._streamTick = (this._streamTick || 0) + 1;
      if (this._streamTick % 30 === 0) {
        this.requestAround(x, z, { radius: STREAM.loadRadius });
      }
    }
    this.#pump();

    const t = performance.now() * 0.001;
    if (this.facadeMat.uniforms?.time) this.facadeMat.uniforms.time.value = t;
    if (this.waterMat.uniforms?.time) this.waterMat.uniforms.time.value = t;
    if (this.grassMat.uniforms?.time) this.grassMat.uniforms.time.value = t;
  }

  #pump() {
    // 플레이어와 가까운 타일 먼저
    if (this._playerTile) {
      for (const job of this.queue) {
        job.dist = Math.max(
          Math.abs(job.tx - this._playerTile.tx),
          Math.abs(job.tz - this._playerTile.tz),
        );
      }
    }
    while (
      this.activeFetches < STREAM.maxConcurrentFetches &&
      this.queue.length
    ) {
      this.queue.sort((a, b) => a.dist - b.dist);
      const job = this.queue.shift();
      const tile = this.tiles.get(job.key);
      if (!tile || tile.state === "ready" || tile.state === "loading") continue;
      tile.state = "loading";
      this.activeFetches += 1;
      this.#loadTile(job)
        .catch((err) => {
          console.warn("tile fail", job.key, err);
          const t = this.tiles.get(job.key);
          if (t) t.state = "error";
        })
        .finally(() => {
          this.activeFetches -= 1;
          this.#pump();
        });
    }
  }

  async #loadTile(job) {
    const bbox = this.tileBbox(job.tx, job.tz);
    let osm;
    try {
      const res = await fetchOsmBbox(bbox, { tileId: job.key });
      osm = res.data;
    } catch {
      osm = createFallbackCity({
        center: {
          lat: (bbox.south + bbox.north) / 2,
          lon: (bbox.west + bbox.east) / 2,
        },
      });
    }

    const city = parseOsmCity(osm, this.projector.project);
    const group = new THREE.Group();
    group.name = `tile-${job.key}`;

    const { group: buildings, colliders, count } = createBuildingsGroup(
      city.buildings,
      this.facadeMat,
    );
    const roads = createRoadsGroup(city.roads, this.asphaltMat);
    const parks = createParkGroup(city.parks, this.grassMat);
    const water = createWaterGroup(city.waters, this.waterMat);

    group.add(parks);
    group.add(water);
    group.add(roads);
    group.add(buildings);
    this.root.add(group);

    const tile = this.tiles.get(job.key);
    if (!tile) {
      disposeObject3D(group);
      this.root.remove(group);
      return;
    }

    tile.state = "ready";
    tile.group = group;
    tile.colliders = colliders;
    tile.counts = { buildings: count, roads: city.roads.length };
    this.#recomputeStats();
    this.onStatus?.(
      `타일 ${this.stats.tiles} · 건물 ${this.stats.buildings} · 도로 ${this.stats.roads}`,
    );
  }

  #unloadTile(key) {
    const tile = this.tiles.get(key);
    if (!tile?.group) {
      this.tiles.delete(key);
      return;
    }
    this.root.remove(tile.group);
    disposeObject3D(tile.group);
    this.tiles.delete(key);
    this.#recomputeStats();
  }

  clear() {
    for (const key of [...this.tiles.keys()]) this.#unloadTile(key);
    this.queue = [];
  }
}
