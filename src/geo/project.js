const DEG2RAD = Math.PI / 180;
const METERS_PER_DEG_LAT = 111320;

/**
 * Local tangent-plane projection (Y up).
 * X = east, Z = south (Three.js common city layout).
 */
export function createProjector(originLat, originLon) {
  const cosLat = Math.cos(originLat * DEG2RAD);
  const metersPerDegLon = METERS_PER_DEG_LAT * cosLat;

  function project(lon, lat) {
    const x = (lon - originLon) * metersPerDegLon;
    const z = -(lat - originLat) * METERS_PER_DEG_LAT;
    return { x, z };
  }

  function unproject(x, z) {
    const lon = originLon + x / metersPerDegLon;
    const lat = originLat - z / METERS_PER_DEG_LAT;
    return { lon, lat };
  }

  return { project, unproject, originLat, originLon };
}
