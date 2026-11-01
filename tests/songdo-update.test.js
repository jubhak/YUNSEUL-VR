import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {PlayerController} from '../src/player/controls.js';
import {resolveMovement} from '../src/player/collision.js';
import {signatureKind,createSignatureBuilding} from '../src/city/signatures.js';
import {parseOsmCity} from '../src/city/parseOsm.js';
import {createExplorationGround} from '../src/city/surfaces.js';
import {createProjector} from '../src/geo/project.js';
import {LOOK,SONGDO,STREAM} from '../src/config.js';
const manifest=JSON.parse(fs.readFileSync('public/data/songdo-manifest.json'));
function fixture(run){
  globalThis.window=new EventTarget();globalThis.document=new EventTarget();
  const p=new PlayerController(new THREE.PerspectiveCamera(),new EventTarget(),[]);p.yaw=0;p.position.set(0,1.7,0);
  try{run(p);}finally{p.dispose();delete globalThis.window;delete globalThis.document;}
}
function tick(p,n=60){for(let i=0;i<n;i++)p.update(1/60);}
test('right arrow rotates clockwise without translating or pointer lock',()=>fixture(p=>{
  p.keys.add('ArrowRight');tick(p);
  assert.ok(Math.abs(p.yaw+LOOK.keyboardYawRate)<1e-9);assert.equal(p.position.x,0);assert.equal(p.position.z,0);assert.equal(p.locked,false);
}));
test('left arrow rotates counter-clockwise without strafing',()=>fixture(p=>{
  p.keys.add('ArrowLeft');tick(p);assert.ok(p.yaw>1);assert.equal(p.position.lengthSq(),1.7**2);
}));
test('up and down walk along the current gaze, with no lock prerequisite',()=>fixture(p=>{
  p.keys.add('ArrowUp');tick(p);assert.ok(p.position.z<-8);assert.ok(Math.abs(p.position.x)<1e-6);
  p.position.set(0,1.7,0);p.velocity.set(0,0,0);p.keys.clear();p.keys.add('ArrowDown');tick(p);assert.ok(p.position.z>8);
}));
test('up plus right follows the continuously rotating gaze',()=>fixture(p=>{
  p.keys.add('ArrowUp');p.keys.add('ArrowRight');tick(p);
  assert.ok(p.position.x>3);assert.ok(p.position.z<0);
  assert.ok(p.velocity.x>0);assert.ok(p.velocity.z<0);
}));
test('unlocked canvas mouse motion updates the view',()=>fixture(p=>{
  const e=new Event('mousemove');Object.defineProperties(e,{movementX:{value:20},movementY:{value:0}});
  p.domElement.dispatchEvent(e);p.update(1/60);assert.ok(p.yaw<0);
}));
test('arrow input prevents browser page scrolling and clears on blur',()=>fixture(p=>{
  const e=new Event('keydown',{cancelable:true});Object.defineProperty(e,'code',{value:'ArrowUp'});window.dispatchEvent(e);
  assert.ok(e.defaultPrevented);assert.ok(p.keys.has('ArrowUp'));window.dispatchEvent(new Event('blur'));assert.equal(p.keys.size,0);
}));
const lShape={height:20,minX:0,maxX:10,minZ:0,maxZ:10,footprint:[{x:0,z:0},{x:10,z:0},{x:10,z:3},{x:3,z:3},{x:3,z:10},{x:0,z:10}],holes:[]};
test('actual L-shaped footprint leaves its open plaza traversable',()=>{
  const p=resolveMovement({x:6,z:4},{x:6,z:12},[lShape]);assert.ok(Math.abs(p.z-12)<1e-8);assert.equal(p.x,6);
});
test('collision substeps prevent fast car tunnelling through a wall',()=>{
  const p=resolveMovement({x:-5,z:1.5},{x:15,z:1.5},[lShape]);assert.ok(p.x<=-0.54);
});
test('a newly loaded building cannot trap a player who is already inside',()=>{
  const p=resolveMovement({x:1,z:1},{x:-4,z:1},[lShape]);assert.ok(p.x<-3.9);
});
test('courtyard holes are walkable instead of colliding with the enclosing rectangle',()=>{
 const b={height:20,minX:0,maxX:20,minZ:0,maxZ:20,footprint:[{x:0,z:0},{x:20,z:0},{x:20,z:20},{x:0,z:20}],holes:[[{x:3,z:3},{x:17,z:3},{x:17,z:17},{x:3,z:17}]]};
 const p=resolveMovement({x:6,z:6},{x:14,z:6},[b]);assert.ok(Math.abs(p.x-14)<1e-6);
});
test('offline manifest covers Songdo with actual map features and legal attribution',()=>{
 assert.ok(manifest.tiles.length>1000);assert.equal(manifest.tileSizeM,STREAM.tileSizeM);
 assert.ok(manifest.counts.buildings>10000);assert.ok(manifest.counts.roads>9000);assert.ok(manifest.counts.waters>=100);
 assert.ok(manifest.bounds.south<=37.35&&manifest.bounds.east>=126.70);assert.match(manifest.license,/ODbL/);
});
test('every bundled tile and shared feature reference is available without Overpass',()=>{
 for(const key of manifest.tiles){
  const f=`public/data/tiles/${key}.json`;assert.ok(fs.existsSync(f));
  const city=JSON.parse(fs.readFileSync(f));
  for(const features of Object.values(city))for(const feature of features)if(feature.$ref)assert.ok(fs.existsSync(`public/data/features/${feature.$ref}.json`));
 }
});
test('unverified sculpture and international-library details are not claimed as complete',()=>{
 assert.ok(manifest.unverified.some(x=>x.includes('송도국제도서관')));assert.ok(manifest.unverified.some(x=>x.includes('조형물')));
});
test('major destinations include university golf waterfront retail and landmark road',()=>{
 for(const name of ['G타워','현대프리미엄 아울렛 송도','인천대학교 송도캠퍼스','잭니클라우스 골프클럽','해양경찰청','랜드마크로']) {
  const d=manifest.destinations.find(d=>d.name===name);assert.ok(d,name);assert.ok(Number.isFinite(d.arrival.x)&&Number.isFinite(d.arrival.z));
 }
});
test('G Tower and Tri-Bowl use distinct geometry instead of generic extrusion',()=>{
 const footprint=[{x:-30,z:-20},{x:30,z:-20},{x:30,z:20},{x:-30,z:20}];
 for(const [name,kind]of [['G타워','g-tower'],['트라이볼','tribowl']]){
  const b={id:1,name,height:146,footprint,holes:[]};assert.equal(signatureKind(b),kind);
  const g=createSignatureBuilding(b);assert.equal(g.userData.kind,kind);assert.ok(g.children.length>0);
  g.traverse(o=>{if(o.geometry)assert.ok(o.geometry.attributes.position.array.every(Number.isFinite));});
 }
});
test('continuous ground never overwrites map surface depth',()=>{
 const g=createExplorationGround(createProjector(SONGDO.center.lat,SONGDO.center.lon));
 assert.ok(g.children[0].renderOrder<-20);assert.equal(g.children[0].material.depthWrite,false);
});
test('mode and mouse-lock buttons are removed and startup is automatic',()=>{
 const hud=fs.readFileSync('src/ui/hud.js','utf8'),main=fs.readFileSync('src/main.js','utf8');
 assert.doesNotMatch(hud,/<button[^>]+(?:data-mode=|data-action="lock")/);
 assert.match(main,/startCity\(\)\.then/);
});
test('golf green and bunker areas are retained by the parser',()=>{
 const data={elements:[{type:'node',id:1,lon:0,lat:0},{type:'node',id:2,lon:10,lat:0},{type:'node',id:3,lon:10,lat:10},{type:'way',id:1,nodes:[1,2,3,1],tags:{golf:'bunker'}}]};
 const c=parseOsmCity(data,(lon,lat)=>({x:lon,z:lat}));assert.equal(c.parks[0].tags.golf,'bunker');
});

test('mouse wheel tilts the gaze from ground to sky instead of zooming',()=>fixture(p=>{
  const wheel=deltaY=>{const e=new Event('wheel',{cancelable:true});Object.defineProperties(e,{deltaY:{value:deltaY},shiftKey:{value:false}});p.domElement.dispatchEvent(e);};
  const fov=p.camera.fov;
  wheel(-100);p.update(1/60);
  assert.ok(p.pitch>0.1,'wheel up looks at the sky');
  wheel(100);wheel(100);p.update(1/60);
  assert.ok(p.pitch<0,'wheel down looks at the ground');
  assert.equal(p.camera.fov,fov,'plain wheel must not change the field of view');
  for(let i=0;i<60;i++)wheel(-100);
  assert.ok(Math.abs(p.pitch-LOOK.pitchUp)<1e-9);
  for(let i=0;i<120;i++)wheel(100);
  assert.ok(Math.abs(p.pitch+LOOK.pitchDown)<1e-9);
}));
test('shift wheel keeps the old zoom behaviour',()=>fixture(p=>{
  const fov=p.camera.fov;
  const e=new Event('wheel',{cancelable:true});Object.defineProperties(e,{deltaY:{value:100},shiftKey:{value:true}});
  p.domElement.dispatchEvent(e);
  assert.equal(p.camera.fov,fov+LOOK.zoomStep);
}));
test('a rooftop platform lifts the eye height and lets the player walk on the roof',()=>fixture(p=>{
  p.setPlatforms([{footprint:[{x:-10,z:-10},{x:10,z:-10},{x:10,z:10},{x:-10,z:10}],height:42.89}]);
  p.position.set(0,1.7,0);p.update(1/60);
  assert.ok(Math.abs(p.position.y-(42.89+1.7))<1e-6,'eye follows the roof surface');
  p.keys.add('KeyW');tick(p,30);
  assert.ok(Math.abs(p.position.y-(42.89+1.7))<1e-6,'stays on the roof while walking');
  assert.ok(p.position.length()>1,'moved along the roof');
  assert.ok(Math.abs(p.getGroundHeight()-42.89)<1e-6);
}));
test('a ramp platform interpolates height instead of stepping',()=>fixture(p=>{
  p.setPlatforms([{footprint:[{x:0,z:-4},{x:60,z:-4},{x:60,z:4},{x:0,z:4}],ramp:{ax:0,az:0,h0:42.89,bx:60,bz:0,h1:0}}]);
  p.position.set(0,1.7,0);p.update(1/60);
  assert.ok(Math.abs(p.getGroundHeight()-42.89)<1e-6,'top of the ramp');
  p.position.set(30,p.position.y,0);p.update(1/60);
  assert.ok(Math.abs(p.getGroundHeight()-42.89/2)<1e-6,'mid ramp');
  p.position.set(60,p.position.y,0);p.update(1/60);
  assert.ok(Math.abs(p.getGroundHeight())<1e-6,'bottom of the ramp');
}));
test('standing on a roof does not collide with the building underneath',()=>{
  const block={height:40,minX:-10,maxX:10,minZ:-10,maxZ:10,footprint:[{x:-10,z:-10},{x:10,z:-10},{x:10,z:10},{x:-10,z:10}],holes:[]};
  const onRoof=resolveMovement({x:0,z:0},{x:8,z:0},[block],0.55,44.5);
  assert.ok(Math.abs(onRoof.x-8)<1e-9,'walkable on top of the slab');
  const atGrade=resolveMovement({x:-14,z:0},{x:0,z:0},[block],0.55,1.7);
  assert.ok(atGrade.x<=-10.5,'still solid from street level');
});
test('coastline, Incheon Bridge and waterfront exports are present and sourced',()=>{
  const coast=JSON.parse(fs.readFileSync('public/data/coastline.json'));
  const bridge=JSON.parse(fs.readFileSync('public/data/incheon-bridge.json'));
  assert.ok(coast.ways.length>=1);assert.ok(coast.ways.some(w=>w.length>100));
  assert.ok(bridge.ways.length>=1);
  assert.equal(bridge.pylons.length,2);
  assert.ok(bridge.mastHeight>200&&bridge.mainSpan>=700);
  assert.match(coast.license,/ODbL/);assert.match(bridge.license,/ODbL/);
  assert.match(coast.source,/openstreetmap/);
});
test('G-Tower massing follows the photographed taper and sheared crown',()=>{
  const g={id:'g',name:'G타워',height:146,footprint:[{x:-22,z:-20},{x:22,z:-20},{x:22,z:20},{x:-22,z:20}],holes:[]};
  assert.equal(signatureKind(g),'g-tower');
  const model=createSignatureBuilding(g);
  model.updateMatrixWorld(true);
  const bbox=new THREE.Box3().setFromObject(model);
  assert.ok(bbox.max.y>140&&bbox.max.y<150,'145.8 m tall');
  assert.ok(bbox.max.x-bbox.min.x>38,'full footprint at the base');
});
test('Arts Center model exposes a walkable roof terrace and a ramp',()=>{
  const a={id:'a',name:'아트센터 인천',height:42.8,zone:'artscenter',footprint:[{x:-40,z:-30},{x:40,z:-30},{x:40,z:30},{x:-40,z:30}],holes:[]};
  const model=createSignatureBuilding(a);
  const platforms=model.userData.platforms;
  assert.ok(platforms.length>=2);
  const roof=platforms.find(p=>p.height);
  assert.ok(roof&&Math.abs(roof.height-42.89)<0.3);
  assert.ok(platforms.some(p=>p.ramp&&p.ramp.h0>40&&Math.abs(p.ramp.h1)<1e-9));
  assert.ok(platforms.every(p=>p.footprint.length>=3));
});
