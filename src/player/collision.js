import { pointInPolygon } from '../city/parseOsm.js';

function nearestPoint(p, a, b) {
  const dx=b.x-a.x, dz=b.z-a.z, den=dx*dx+dz*dz;
  const t=den ? Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/den)) : 0;
  return {x:a.x+t*dx,z:a.z+t*dz};
}
function ringFor(c) {
  return c.footprint || [{x:c.minX,z:c.minZ},{x:c.maxX,z:c.minZ},{x:c.maxX,z:c.maxZ},{x:c.minX,z:c.maxZ}];
}
export function resolveMovement(start, target, colliders, radius=0.55) {
  let p={x:start.x,z:start.z};
  const distance=Math.hypot(target.x-start.x,target.z-start.z);
  const steps=Math.max(1,Math.ceil(distance/Math.max(radius*0.65,0.1)));
  const dx=(target.x-start.x)/steps, dz=(target.z-start.z)/steps;
  // Ignore a newly streamed building that encloses the current player, until they can leave it.
  const candidates=colliders.filter(c=>c.height>=1.2 &&
    Math.max(start.x,target.x)+radius>=c.minX && Math.min(start.x,target.x)-radius<=c.maxX &&
    Math.max(start.z,target.z)+radius>=c.minZ && Math.min(start.z,target.z)-radius<=c.maxZ &&
    !pointInPolygon(start,{footprint:ringFor(c),holes:c.holes||[]}));
  for(let step=0;step<steps;step++) {
    p.x+=dx;p.z+=dz;
    for(let pass=0;pass<3;pass++) for(const c of candidates) {
      const outer=ringFor(c), polygon={footprint:outer,holes:c.holes||[]};
      if(p.x<c.minX-radius||p.x>c.maxX+radius||p.z<c.minZ-radius||p.z>c.maxZ+radius)continue;
      let nearest=null,best=Infinity;
      for(const ring of [outer,...polygon.holes]) for(let i=0;i<ring.length;i++) {
        const q=nearestPoint(p,ring[i],ring[(i+1)%ring.length]);
        const d=Math.hypot(p.x-q.x,p.z-q.z);
        if(d<best){best=d;nearest=q;}
      }
      if(!nearest)continue;
      const inside=pointInPolygon(p,polygon);
      if(!inside&&best>=radius)continue;
      let nx=p.x-nearest.x,nz=p.z-nearest.z;
      if(best<1e-8){nx=start.x-nearest.x;nz=start.z-nearest.z;}
      const len=Math.hypot(nx,nz)||1,sign=inside?-1:1;
      p.x=nearest.x+sign*nx/len*(radius+0.001);
      p.z=nearest.z+sign*nz/len*(radius+0.001);
    }
  }
  return p;
}
