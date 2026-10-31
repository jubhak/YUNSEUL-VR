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
    const wanted = [];
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const key = tileKey(tx + dx, tz + dz);
        const dist = Math.max(Math.abs(dx), Math.abs(dz));
        wanted.push({ key, tx: tx + dx, tz: tz + dz, dist });
      }
    }
    wanted.sort((a, b) => a.dist - b.dist);

    for (const w of wanted) {
      const bbox = this.tileBbox(w.tx, w.tz);
      if (!this.inSongdoBounds(bbox)) continue;
      const existing = this.tiles.get(w.key);
      if (
        existing &&
        (existing.state === "ready" ||
          existing.state === "loading" ||
          existing.state === "queued")
      ) {
        continue;
      }
      this.tiles.set(w.key, {
        state: "queued",
        tx: w.tx,
        tz: w.tz,
        dist: w.dist,
      });
      if (priority && w.dist === 0) this.queue.unshift(w);
      else this.queue.push(w);
    }

    // unload far tiles
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

  async boot(x, z) {
    // 즉시 진입: 시그니처는 이미 배치됨. OSM 타일은 백그라운드 스트리밍.
    this.onStatus?.("주변 도시 스트리밍 시작…");
    this.requestAround(x, z, { radius: STREAM.bootRadius, priority: true });
    this.requestAround(x, z, { radius: STREAM.preloadRadius });
    this.#pump();
    // 캐시된 중심 타일이 있으면 짧게만 기다려 첫 화면을 채움
    const { tx, tz } = this.worldToTile(x, z);
    const key = tileKey(tx, tz);
    const start = performance.now();
    while (performance.now() - start < 1200) {
      const t = this.tiles.get(key);
      if (t?.state === "ready" || t?.state === "error") break;
      this.#pump();
      await new Promise((r) => setTimeout(r, 40));
    }
    this.onStatus?.("탐색 중 — 주변 자동 로딩");
  }

  update(x, z) {
    const cur = this.worldToTile(x, z);
    const key = tileKey(cur.tx, cur.tz);
    if (this._lastTile !== key) {
      this._lastTile = key;
      this.requestAround(x, z, { radius: STREAM.preloadRadius });
    }
    this.#pump();

    // animate shared materials
    const t = performance.now() * 0.001;
    if (this.facadeMat.uniforms?.time) this.facadeMat.uniforms.time.value = t;
    if (this.waterMat.uniforms?.time) this.waterMat.uniforms.time.value = t;
    if (this.grassMat.uniforms?.time) this.grassMat.uniforms.time.value = t;
  }

  #pump() {
    while (
      this.activeFetches < STREAM.maxConcurrentFetches &&
      this.queue.length
    ) {
      // prefer closer tiles
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
