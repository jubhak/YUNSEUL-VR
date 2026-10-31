// OSM ways may be open fragments of multipolygon rings. Join by node id before triangulation.
function stitch(parts) {
  const pending = parts.filter(p => p?.length >= 2).map(p => [...p]);
  const rings = [];
  while (pending.length) {
    const ring = pending.shift();
    let changed = true;
    while (changed && ring[0] !== ring.at(-1)) {
      changed = false;
      for (let i = 0; i < pending.length; i++) {
        const p = pending[i];
        if (ring.at(-1) === p[0]) ring.push(...p.slice(1));
        else if (ring.at(-1) === p.at(-1)) ring.push(...p.slice(0,-1).reverse());
        else if (ring[0] === p.at(-1)) ring.unshift(...p.slice(0,-1));
        else if (ring[0] === p[0]) ring.unshift(...p.slice(1).reverse());
        else continue;
        pending.splice(i,1); changed = true; break;
      }
    }
    if (ring.length >= 4 && ring[0] === ring.at(-1)) rings.push(ring);
  }
  return rings;
}
export function pointInRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length-1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.z > p.z) !== (b.z > p.z) && p.x < (b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x) inside = !inside;
  }
  return inside;
}
export function pointInPolygon(p, polygon) {
  return pointInRing(p, polygon.footprint) && !(polygon.holes || []).some(h => pointInRing(p,h));
}
function stableRandom(id) {
  const n = Math.sin(Number(String(id).replace(/\D/g,"")) * 12.9898) * 43758.5453;
  return n - Math.floor(n);
}
function height(tags, id) {
  const explicit = parseFloat(tags.height || tags["building:height"]);
  if (explicit > 0) return Math.min(explicit, 350);
  const levels = parseFloat(tags["building:levels"]);
  if (levels > 0) return Math.min(levels * 3.2, 350);
  const kind = tags.building;
  const r = stableRandom(id);
  if (kind === "apartments" || kind === "residential") return 48+r*45;
  if (kind === "office" || kind === "hotel") return 35+r*45;
  if (kind === "garage" || kind === "shed" || kind === "roof") return 3.5;
  return 9+r*15;
}
function roadWidth(t) {
  const explicit = parseFloat(t.width); if (explicit > 0) return Math.min(explicit, 45);
  const lanes = parseFloat(t.lanes); if (lanes > 0) return Math.min(lanes*3.3,40);
  return ({motorway:16,trunk:16,primary:14,secondary:11,tertiary:9,residential:7,service:4.5,cycleway:2.5,footway:2.5,path:2.2,pedestrian:4,steps:2})[t.highway] || 5;
}
function category(t) {
  if (t.building || t["building:part"]) return "buildings";
  if (t.natural === "water" || t.water || t.waterway === "riverbank") return "waters";
  if (["golf_course","nature_reserve","recreation_ground"].includes(t.leisure) || ["fairway","green","rough","bunker"].includes(t.golf)) return "parks";
  if (t.amenity === "parking") return "parking";
  if (t.leisure === "park" || t.leisure === "garden" || ["grass","forest","meadow"].includes(t.landuse) || ["wood","grassland"].includes(t.natural)) return "parks";
  return null;
}
export function parseOsmCity(data, project) {
  const elements = data.elements || [];
  const nodes = new Map(elements.filter(e => e.type === "node").map(e => [e.id,e]));
  const ways = new Map(elements.filter(e => e.type === "way").map(e => [e.id,e]));
  const city = {buildings:[],roads:[],waters:[],parks:[],parking:[],artworks:[]};
  const consumed = new Set();
  const coords = ids => ids.every(id=>nodes.has(id)) ? ids.map(id => {const n=nodes.get(id);return project(n.lon,n.lat);}) : [];
  function add(kind,id,t,footprint,holes=[]) {
    if (footprint.length < 3) return;
    const item = {id,footprint,holes,name:t["name:ko"] || t.name || "", tags:t};
    if (kind === "buildings") Object.assign(item, {
      height:height(t,id), type:t.building || "yes",
      style:(t.building === "office" || t.building === "hotel") ? "glass" : "mixed",
    });
    city[kind].push(item);
  }
  for (const n of nodes.values()) {
    if (n.tags?.tourism === "artwork") city.artworks.push({id:`node-${n.id}`, position:project(n.lon,n.lat), name:n.tags["name:ko"] || n.tags.name || "이름 미등록 작품", tags:n.tags});
  }
  for (const rel of elements.filter(e => e.type === "relation")) {
    const t = rel.tags || {}, kind = category(t); if (!kind) continue;
    const members = (rel.members || []).filter(m => m.type === "way" && ways.has(m.ref));
    const outers = stitch(members.filter(m => m.role !== "inner").map(m => ways.get(m.ref).nodes));
    const inners = stitch(members.filter(m => m.role === "inner").map(m => ways.get(m.ref).nodes)).map(coords);
    outers.forEach((ring,i) => {
      const outer = coords(ring);
      add(kind,`rel-${rel.id}-${i}`,t,outer,inners.filter(h => h.length && pointInRing(h[0],outer)));
    });
    if (outers.length) members.forEach(m => consumed.add(`${kind}:${m.ref}`));
  }
  for (const w of ways.values()) {
    const t = w.tags || {}, path = coords(w.nodes || []);
    if (path.length < 2) continue;
    if (t.highway && !["construction","proposed","platform"].includes(t.highway)) {
      city.roads.push({id:w.id,path,width:roadWidth(t),highway:t.highway,name:t.name || "",oneway:t.oneway === "yes",bridge:!!t.bridge && t.bridge !== "no"});
      continue;
    }
    const kind = category(t);
    if (kind && !consumed.has(`${kind}:${w.id}`) && w.nodes?.[0] === w.nodes?.at(-1)) add(kind,w.id,t,path);
  }
  return city;
}
