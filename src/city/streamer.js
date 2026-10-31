import * as THREE from "three";
import { STREAM, SONGDO } from "../config.js";
import { fetchOsmBbox } from "../geo/overpass.js";
import { parseOsmCity } from "./parseOsm.js";
import { createBuildingsGroup,createRoadsGroup,createParkGroup,createWaterGroup,createFlatPolygons,disposeObject3D } from "./buildMeshes.js";
import { createFacadeMaterial,createWaterMaterial,createAsphaltMaterial,createGrassMaterial,updateMaterialTime } from "./materials.js";
import { createParkDetails } from "../scene/parkDetails.js";
import { createMappedDetails, createExplorationGround } from "./surfaces.js";
import { installCanalReflection } from "../scene/water.js";

const kinds=["buildings","roads","parks","waters","parking","artworks"];
let snapshotPromise;
function loadSnapshot() {
  snapshotPromise ??= fetch(`${import.meta.env?.BASE_URL || "/"}data/central-park.json`).then(r=>{
    if(!r.ok) throw new Error("센트럴파크 기본 지도 파일을 불러오지 못했습니다");return r.json();
  }).catch(e=>{snapshotPromise=null;throw e;});
  return snapshotPromise;
}
export class CityStreamer {
  constructor({sceneRoot,projector,onStats,onStatus,sunDirection}) {
    Object.assign(this,{root:sceneRoot,projector,onStats,onStatus,sunDirection});
    this.tiles=new Map();this.queue=[];this.activeFetches=0;this.baseColliders=[];
    this.stats={buildings:0,roads:0,tiles:0};this.baseCounts={buildings:0,roads:0};
    this.facadeMat=createFacadeMaterial();this.waterMat=createWaterMaterial();
    this.asphaltMat=createAsphaltMaterial();this.grassMat=createGrassMaterial();
    this.materials=[this.facadeMat,this.waterMat,this.asphaltMat,this.grassMat];
    this.materials.forEach(m=>m.userData.shared=true);
    this.snapshotIds=new Set();this.featureOwners=new Map();this.disposed=false;
    this.abort=new AbortController();
    this.featurePromises=new Map();this.offlineTiles=new Set();this.destinations=[];this.baseUrl=import.meta.env?.BASE_URL || "/";
  }
  setBaseColliders(colliders) {this.baseColliders=colliders || [];}
  worldToTile(x,z) {return {tx:Math.floor(x/STREAM.tileSizeM),tz:Math.floor(z/STREAM.tileSizeM)};}
  tileBbox(tx,tz) {
    const s=STREAM.tileSizeM,sw=this.projector.unproject(tx*s,(tz+1)*s),ne=this.projector.unproject((tx+1)*s,tz*s);
    return {south:sw.lat-0.0001,west:sw.lon-0.0001,north:ne.lat+0.0001,east:ne.lon+0.0001};
  }
  getColliders() {return [...this.baseColliders,...[...this.tiles.values()].flatMap(t=>t.colliders||[])];}
  #stats() {
    const ready=[...this.tiles.values()].filter(t=>t.state==="ready");
    this.stats={
      buildings:this.baseCounts.buildings+ready.reduce((n,t)=>n+(t.counts?.buildings||0),0),
      roads:this.baseCounts.roads+ready.reduce((n,t)=>n+(t.counts?.roads||0),0),
      tiles:ready.length+(this.snapshotGroup?1:0),
    };
    this.onStats?.(this.stats);
  }
  #build(city) {
    const group=new THREE.Group();
    const buildings=createBuildingsGroup(city.buildings,this.facadeMat);
    const water=createWaterGroup(city.waters,this.waterMat);
    group.add(createParkGroup(city.parks,this.grassMat),water,createRoadsGroup(city.roads,this.asphaltMat),buildings.group,createMappedDetails(city));
    return {group,water,colliders:buildings.colliders,counts:{buildings:city.buildings.length,roads:city.roads.length}};
  }
  async boot(x,z,{onProgress}={}) {
    onProgress?.(0.1,"센트럴파크 실제 수로·산책로 불러오는 중…");
    const [data,manifest]=await Promise.all([
      loadSnapshot(),
      fetch(`${this.baseUrl}data/songdo-manifest.json`,{signal:this.abort.signal}).then(r=>{if(!r.ok)throw new Error("송도 전체 지도 목록을 읽지 못했습니다");return r.json();})
    ]); if(this.disposed)return;
    if(manifest.tileSizeM!==STREAM.tileSizeM)throw new Error("지도 타일 크기가 설정과 일치하지 않습니다");
    this.offlineTiles=new Set(manifest.tiles);this.destinations=manifest.destinations;
    const city=parseOsmCity(data,this.projector.project);
    for(const b of city.buildings)Object.assign(b,manifest.buildingOverrides?.[b.id] || {});
    this.ground=createExplorationGround(this.projector);this.root.add(this.ground);
    for(const kind of kinds) city[kind].forEach(f=>this.snapshotIds.add(`${kind}:${f.id}`));
    this.coverage=data.bounds;this.baseCity=city;
    const built=this.#build(city);built.group.name="central-park-map";
    built.group.add(createParkDetails(city,{x,z}));
    this.baseColliders.push(...built.colliders);
    this.baseCounts=built.counts;this.snapshotGroup=built.group;this.root.add(built.group);
    this.reflection=installCanalReflection(built.water,this.sunDirection);
    this.#stats();onProgress?.(1,"송도 센트럴파크 수변 산책로 준비 완료");
    this.onStatus?.("송도 전체 기본 지도 · 구역별 자동 로딩");
    this.requestAround(x,z,{radius:STREAM.loadRadius});
  }
  requestAround(x,z,{radius=STREAM.loadRadius}={}) {
    if(this.disposed)return;
    const {tx,tz}=this.worldToTile(x,z);this.playerTile={tx,tz};
    for(let dz=-radius;dz<=radius;dz++)for(let dx=-radius;dx<=radius;dx++) {
      const nx=tx+dx,nz=tz+dz,key=`${nx},${nz}`,bbox=this.tileBbox(nx,nz),b=SONGDO.bbox;
      if(bbox.north<b.south||bbox.south>b.north||bbox.east<b.west||bbox.west>b.east)continue;
      const c=this.coverage;
      if(c && bbox.south>=c.south&&bbox.north<=c.north&&bbox.west>=c.west&&bbox.east<=c.east)continue;
      if(this.tiles.has(key))continue;
      const tile={key,tx:nx,tz:nz,state:"queued"};this.tiles.set(key,tile);this.queue.push(tile);
    }
    for(const [key,tile] of this.tiles) {
      if(Math.max(Math.abs(tile.tx-tx),Math.abs(tile.tz-tz))>STREAM.unloadRadius && tile.state!=="loading")this.#unload(key);
    }
    this.#pump();
  }
  #pump() {
    if(this.disposed)return;
    this.queue=this.queue.filter(t=>this.tiles.get(t.key)===t);
    this.queue.sort((a,b)=>Math.hypot(a.tx-this.playerTile.tx,a.tz-this.playerTile.tz)-Math.hypot(b.tx-this.playerTile.tx,b.tz-this.playerTile.tz));
    while(this.activeFetches<(this.offlineTiles.size?STREAM.maxConcurrentFetches:2)&&this.queue.length) {
      const job=this.queue.shift();job.state="loading";this.activeFetches++;
      this.#load(job).catch(e=>{
        if(this.disposed)return;
        job.state="error";job.retryAt=performance.now()+60000;
        this.onStatus?.("지도 구역 로딩 지연 · 자동 재시도");
        console.info("Background map unavailable:",e.message);
      }).finally(()=>{this.activeFetches--;this.#pump();});
    }
  }
  async #load(job) {
    let city;
    if(this.offlineTiles.has(job.key)) {
      const response=await fetch(`${this.baseUrl}data/tiles/${job.key}.json`,{signal:this.abort.signal});
      if(!response.ok)throw new Error(`포함 지도 타일 오류 ${response.status}`);
      city=await response.json();
      await Promise.all(kinds.map(async kind=>{
        city[kind]=await Promise.all((city[kind]||[]).map(async feature=>{
          if(!feature.$ref)return feature;
          const ref=feature.$ref;
          if(!this.featurePromises.has(ref))this.featurePromises.set(ref,
            fetch(`${this.baseUrl}data/features/${ref}.json`,{signal:this.abort.signal}).then(r=>{if(!r.ok)throw new Error(`지도 객체 오류 ${r.status}`);return r.json();}).catch(e=>{this.featurePromises.delete(ref);throw e;}));
          return this.featurePromises.get(ref);
        }));
      }));
    } else {
      // The manifest covers the complete requested rectangle, including genuinely empty tiles.
      const b=this.tileBbox(job.tx,job.tz),c=SONGDO.bbox;
      if(b.north>=c.south&&b.south<=c.north&&b.east>=c.west&&b.west<=c.east) {
        city=Object.fromEntries(kinds.map(k=>[k,[]]));
      } else {
        const res=await fetchOsmBbox(b,{tileId:job.key,signal:this.abort.signal});
        city=parseOsmCity(res.data,this.projector.project);
      }
    }
    if(this.disposed || this.tiles.get(job.key)!==job)return;
    job.owned=[];
    for(const kind of kinds) city[kind]=(city[kind]||[]).filter(f=>{
      const id=`${kind}:${f.id}`;
      if(this.snapshotIds.has(id)||this.featureOwners.has(id))return false;
      this.featureOwners.set(id,job.key);job.owned.push(id);return true;
    });
    Object.assign(job,this.#build(city));job.group.name=`tile-${job.key}`;job.state="ready";
    this.root.add(job.group);this.#stats();
    this.onStatus?.(`송도 · 건물 ${this.stats.buildings} · 도로 ${this.stats.roads}`);
  }
  #unload(key) {
    const tile=this.tiles.get(key);if(!tile)return;
    if(tile.group){this.root.remove(tile.group);disposeObject3D(tile.group);}
    tile.owned?.forEach(id=>this.featureOwners.delete(id));this.tiles.delete(key);
    // Deduped features may have belonged to an adjacent unloaded tile. Requery cached neighbors.
    for(const neighbor of this.tiles.values()) {
      if(neighbor.state==="ready"&&Math.max(Math.abs(neighbor.tx-tile.tx),Math.abs(neighbor.tz-tile.tz))<=1) neighbor.needsRefresh=true;
    }
  }
  update(x,z,time=performance.now()*0.001,isXR=false) {
    if(this.disposed)return;
    const tile=this.worldToTile(x,z),key=`${tile.tx},${tile.tz}`;
    if(this.lastTile!==key){this.lastTile=key;this.requestAround(x,z,{radius:STREAM.preloadRadius});}
    for(const job of [...this.tiles.values()]) {
      if((job.state==="error"&&performance.now()>job.retryAt) || job.needsRefresh) {
        // Retire the mesh before requeuing so overlapping roads do not z-fight.
        if(job.group){this.root.remove(job.group);disposeObject3D(job.group);job.group=null;}
        job.owned?.forEach(id=>this.featureOwners.delete(id));job.owned=[];job.colliders=[];
        job.needsRefresh=false;job.state="queued";this.queue.push(job);
      }
    }
    updateMaterialTime(this.waterMat,time);this.reflection?.update(time,isXR);this.#pump();
  }
  clear() {
    if(this.disposed)return;this.disposed=true;this.abort.abort();this.queue=[];
    this.reflection?.dispose();
    for(const tile of this.tiles.values()) if(tile.group){this.root.remove(tile.group);disposeObject3D(tile.group);}
    if(this.snapshotGroup){this.root.remove(this.snapshotGroup);disposeObject3D(this.snapshotGroup);}
    if(this.ground){this.root.remove(this.ground);disposeObject3D(this.ground);}
    this.featurePromises.clear();this.materials.forEach(m=>m.dispose());this.tiles.clear();this.featureOwners.clear();
  }
}
