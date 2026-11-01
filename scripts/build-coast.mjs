import fs from 'node:fs';
import { createProjector } from '../src/geo/project.js';
import { SONGDO, SPAWN } from '../src/config.js';

// Bakes the two datasets the OSM tile pipeline intentionally drops:
//  - natural=coastline polylines (so the sea and waterfront promenade exist)
//  - the Incheon Bridge carriageway (so the cable-stayed crossing exists)
// Everything is projected with the same projector the runtime uses.
const data = JSON.parse(fs.readFileSync('scripts/source/songdo.osm.json'));
const projector = createProjector(SONGDO.center.lat, SONGDO.center.lon);
const nodes = new Map(data.elements.filter(e => e.type === 'node').map(e => [e.id, e]));
const round = n => Math.round(n * 100) / 100;

const lineOf = way => (way.nodes || [])
  .map(id => nodes.get(id))
  .filter(Boolean)
  .map(n => { const p = projector.project(n.lon, n.lat); return { x: round(p.x), z: round(p.z) }; });

const coastWays = data.elements
  .filter(e => e.type === 'way' && e.tags?.natural === 'coastline')
  .map(lineOf)
  .filter(l => l.length >= 2);

const bridgeWays = data.elements
  .filter(e => e.type === 'way' && /인천대교/.test(`${e.tags?.name || ''}${e.tags?.['name:ko'] || ''}`))
  .map(lineOf)
  .filter(l => l.length >= 2);

function lengthOf(line) {
  let total = 0;
  for (let i = 1; i < line.length; i++) total += Math.hypot(line[i].x - line[i - 1].x, line[i].z - line[i - 1].z);
  return total;
}
function along(line, distance) {
  let travelled = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (travelled + len >= distance) {
      const t = len ? (distance - travelled) / len : 0;
      return { x: round(a.x + (b.x - a.x) * t), z: round(a.z + (b.z - a.z) * t) };
    }
    travelled += len;
  }
  return line.at(-1);
}

const longest = bridgeWays.slice().sort((a, b) => lengthOf(b) - lengthOf(a))[0];
const bridgeLength = longest ? lengthOf(longest) : 0;
// 800 m main span, 238.5 m reverse-Y pylons (documented values for Incheon Bridge).
const span = 800;
const mid = longest ? along(longest, bridgeLength / 2) : null;
const pylons = mid ? [
  { ...along(longest, Math.max(bridgeLength / 2 - span / 2, 1)), deckY: 46, height: 238.5 },
  { ...along(longest, Math.min(bridgeLength / 2 + span / 2, bridgeLength - 1)), deckY: 46, height: 238.5 },
] : [];

const common = {
  source: 'https://www.openstreetmap.org/copyright',
  license: 'OpenStreetMap contributors, ODbL 1.0',
  generatedFrom: 'scripts/source/songdo.osm.json',
  mapTimestamp: data.osm3s?.timestamp_osm_base || null,
  note: 'Footprint/centreline geometry from OSM. Sculpture and superstructure forms are procedural approximations, not surveyed models.',
};

fs.writeFileSync('public/data/coastline.json', JSON.stringify({ ...common, kind: 'coastline', ways: coastWays }));
fs.writeFileSync('public/data/incheon-bridge.json', JSON.stringify({
  ...common,
  kind: 'incheon-bridge',
  deckY: 46,
  deckWidth: 31.4,
  mainSpan: span,
  mastHeight: 238.5,
  pylons,
  ways: bridgeWays,
  measured: ['총연장 21.38km · 해상교량 12.34km (추출 범위 밖 구간 포함)',
    '왕복 6차로, 폭 31.4m', '주탑 238.5m 역Y형 콘크리트, 주경간 800m'],
}));

// Registered artworks around Central Park. Kept as a separate export because the
// park snapshot (public/data/central-park.json) carries no artwork nodes and the
// tiled loader skips tiles that fall inside the snapshot coverage.
const spawn = projector.project(SPAWN.lon, SPAWN.lat);
const artworks = data.elements
  .filter(e => e.type === 'node' && e.tags?.tourism === 'artwork' && Number.isFinite(e.lon))
  .map(n => {
    const p = projector.project(n.lon, n.lat);
    return {
      id: `node-${n.id}`, x: round(p.x), z: round(p.z),
      name: n.tags['name:ko'] || n.tags.name || '',
      artwork_type: n.tags.artwork_type || '', artist: n.tags.artist_name || '',
    };
  })
  .filter(a => Math.hypot(a.x - spawn.x, a.z - spawn.z) < 1250);
fs.writeFileSync('public/data/park-sculptures.json', JSON.stringify({
  ...common, kind: 'park-sculptures', items: artworks,
  measured: ['조형물 위치: OSM tourism=artwork 노드', '형상: 실측 모델이 아닌 실루엣 근사'],
}));

console.log(JSON.stringify({
  artworks: artworks.length,
  coastWays: coastWays.length,
  coastPoints: coastWays.reduce((n, l) => n + l.length, 0),
  bridgeWays: bridgeWays.length,
  bridgeLengthInsideExtract: Math.round(bridgeLength),
  pylons,
}, null, 2));
