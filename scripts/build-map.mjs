import fs from 'node:fs';
import path from 'node:path';
import { parseOsmCity, pointInPolygon } from '../src/city/parseOsm.js';
import { createProjector } from '../src/geo/project.js';
import { SONGDO, STREAM, SPAWN } from '../src/config.js';
const input=process.argv[2] || 'scripts/source/songdo.osm.json';
const data=JSON.parse(fs.readFileSync(input));
const projector=createProjector(SONGDO.center.lat,SONGDO.center.lon);
const city=parseOsmCity(data,projector.project);
const nodes=new Map(data.elements.filter(e=>e.type==='node').map(e=>[e.id,e]));
const ways=new Map(data.elements.filter(e=>e.type==='way').map(e=>[e.id,e]));
const coords=w=>(w.nodes||[]).map(id=>nodes.get(id)).filter(Boolean).map(n=>projector.project(n.lon,n.lat));
const middle=points=>({x:points.reduce((a,p)=>a+p.x,0)/points.length,z:points.reduce((a,p)=>a+p.z,0)/points.length});
const zones=[];
for(const w of ways.values()) {
  const t=w.tags||{}, n=t['name:ko']||t.name||'';
  const points=coords(w);
  if(points.length<3)continue;
  if(/송도한옥마을|경원재|송도아트포레|아트센터 인천/.test(n)) zones.push({id:w.id,name:n,footprint:points,kind:/한옥|경원재/.test(n)?'hanok':/아트포레/.test(n)?'artfore':'artscenter'});
}
for(const b of city.buildings) {
  const p=middle(b.footprint),zone=zones.find(z=>pointInPolygon(p,z));
  if(zone){b.zone=zone.kind;if(!b.name&&zone.kind==='artscenter')b.name='아트센터 인천';}
  // Only apply a single major concert-hall mass, not the smaller accessory buildings.
  if(b.zone==='artscenter' && b.footprint.length>8)b.height=42.8;
  if(b.zone==='hanok' && !b.tags.height && !b.tags['building:levels'])b.height=5.2;
}
const destinations=[];
const matches=/G타워|포스코타워-송도|포스코건설 송도사옥|송도센트럴파크호텔|송도컨벤시아|트라이볼|현대프리미엄|홈플러스|Costco|홀리데이인/;
for(const b of city.buildings) {
  if(matches.test(b.name)) {const position=middle(b.footprint);destinations.push({id:`building-${b.id}`,name:b.name==='Costco'?'코스트코 송도점':b.name,position,height:b.height,minDistance:Math.max(28,b.height*0.72,...b.footprint.map(p=>Math.hypot(p.x-position.x,p.z-position.z)+14))});}
}
for(const z of zones)destinations.push({id:`zone-${z.id}`,name:z.name,position:middle(z.footprint)});
for(const p of city.parks)if(/글로벌파크|잭니클라우스/.test(p.name))destinations.push({id:`park-${p.id}`,name:p.name,position:middle(p.footprint)});
// Campus and headquarters boundaries are not invented building footprints.
for(const e of data.elements) {
  const t=e.tags||{},name=t['name:ko']||t.name||'';
  if(!/인천대학교 송도캠퍼스|^해양경찰청$|더샵 센트럴파크/.test(name))continue;
  let points=e.type==='way'?coords(e):e.type==='relation'?(e.members||[]).filter(m=>m.type==='way').flatMap(m=>ways.has(m.ref)?coords(ways.get(m.ref)):[]):[];
  if(points.length)destinations.push({id:`poi-${e.type}-${e.id}`,name,position:middle(points)});
}
const landmarkRoad=city.roads.filter(r=>r.name==='랜드마크로');
if(landmarkRoad.length)destinations.push({id:'landmark-road',name:'랜드마크로',position:landmarkRoad[0].path[0]});
destinations.unshift({id:'central-park',name:'센트럴파크 수변 출발점',position:projector.project(SPAWN.lookAt.lon,SPAWN.lookAt.lat),arrival:projector.project(SPAWN.lon,SPAWN.lat)});
// Move to a real nearby walkway outside both the building footprint and water.
for(const d of destinations) {
  if(d.arrival)continue;
  let best=Infinity,arrival=null;
  for(const road of city.roads.filter(r=>['footway','path','pedestrian','cycleway','residential','service'].includes(r.highway))) for(const p of road.path) {
    const dist=Math.hypot(p.x-d.position.x,p.z-d.position.z);
    if(dist<(d.minDistance||28)||dist>=best||dist>1200)continue;
    if(city.buildings.some(b=>pointInPolygon(p,b))||city.waters.some(w=>pointInPolygon(p,w)))continue;
    arrival={...p};best=dist;
  }
  if(!arrival)throw new Error(`No safe arrival for ${d.name}`);
  d.arrival=arrival;
}
const counts=Object.fromEntries(Object.entries(city).map(([k,v])=>[k,v.length]));
const dir='public/data/tiles';fs.mkdirSync(dir,{recursive:true});
for(const file of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,file));
const tiles=new Map(),s=STREAM.tileSizeM;
const featureDir='public/data/features';fs.mkdirSync(featureDir,{recursive:true});
for(const file of fs.readdirSync(featureDir))fs.unlinkSync(path.join(featureDir,file));
const sharedFeatures=new Map();
const sw=projector.project(SONGDO.bbox.west,SONGDO.bbox.south),ne=projector.project(SONGDO.bbox.east,SONGDO.bbox.north);
const range={minX:Math.floor(sw.x/s),maxX:Math.floor(ne.x/s),minZ:Math.floor(ne.z/s),maxZ:Math.floor(sw.z/s)};
for(const [kind,features] of Object.entries(city))for(const feature of features){
  // Retain only tags used at runtime, reducing payload without changing vertices.
  if(feature.tags)feature.tags=Object.fromEntries(Object.entries(feature.tags).filter(([k])=>['building','building:levels','height','roof:shape','roof:height','tourism','artwork_type','artist_name','golf','leisure','amenity','name','name:ko'].includes(k)));
  const points=feature.footprint||feature.path||[feature.position];
  const xs=points.map(p=>p.x),zs=points.map(p=>p.z);
  const minX=Math.max(range.minX,Math.floor(Math.min(...xs)/s)),maxX=Math.min(range.maxX,Math.floor(Math.max(...xs)/s)),minZ=Math.max(range.minZ,Math.floor(Math.min(...zs)/s)),maxZ=Math.min(range.maxZ,Math.floor(Math.max(...zs)/s));
  const shared=(maxX-minX+1)*(maxZ-minZ+1)>4;
  const ref=`${kind}-${feature.id}`;
  if(shared)sharedFeatures.set(ref,feature);
  for(let z=minZ;z<=maxZ;z++)for(let x=minX;x<=maxX;x++) {
    const key=`${x},${z}`;
    if(!tiles.has(key))tiles.set(key,Object.fromEntries(Object.keys(city).map(k=>[k,[]])));
    tiles.get(key)[kind].push(shared?{$ref:ref}:feature);
  }
}
const buildingOverrides=Object.fromEntries(city.buildings.filter(b=>b.zone||matches.test(b.name)).map(b=>[b.id,{zone:b.zone,name:b.name,height:b.height}]));
const stringify=v=>JSON.stringify(v,(k,value)=>typeof value==='number'&&!['id'].includes(k)?Math.round(value*100)/100:value);
for(const [key,feature] of sharedFeatures)fs.writeFileSync(`${featureDir}/${key}.json`,stringify(feature));
for(const [key,tile] of tiles)fs.writeFileSync(`${dir}/${key}.json`,stringify(tile));
fs.writeFileSync('public/data/songdo-manifest.json',JSON.stringify({version:1,tileSizeM:s,bounds:data.bounds,center:SONGDO.center,tiles:[...tiles.keys()],counts,destinations,buildingOverrides,modelingSources:[
  'https://www.aurum.re.kr/Bits/BuildingDoc.aspx?mm=4&ss=1&num=5128',
  'https://www.designwhos.com/projects/522',
  'https://m.haeahn.com/ko/project/detail.do?prjctSeq=2805',
  'https://www.vmspace.com/eng/project/project_view.html?base_seq=MTQ0'
],source:'https://www.openstreetmap.org/copyright' ,queryEndpoint:data.source,mapTimestamp:data.osm3s?.timestamp_osm_base,downloadedAt:data.downloadedAt,license:'OpenStreetMap contributors, ODbL 1.0',accuracy:'OSM ground-plan geometry; landmark masses are procedural approximations, not surveyed BIM. Missing or untagged objects may be absent.',unverified:['송도국제도서관: 현 지도에 식별 가능한 건물 윤곽 없음','공원 조형물: OSM에 등록된 위치만 포함, 원작 형상은 미확보']},null,2));
console.log(JSON.stringify({tiles:tiles.size,counts,destinations:destinations.map(d=>d.name)},null,2));
