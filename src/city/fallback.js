/**
 * Overpass 실패 시 사용하는 최소 송도 스타일 격자 도시.
 * 실제 OSM 스키마(node/way)와 동일한 형태로 반환.
 */
export function createFallbackCity(songdo) {
  const { lat: clat, lon: clon } = songdo.center;
  const elements = [];
  let nid = 1;
  let wid = 1;

  function addBuilding(cx, cz, w, d, levels, name) {
    // approximate deg offsets (~111km lat, ~88km lon at 37N)
    const dLat = cz / 111320;
    const dLon = cx / (111320 * Math.cos((clat * Math.PI) / 180));
    const halfW = w / 2 / (111320 * Math.cos((clat * Math.PI) / 180));
    const halfD = d / 2 / 111320;
    const corners = [
      { lat: clat + dLat + halfD, lon: clon + dLon - halfW },
      { lat: clat + dLat + halfD, lon: clon + dLon + halfW },
      { lat: clat + dLat - halfD, lon: clon + dLon + halfW },
      { lat: clat + dLat - halfD, lon: clon + dLon - halfW },
      { lat: clat + dLat + halfD, lon: clon + dLon - halfW },
    ];
    const nodeIds = [];
    for (const c of corners) {
      elements.push({ type: "node", id: nid, lat: c.lat, lon: c.lon });
      nodeIds.push(nid++);
    }
    elements.push({
      type: "way",
      id: wid++,
      nodes: nodeIds,
      tags: {
        building: "apartments",
        "building:levels": String(levels),
        name: name || "",
      },
    });
  }

  function addRoad(points, highway = "residential") {
    const nodeIds = [];
    for (const [x, z] of points) {
      const dLat = z / 111320;
      const dLon = x / (111320 * Math.cos((clat * Math.PI) / 180));
      elements.push({
        type: "node",
        id: nid,
        lat: clat + dLat,
        lon: clon + dLon,
      });
      nodeIds.push(nid++);
    }
    elements.push({
      type: "way",
      id: wid++,
      nodes: nodeIds,
      tags: { highway },
    });
  }

  // grid of towers inspired by Songdo skyline
  for (let ix = -4; ix <= 4; ix++) {
    for (let iz = -3; iz <= 3; iz++) {
      if (Math.abs(ix) < 1 && Math.abs(iz) < 1) continue; // park hole
      const x = ix * 55 + (iz % 2) * 8;
      const z = iz * 60;
      const levels = 8 + ((Math.abs(ix) * 3 + Math.abs(iz) * 2) % 20);
      addBuilding(x, z, 28 + (ix % 3) * 6, 22 + (iz % 2) * 8, levels, `Tower ${ix},${iz}`);
    }
  }

  // roads
  for (let i = -4; i <= 4; i++) {
    addRoad(
      [
        [-240, i * 60],
        [240, i * 60],
      ],
      i === 0 ? "primary" : "residential",
    );
    addRoad(
      [
        [i * 55, -220],
        [i * 55, 220],
      ],
      "secondary",
    );
  }

  // central park
  const parkNodes = [];
  const parkCorners = [
    [-40, -40],
    [40, -40],
    [40, 40],
    [-40, 40],
    [-40, -40],
  ];
  for (const [x, z] of parkCorners) {
    const dLat = z / 111320;
    const dLon = x / (111320 * Math.cos((clat * Math.PI) / 180));
    elements.push({ type: "node", id: nid, lat: clat + dLat, lon: clon + dLon });
    parkNodes.push(nid++);
  }
  elements.push({
    type: "way",
    id: wid++,
    nodes: parkNodes,
    tags: { leisure: "park", name: "송도 센트럴파크 (폴백)" },
  });

  // water canal
  const waterNodes = [];
  const waterCorners = [
    [-25, -15],
    [25, -15],
    [25, 15],
    [-25, 15],
    [-25, -15],
  ];
  for (const [x, z] of waterCorners) {
    const dLat = z / 111320;
    const dLon = x / (111320 * Math.cos((clat * Math.PI) / 180));
    elements.push({ type: "node", id: nid, lat: clat + dLat, lon: clon + dLon });
    waterNodes.push(nid++);
  }
  elements.push({
    type: "way",
    id: wid++,
    nodes: waterNodes,
    tags: { natural: "water", name: "센트럴파크 수로" },
  });

  return { elements };
}
