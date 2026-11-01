import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Recognition-level masses, NOT measured replicas. Never invent a lake/road here.
// Architectural sources and outstanding gaps are recorded in public/data/songdo-manifest.json.
const materials = {};
function material(name,color,metalness=0.15,roughness=0.55) {
  if(!materials[name]) {
    const m=new THREE.MeshStandardMaterial({color,metalness,roughness,side:THREE.DoubleSide});
    m.userData.shared=true;materials[name]=m;
  }
  return materials[name];
}
const glass=()=>material('glass',0x7f97ab,0.72,0.16);
const brightGlass=()=>material('bright-glass',0x9fb6c6,0.86,0.09);
const slateGlass=()=>material('slate-glass',0x2f4152,0.8,0.14);
const bronzeGlass=()=>material('bronze-glass',0xb08752,0.85,0.14);
const frame=()=>material('frame',0xc0c9c9,0.5,0.38);
const white=()=>material('stone',0xd9d6cc,0.1,0.78);
const dark=()=>material('dark',0x333d41,0.2,0.75);
const roof=()=>material('tile',0x41494b,0.15,0.8);
const timber=()=>material('timber',0x624431,0.1,0.85);
const brick=()=>material('brick',0xc7a780,0.05,0.9);
const concrete=()=>material('arts-concrete',0xb9b9ae,0.1,0.85);
const metalRail=()=>material('rail-steel',0x9aa3a6,0.7,0.35);

function layout(b) {
  // Longest mapped edge sets orientation; local extents retain the actual footprint dimensions.
  let angle=0,longest=0;
  for(let i=1;i<b.footprint.length;i++) {
    const a=b.footprint[i-1],c=b.footprint[i],len=Math.hypot(c.x-a.x,c.z-a.z);
    if(len>longest){longest=len;angle=Math.atan2(c.z-a.z,c.x-a.x);}
  }
  const co=Math.cos(angle),si=Math.sin(angle);
  const ps=b.footprint.map(p=>({x:p.x*co+p.z*si,z:-p.x*si+p.z*co}));
  const minX=Math.min(...ps.map(p=>p.x)),maxX=Math.max(...ps.map(p=>p.x));
  const minZ=Math.min(...ps.map(p=>p.z)),maxZ=Math.max(...ps.map(p=>p.z));
  const x=(minX+maxX)/2,z=(minZ+maxZ)/2;
  return {x:x*co-z*si,z:x*si+z*co,w:Math.max(3,maxX-minX),d:Math.max(3,maxZ-minZ),angle};
}
function box(g,w,h,d,x,y,z,m) {
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);
  mesh.position.set(x,y,z);g.add(mesh);return mesh;
}
function profile(g,points,depth,m,z=-depth/2) {
  const shape=new THREE.Shape(points.map(p=>new THREE.Vector2(...p)));
  const geo=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false});
  const mesh=new THREE.Mesh(geo,m);mesh.position.z=z;g.add(mesh);return mesh;
}
function bands(g,w,d,h,step=3.8,y0=0,mat=frame()) {
  for(let y=y0+step;y<h;y+=step)box(g,w+0.12,0.18,d+0.12,0,y,0,mat);
}
function pitched(g,w,d,y,rise,m,curved=false) {
  const pts=[];
  const half=w/2;
  if(curved) {
    for(let i=0;i<=12;i++) {const x=-half+w*i/12;pts.push([x,y+rise*(1-Math.abs(x/half))+0.8*Math.pow(Math.abs(x/half),5)]);}
    pts.push([half,y-0.22],[-half,y-0.22]);
  } else pts.push([-half,y],[0,y+rise],[half,y],[half,y-0.25],[-half,y-0.25]);
  return profile(g,pts,d,m);
}

/**
 * Lofted rectangular shaft. Each section is {y, w, d}; the crown section may give
 * a per-corner y array, which is what produces the sheared diagonal roof of G-Tower.
 */
function loft(sections, materialForSide, topMaterial) {
  const positions=[], normals=[];
  const corner=(s,i)=>{
    const hw=s.w/2,hd=s.d/2;
    const pts=[{x:-hw,z:-hd},{x:hw,z:-hd},{x:hw,z:hd},{x:-hw,z:hd}];
    const y=s.ys?s.ys[i]:s.y;
    return {x:pts[i].x,y,z:pts[i].z};
  };
  const push=(a,b,c)=>{
    positions.push(a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z);
    const ux=b.x-a.x,uy=b.y-a.y,uz=b.z-a.z,vx=c.x-a.x,vy=c.y-a.y,vz=c.z-a.z;
    const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
    const len=Math.hypot(nx,ny,nz)||1;
    normals.push(nx/len,ny/len,nz/len,nx/len,ny/len,nz/len,nx/len,ny/len,nz/len);
  };
  const buckets=[];
  for(let s=0;s<sections.length-1;s++) {
    const lower=sections[s],upper=sections[s+1];
    for(let i=0;i<4;i++) {
      const j=(i+1)%4;
      const b0=corner(lower,i),b1=corner(lower,j),t0=corner(upper,i),t1=corner(upper,j);
      const start=positions.length/3;
      push(b0,t0,t1);push(b0,t1,b1);
      buckets.push({start,count:positions.length/3-start,side:i});
    }
  }
  const top=sections.at(-1);
  if(top) {
    const start=positions.length/3;
    const c=[0,1,2,3].map(i=>corner(top,i));
    push(c[3],c[2],c[1]);push(c[3],c[1],c[0]);
    buckets.push({start,count:positions.length/3-start,side:4});
  }
  const group=new THREE.Group();
  const bySide=new Map();
  for(const b of buckets) {
    if(!bySide.has(b.side))bySide.set(b.side,[]);
    bySide.get(b.side).push(b);
  }
  for(const [side,list] of bySide) {
    let count=0;
    for(const b of list)count+=b.count;
    const pos=new Float32Array(count*3),nor=new Float32Array(count*3);
    let o=0;
    for(const b of list) {
      for(let k=0;k<b.count*3;k++){pos[o*3+k]=positions[b.start*3+k];nor[o*3+k]=normals[b.start*3+k];}
      o+=b.count;
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    geo.setAttribute('normal',new THREE.BufferAttribute(nor,3));
    const mat=side===4&&topMaterial?topMaterial:materialForSide(side);
    group.add(new THREE.Mesh(geo,mat));
  }
  return group;
}

function batch(g) {
  const buckets=new Map();
  for(const mesh of [...g.children]) {
    if(!mesh.isMesh)continue;
    mesh.updateMatrix();mesh.geometry.applyMatrix4(mesh.matrix);
    const geo=mesh.geometry;
    // Normalize attributes before merging curved surfaces, boxes and extruded profiles.
    if(geo.index){const flat=geo.toNonIndexed();geo.dispose();mesh.geometry=flat;}
    mesh.geometry.deleteAttribute('uv');
    if(!buckets.has(mesh.material))buckets.set(mesh.material,[]);
    buckets.get(mesh.material).push(mesh.geometry);g.remove(mesh);
  }
  for(const [mat,geos] of buckets) {
    const geo=mergeGeometries(geos);geos.forEach(x=>x.dispose());
    if(!geo)throw new Error('Landmark geometry merge failed');
    const m=new THREE.Mesh(geo,mat);m.castShadow=true;m.receiveShadow=true;g.add(m);
  }
  return g;
}

function railing(g, w, d, y, h=1.15) {
  const rail=metalRail();
  for(const [x,z,wd] of [[0,-d/2,w],[0,d/2,w],[-w/2,0,d],[w/2,0,d]]) {
    box(g,wd,0.09,0.09,x,y+h,z,rail);
    if(x!==0) box(g,0.09,0.09,wd,x,y+h,z,rail);
    const posts=Math.max(3,Math.floor((x===0?wd:wd)/3.2));
    for(let i=0;i<=posts;i++) {
      const t=-wd/2+wd*i/posts;
      const px=x===0?x+t:x, pz=x===0?z:z+t;
      box(g,0.08,h,0.08,px,y+h/2,pz,rail);
    }
  }
}

export function signatureKind(b) {
  const n=b.name||'';
  if(/G타워|G-Tower/.test(n))return 'g-tower';
  if(/포스코타워-송도|동북아무역/.test(n))return 'neatt';
  if(/트라이볼|TriBowl/.test(n))return 'tribowl';
  if(/송도컨벤시아/.test(n))return 'convensia';
  if(b.zone==='hanok')return 'hanok';
  if(b.zone==='artfore'&&b.height<32)return 'artfore';
  if(b.zone==='artscenter'&&b.height>35)return 'artscenter';
  if(/송도센트럴파크호텔/.test(n))return 'central-hotel';
  if(/현대프리미엄/.test(n))return 'outlet';
  if(/홀리데이인/.test(n))return 'holiday';
  if(/포스코건설 송도사옥/.test(n))return 'posco-enc';
  if(/Costco|홈플러스/.test(n))return 'retail';
  return null;
}

export function createSignatureBuilding(b) {
  const kind=signatureKind(b);if(!kind)return null;
  const l=layout(b),w=kind==='g-tower'?Math.min(l.w,44):l.w,d=kind==='g-tower'?Math.min(l.d,40):l.d,h=b.height;
  const g=new THREE.Group();g.name=`signature-${kind}-${b.id}`;
  g.userData={kind,sourceId:b.id,accuracy:'procedural architectural approximation',platforms:[]};
  if(kind==='g-tower') {
    // Photo-matched massing: tapered shaft, three facets, sheared diagonal crown,
    // horizontal mechanical bands, 145.8 m / 33 floors.
    const H=145.8, baseW=w, baseD=d;
    const shaft=loft(
      [
        {y:0,w:baseW*1.02,d:baseD*1.02},
        {y:6,w:baseW,d:baseD},
        {y:96,w:baseW*0.8,d:baseD*0.82},
        {y:126,w:baseW*0.66,d:baseD*0.7},
        {y:126,ys:[126,126,126,126],w:baseW*0.66,d:baseD*0.7},
      ],
      side=>(side===0||side===1)?brightGlass():slateGlass(),
      slateGlass(),
    );
    // Rebate the crown: highest at the south-east corner, lowest opposite — the slanted top in the photo.
    const crown=loft(
      [
        {y:126,w:baseW*0.66,d:baseD*0.7},
        {y:0,ys:[H,H-6,H-18,H-26],w:baseW*0.6,d:baseD*0.62},
      ],
      side=>side===0?brightGlass():slateGlass(),
      dark(),
    );
    g.add(shaft,crown);
    for(let y=8;y<122;y+=5.4) {
      const t=y/H, taper=1-0.34*t;
      box(g,baseW*taper+0.22,0.22,baseD*taper+0.22,0,y,0,frame());
    }
    // Vertical facet creases and the lit corner column.
    for(const x of [-baseW*0.31,0,baseW*0.31]) box(g,0.34,118,baseD*0.74, x*1.02, 59, 0, frame());
    box(g,baseW*1.12,9,baseD*1.12,0,4.5,0,white());
    box(g,baseW*0.94,3.2,baseD*0.94,0,10.4,0,dark());
    // Rooftop sky garden on the low side of the sheared roof.
    const garden=box(g,baseW*0.5,0.5,baseD*0.44,0,H-17,0,material('garden',0x557452,0,1));
    garden.receiveShadow=true;
    // Public observation deck is inside; the roof terrace is not walkable (no ramp access).
  } else if(kind==='neatt') {
    // Broad lower shaft, taper and oblique crown; 305 m from the OSM height tag.
    const height=305,shaft=height*0.87;
    profile(g,[[-w/2,0],[w/2,0],[w*0.32,shaft],[w*0.2,height],[-w*0.27,height-22],[-w*0.4,shaft]],d,glass());
    for(let y=5;y<shaft;y+=4.5) {
      const taper=1-0.23*y/height;
      box(g,w*taper,0.16,d+0.1,0,y,0,frame());
    }
    for(const x of [-0.33,0,0.33])box(g,0.32,shaft,d+0.15,w*x,shaft/2,0,frame());
  } else if(kind==='tribowl') {
    // Exactly three upward-widening curved bowls with narrow feet and flat lids.
    for(const [x,z,r,depth] of [[-w*0.23,0,w*0.27,d*0.46],[w*0.2,-d*0.18,w*0.25,d*0.36],[w*0.17,d*0.2,w*0.24,d*0.36]]) {
      const pts=[];
      for(let j=0;j<=18;j++) {const t=j/18;pts.push(new THREE.Vector2(r*(0.12+0.88*Math.pow(t,0.52)),2+t*17.5));}
      const geo=new THREE.LatheGeometry(pts,40);geo.scale(1,1,depth/r);
      const m=new THREE.Mesh(geo,frame());m.position.set(x,0,z);g.add(m);
      const lid=new THREE.Mesh(new THREE.CylinderGeometry(r,r,0.35,40),frame());lid.scale.z=depth/r;lid.position.set(x,19.65,z);g.add(lid);
    }
  } else if(kind==='convensia') {
    box(g,w,13,d,0,6.5,0,glass());
    const strip=w/5;
    for(let j=0;j<5;j++) {
      const pts=[];
      for(let i=0;i<=16;i++) {const x=-strip/2+strip*i/16;pts.push([x,15+7*Math.sin(Math.PI*i/16)]);}
      pts.push([strip/2,14],[-strip/2,14]);
      const rib=profile(g,pts,d+2,white());rib.position.x=-w/2+strip*(j+0.5);
    }
  } else if(kind==='hanok') {
    const height=Math.min(h,9);
    box(g,w,height,d,0,height/2,0,white());
    const front=d/2+0.1;
    const n=Math.max(2,Math.floor(w/3.6));
    for(let i=0;i<=n;i++)box(g,0.22,height+0.6,0.25,-w/2+w*i/n,height/2,front,timber());
    pitched(g,w+2.2,d+2.2,height,Math.min(w*0.23,4),roof(),true);
    for(let x=-w/2;x<=w/2;x+=0.65) {
      const tile=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,d+2.3,5),roof());tile.rotation.x=Math.PI/2;tile.position.set(x,height+Math.min(w*0.23,4)*(1-Math.abs(x/(w/2))),0);g.add(tile);
    }
  } else if(kind==='artfore') {
    const floor=Math.min(h,11);
    box(g,w,floor,d,0,floor/2,0,brick());
    const units=Math.max(1,Math.round(w/9));
    for(let i=0;i<units;i++) {
      const unit=w/units,r=pitched(g,unit,d+0.8,floor,4,roof());r.position.x=-w/2+unit*(i+0.5);
      box(g,unit*0.6,floor*0.6,0.2,r.position.x,floor*0.45,d/2+0.15,glass());
    }
  } else if(kind==='artscenter') {
    /**
     * Art Center Incheon: stepped stone masses on a glazed podium, with a walkable
     * open-air roof over the concert hall that looks out over the waterfront lake.
     */
    const roofY=42.8, roofW=w*0.72, roofD=d*0.66;
    box(g,w,14,d,0,7,0,glass());
    for(let i=0;i<5;i++) {
      const z=-d/2+d*(i+0.5)/5,raise=(i%2)*5;
      const pts=[[-w/2,14],[-w*0.35,31+raise],[-w*0.08,roofY],[w*0.4,36],[w/2,20],[w/2,14]];
      const m=profile(g,pts,d/5+0.2,concrete(),-d/10);m.position.z=z-d/10;
    }
    // Roof slab + open terrace, lake-facing.
    box(g,roofW,1.1,roofD,0,roofY-0.55,0,concrete());
    box(g,roofW*0.94,0.12,roofD*0.94,0,roofY+0.03,0,material('deck',0xa9a49a,0.05,0.9));
    railing(g,roofW,roofD,roofY+0.06);
    // Roof pavilion / skylight over the hall.
    box(g,roofW*0.42,4.4,roofD*0.3,-roofW*0.16,roofY+2.2,roofD*0.12,white());
    box(g,roofW*0.36,0.3,roofD*0.26,-roofW*0.16,roofY+4.5,roofD*0.12,metalRail());
    // Two switchback stair/ramp flights on the landward +x side, so the terrace is reachable on foot.
    // Single long inclined flight: plaza -> roof terrace, geometry and walkable platform share one ramp.
    const flightW = 6.4, run = 74, flightZ = -roofD * 0.08;
    const rampX0 = roofW / 2, rampX1 = roofW / 2 + run;
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(run, 0.55, flightW), concrete());
    ramp.position.set((rampX0 + rampX1) / 2, roofY / 2 - 0.1, flightZ);
    ramp.rotation.z = -Math.atan2(roofY, run);
    g.add(ramp);
    for (let k = 0; k <= 14; k++) {
      const t = k / 14;
      const x = rampX0 + run * t;
      const y = roofY * (1 - t);
      box(g, 0.1, 1.1, flightW, x, y + 0.55, flightZ, metalRail());
      if (k % 3 === 0) box(g, 0.5, y + 0.9, 0.4, x, (y + 0.9) / 2, flightZ - flightW / 2 + 0.3, metalRail());
    }
    g.userData.platforms.push({
      footprint: [
        { x: rampX0, z: flightZ - flightW / 2 }, { x: rampX1, z: flightZ - flightW / 2 },
        { x: rampX1, z: flightZ + flightW / 2 }, { x: rampX0, z: flightZ + flightW / 2 },
      ],
      ramp: { ax: rampX0, az: flightZ, h0: roofY, bx: rampX1, bz: flightZ, h1: 0 },
    });
    // Terrace itself is a walkable platform.
    g.userData.platforms.push({
      footprint:[
        {x:-roofW/2,z:-roofD/2},{x:roofW/2,z:-roofD/2},{x:roofW/2,z:roofD/2},{x:-roofW/2,z:roofD/2},
      ],
      height:roofY+0.09,
    });
  } else if(kind==='central-hotel') {
    const height=82;
    box(g,w,10,d,0,5,0,white());box(g,w*0.84,height-10,d*0.78,0,(height+10)/2,0,white());
    box(g,w*0.76,4,d*0.85,0,height,0,frame());
    bands(g,w*0.845,d*0.79,height,3.5,10);
    for(let x=-w*0.36;x<w*0.4;x+=w/10)box(g,w/18,height-13,d*0.8,x,(height+10)/2,0,glass());
    profile(g,[[-w*0.24,height+2],[0,height+12],[w*0.24,height+2]],d*0.56,dark());
  } else if(kind==='posco-enc') {
    box(g,w,14,d,0,7,0,white());
    for(const x of [-w*0.27,w*0.27]) {
      box(g,w*0.35,175,d*0.7,x,101.5,0,bronzeGlass());
      for(let y=20;y<188;y+=4.2)box(g,w*0.35+0.1,0.18,d*0.7+0.1,x,y,0,frame());
    }
    box(g,w*0.9,4,d*0.5,0,174,0,frame());
  } else if(kind==='holiday') {
    box(g,w,8,d,0,4,0,white());box(g,w*0.85,79,d*0.8,0,47.5,0,glass());
    bands(g,w*0.85,d*0.8,87,4.2,8);box(g,w*0.9,3,d*0.84,0,86,0,frame());
  } else if(kind==='outlet') {
    const toLocal=p=>({x:(p.x-l.x)*Math.cos(l.angle)+(p.z-l.z)*Math.sin(l.angle),z:-(p.x-l.x)*Math.sin(l.angle)+(p.z-l.z)*Math.cos(l.angle)});
    const shape=new THREE.Shape(b.footprint.map(p=>{const q=toLocal(p);return new THREE.Vector2(q.x,-q.z);}));
    for(const ring of b.holes||[])shape.holes.push(new THREE.Path(ring.map(p=>{const q=toLocal(p);return new THREE.Vector2(q.x,-q.z);})));
    const geo=new THREE.ExtrudeGeometry(shape,{depth:h,bevelEnabled:false});geo.rotateX(-Math.PI/2);g.add(new THREE.Mesh(geo,white()));
    // Low-rise perimeter shopfront detail. Courtyards remain defined by the OSM multipolygon below.
    const n=Math.min(60,Math.max(3,Math.floor(w/5)));
    for(let i=0;i<n;i++) {
      const x=-w/2+(i+0.5)*w/n;
      box(g,w/n*0.7,Math.min(5,h*0.5),0.12,x,Math.min(3,h*0.3),d/2+0.1,glass());
    }
    bands(g,w,d,h,4.5);
  } else {
    box(g,w,h,d,0,h/2,0,white());
    const red=material('retail-red',/Costco/.test(b.name)?0xb12630:0xb93d37,0.1,0.6);
    box(g,w*0.9,2.5,0.25,0,Math.max(h-3,3),d/2+0.2,red);
    box(g,w*0.6,3,0.2,0,2,d/2+0.3,glass());
  }
  batch(g);g.position.set(l.x,0,l.z);g.rotation.y=-l.angle;
  // Signed platform footprints must follow the same local transform as the geometry.
  if(g.userData.platforms.length) {
    const co=Math.cos(-l.angle),si=Math.sin(-l.angle);
    g.userData.platforms=g.userData.platforms.map(p=>{
      const tf=q=>({x:l.x+q.x*co-q.z*si,z:l.z+q.x*si+q.z*co});
      const footprint=p.footprint.map(tf);
      const ramp=p.ramp?{...tf({x:p.ramp.ax,z:p.ramp.az}),h0:p.ramp.h0,bx:tf({x:p.ramp.bx,z:p.ramp.bz}).x,bz:tf({x:p.ramp.bx,z:p.ramp.bz}).z,h1:p.ramp.h1}:undefined;
      if(ramp){ramp.ax=tf({x:p.ramp.ax,z:p.ramp.az}).x;ramp.az=tf({x:p.ramp.ax,z:p.ramp.az}).z;}
      return {footprint,height:p.height,ramp};
    });
  }
  return g;
}
