import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { LOOK, SPAWN, SONGDO } from '../src/config.js';
import { clampPitch, pitchBounds } from '../src/player/look.js';
import { PlayerController } from '../src/player/controls.js';
import { parseOsmCity, pointInPolygon } from '../src/city/parseOsm.js';
import { createProjector } from '../src/geo/project.js';
import { createRoadsGroup, createWaterGroup } from '../src/city/buildMeshes.js';
const data=JSON.parse(fs.readFileSync(new URL('../public/data/central-park.json',import.meta.url)));
const projector=createProjector(SONGDO.center.lat,SONGDO.center.lon);
const city=parseOsmCity(data,projector.project);
const spawn=projector.project(SPAWN.lon,SPAWN.lat);

test('wheel look reaches sky and ground within a +/-85 degree guard band',()=>{
  assert.ok(Math.abs(LOOK.pitchUp-85*Math.PI/180)<1e-12);
  assert.ok(Math.abs(LOOK.pitchDown-85*Math.PI/180)<1e-12);
  assert.ok(Math.abs(clampPitch(-100000)+LOOK.pitchDown)<1e-12);
  assert.ok(Math.abs(clampPitch(100000)-LOOK.pitchUp)<1e-12);
});
test('pitch bounds are symmetric and independent of the zoom level',()=>{
  for(let fov=LOOK.fovMin;fov<=LOOK.fovMax;fov+=0.25){
    const bounds=pitchBounds(fov);
    assert.equal(bounds.min,-LOOK.pitchDown);
    assert.equal(bounds.max,LOOK.pitchUp);
    assert.equal(clampPitch(-10000,fov),bounds.min);
  }
  assert.ok(Math.abs(pitchBounds(35).min*180/Math.PI+85)<1e-9);
});
test('actual controller discards excessive input without downward drift',()=>{
  globalThis.window=new EventTarget();globalThis.document=new EventTarget();
  const canvas=new EventTarget();const camera=new THREE.PerspectiveCamera();
  const player=new PlayerController(camera,canvas,[]);
  for(let i=0;i<5000;i++){player._pitchVel=-1e9;player.update(1/60);}
  assert.ok(Math.abs(player.pitch+LOOK.pitchDown)<1e-9);
  for(let i=0;i<1000;i++)player.update(1/60);
  assert.ok(Math.abs(player.pitch+LOOK.pitchDown)<1e-9);
  camera.fov=35;player.update(1/60);
  assert.equal(player.pitch,pitchBounds(35).min);
  player.dispose();delete globalThis.window;delete globalThis.document;
});
test('real canal fragments join into a polygon with five preserved islands',()=>{
  const canal=city.waters.find(w=>String(w.id).startsWith('rel-18142289'));
  assert.ok(canal);assert.equal(canal.holes.length,5);assert.ok(canal.footprint.length>300);
  for(const hole of canal.holes) {
    assert.ok(hole.length>=4);
  }
});
test('spawn is on a real park footway, outside water and buildings',()=>{
  assert.ok(city.parks.some(p=>pointInPolygon(spawn,p)));
  assert.ok(!city.waters.some(p=>pointInPolygon(spawn,p)));
  assert.ok(!city.buildings.some(p=>pointInPolygon(spawn,p)));
  const group=createRoadsGroup(city.roads);group.updateMatrixWorld(true);
  const ray=new THREE.Raycaster(new THREE.Vector3(spawn.x,10,spawn.z),new THREE.Vector3(0,-1,0));
  const hit=ray.intersectObject(group,true);
  assert.ok(hit.length>0);assert.ok(Math.abs(hit[0].point.y-0.19)<1e-5);
  assert.ok(group.children.length<=5,'roads are batched by material');
});
test('road front faces point upwards and can be raycast from above',()=>{
  const road={path:[{x:0,z:0},{x:20,z:0}],highway:'residential',width:7};
  const group=createRoadsGroup([road]);group.updateMatrixWorld(true);
  const ray=new THREE.Raycaster(new THREE.Vector3(10,10,0),new THREE.Vector3(0,-1,0));
  assert.ok(ray.intersectObject(group,true).length>0);
});
test('water triangulation excludes canal islands',()=>{
  const canal=city.waters.find(w=>String(w.id).startsWith('rel-18142289'));
  const group=createWaterGroup([canal]);group.updateMatrixWorld(true);
  const ray=new THREE.Raycaster(new THREE.Vector3(-20,10,13),new THREE.Vector3(0,-1,0));
  assert.ok(ray.intersectObject(group,true).length>0);
  for(const hole of canal.holes) {
    const p={x:hole.reduce((n,v)=>n+v.x,0)/hole.length,z:hole.reduce((n,v)=>n+v.z,0)/hole.length};
    if(pointInPolygon(p,{footprint:hole,holes:[]})) {
      ray.ray.origin.set(p.x,10,p.z);assert.equal(ray.intersectObject(group,true).length,0);
    }
  }
});
test('map decoding and unknown-height estimates are deterministic',()=>{
  assert.deepEqual(parseOsmCity(data,projector.project),city);
  assert.equal(city.buildings.length,353);assert.equal(city.roads.length,877);
});
