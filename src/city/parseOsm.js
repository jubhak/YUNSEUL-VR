function ringArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    sum += a.x * b.z - b.x * a.z;
  }
  return sum / 2;
}

function ensureCCW(ring) {
  return ringArea(ring) > 0 ? ring : ring.slice().reverse();
}

function parseHeight(tags = {}) {
  const raw =
    tags.height ||
    tags["building:height"] ||
    tags["roof:height"];
  if (raw) {
    const n = parseFloat(String(raw).replace(/m$/i, "").trim());
    if (Number.isFinite(n) && n > 0) return Math.min(n, 350);
  }
  const levels = parseFloat(tags["building:levels"] || tags.levels || "");
  if (Number.isFinite(levels) && levels > 0) {
    return Math.min(levels * 3.2, 350);
  }
  const minLevels = parseFloat(tags["building:min_level"] || "");
  if (Number.isFinite(minLevels) && minLevels > 0) {
    return Math.min(minLevels * 3.2 + 3.2, 350);
  }
  const kind = tags.building;
  if (kind === "apartments" || kind === "residential") return 40 + Math.random() * 28;
  if (kind === "commercial" || kind === "office" || kind === "yes") {
    return 22 + Math.random() * 48;
  }
  if (kind === "retail" || kind === "shop" || kind === "supermarket") {
    return 9 + Math.random() * 8;
  }
  if (kind === "hotel") return 50 + Math.random() * 40;
  if (kind === "garage" || kind === "shed" || kind === "roof") return 3.5;
  return 14 + Math.random() * 18;
}

function buildingStyleFromTags(tags = {}) {
  const kind = tags.building;
  if (
    kind === "retail" ||
    kind === "shop" ||
    kind === "supermarket" ||
    kind === "commercial" ||
    kind === "mall" ||
    kind === "kiosk" ||
    tags.shop ||
    tags.amenity === "marketplace" ||
    tags.amenity === "restaurant" ||
    tags.amenity === "cafe"
  ) {
    return "retail";
  }
  if (kind === "office" || kind === "apartments" || kind === "hotel" || kind === "yes") {
    return "glass";
  }
  return "mixed";
}

function roadWidth(tags = {}) {
  const hw = tags.highway;
  if (tags.width) {
    const w = parseFloat(tags.width);
    if (Number.isFinite(w)) return Math.max(2, Math.min(w, 40));
  }
  const lanes = parseFloat(tags.lanes || "");
  if (Number.isFinite(lanes) && lanes > 0) return Math.min(lanes * 3.5, 36);
  switch (hw) {
    case "motorway":
    case "trunk":
      return 16;
    case "primary":
      return 14;
    case "secondary":
      return 12;
    case "tertiary":
      return 10;
    case "residential":
    case "unclassified":
    case "living_street":
      return 8.5;
    case "service":
      return 5.5;
    case "cycleway":
      return 2.5;
    case "footway":
    case "path":
    case "pedestrian":
      return 2.2;
    default:
      return 5.5;
  }
}

function collectWays(elements) {
  const nodes = new Map();
  const ways = new Map();
  const relations = [];

  for (const el of elements) {
    if (el.type === "node") nodes.set(el.id, el);
    else if (el.type === "way") ways.set(el.id, el);
    else if (el.type === "relation") relations.push(el);
  }

  function wayCoords(way, project) {
    if (!way?.nodes) return null;
    const pts = [];
    for (const id of way.nodes) {
      const n = nodes.get(id);
      if (!n) continue;
      const p = project(n.lon, n.lat);
      pts.push({ x: p.x, z: p.z, lon: n.lon, lat: n.lat });
    }
    return pts.length >= 2 ? pts : null;
  }

  return { nodes, ways, relations, wayCoords };
}

export function parseOsmCity(osmData, project) {
  const { ways, relations, wayCoords } = collectWays(osmData.elements || []);

  const buildings = [];
  const roads = [];
  const waters = [];
  const parks = [];

  for (const way of ways.values()) {
    const tags = way.tags || {};
    const coords = wayCoords(way, project);
    if (!coords) continue;

    if (tags.building || tags.shop) {
      if (coords.length < 3) continue;
      const ring = ensureCCW(coords);
      const type = tags.building || (tags.shop ? "retail" : "yes");
      buildings.push({
        id: way.id,
        footprint: ring,
        height: parseHeight({ ...tags, building: type }),
        name: tags.name || tags["name:ko"] || "",
        type,
        style: buildingStyleFromTags({ ...tags, building: type }),
      });
      continue;
    }

    if (tags.highway) {
      roads.push({
        id: way.id,
        path: coords,
        width: roadWidth(tags),
        highway: tags.highway,
        name: tags.name || tags["name:ko"] || "",
      });
      continue;
    }

    if (tags.natural === "water" || tags.water || tags.waterway === "riverbank") {
      if (coords.length >= 3) {
        waters.push({ id: way.id, footprint: ensureCCW(coords) });
      }
      continue;
    }

    if (tags.leisure === "park") {
      if (coords.length >= 3) {
        parks.push({ id: way.id, footprint: ensureCCW(coords) });
      }
      continue;
    }

    if (
      (tags.landuse === "retail" || tags.landuse === "commercial") &&
      coords.length >= 3
    ) {
      buildings.push({
        id: way.id,
        footprint: ensureCCW(coords),
        height: 10 + Math.random() * 8,
        name: tags.name || tags["name:ko"] || "",
        type: "retail",
        style: "retail",
      });
    }
  }

  // Multipolygon buildings / water / parks from relations
  for (const rel of relations) {
    const tags = rel.tags || {};
    const outers = [];
    for (const member of rel.members || []) {
      if (member.type !== "way" || member.role !== "outer") continue;
      const way = ways.get(member.ref);
      const coords = wayCoords(way, project);
      if (coords?.length >= 3) outers.push(ensureCCW(coords));
    }
    if (!outers.length) continue;

    if (tags.building || tags.shop) {
      const type = tags.building || "retail";
      for (const ring of outers) {
        buildings.push({
          id: `rel-${rel.id}`,
          footprint: ring,
          height: parseHeight({ ...tags, building: type }),
          name: tags.name || tags["name:ko"] || "",
          type,
          style: buildingStyleFromTags({ ...tags, building: type }),
        });
      }
    } else if (tags.natural === "water" || tags.water) {
      for (const ring of outers) waters.push({ id: `rel-${rel.id}`, footprint: ring });
    } else if (tags.leisure === "park") {
      for (const ring of outers) parks.push({ id: `rel-${rel.id}`, footprint: ring });
    }
  }

  return { buildings, roads, waters, parks };
}
