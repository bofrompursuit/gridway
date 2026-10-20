// Geometry uses [latitude, longitude], matching Leaflet.
export function roadOrientation(road) {
  let horizontal = 0, vertical = 0;
  // Length-weighted direction keeps one color per road, including bends and
  // reversed centerline segments. Longitude is scaled to ground distance.
  for (const line of road.lines) for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    const dx = (b[1] - a[1]) * Math.cos((a[0] + b[0]) * Math.PI / 360);
    const dy = b[0] - a[0], length = Math.hypot(dx, dy);
    if (length) { horizontal += dx * dx / length; vertical += dy * dy / length; }
  }
  return vertical >= horizontal ? 'vertical' : 'horizontal';
}

export function displayName(name) {
  const words = { W: 'West', E: 'East', N: 'North', S: 'South', ST: 'Street', AVE: 'Avenue',
    BLVD: 'Boulevard', DR: 'Drive', PL: 'Place', RD: 'Road', PKWY: 'Parkway', FDR: 'FDR' };
  return name.split(' ').map((word, i, all) => {
    if (/^\d+$/.test(word) && ['ST', 'AVE'].includes(all[i + 1])) {
      const n = Number(word), last = n % 100;
      return n + (last >= 11 && last <= 13 ? 'th' : ({1:'st',2:'nd',3:'rd'}[n % 10] || 'th'));
    }
    return words[word] || word.charAt(0) + word.slice(1).toLowerCase();
  }).join(' ');
}

export function segmentDistance(point, a, b) {
  const sx = 111320 * Math.cos(point.lat * Math.PI / 180), sy = 111320;
  const ax = (a[1] - point.lng) * sx, ay = (a[0] - point.lat) * sy;
  const bx = (b[1] - point.lng) * sx, by = (b[0] - point.lat) * sy;
  const dx = bx - ax, dy = by - ay, length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length2)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}

export function nearestRoad(point, roads, maxDistance = 150) {
  let result = null, distance = maxDistance;
  for (const road of roads) for (const line of road.lines) for (let i = 1; i < line.length; i++) {
    const d = segmentDistance(point, line[i - 1], line[i]);
    if (d < distance) { distance = d; result = road; }
  }
  return result ? { road: result, distance } : null;
}

export function findRoads(query, roads) {
  const q = query.toLowerCase().trim().replace(/^road\s*#?\s*/, '').replace(/^#/, '');
  if (!q) return [];
  if (/^\d+$/.test(q)) return roads.filter(r => r.id === Number(q));
  return roads.filter(r => `${displayName(r.name)} ${r.borough || ''}`.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
}

// Official municipal polygons use GeoJSON [longitude, latitude] coordinates.
function ringLocation([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j], [bx, by] = ring[i];
    const dx = bx - ax, dy = by - ay, length = Math.hypot(dx, dy);
    if (length && Math.abs((x - ax) * dy - (y - ay) * dx) / length < 1e-10
      && x >= Math.min(ax, bx) - 1e-10 && x <= Math.max(ax, bx) + 1e-10
      && y >= Math.min(ay, by) - 1e-10 && y <= Math.max(ay, by) + 1e-10) return 0;
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside ? 1 : -1;
}

export function createCityBoundary(boroughs) {
  if (!Array.isArray(boroughs) || boroughs.length !== 5
    || new Set(boroughs.map(b => Number(b.code))).size !== 5
    || boroughs.some(b => ![1, 2, 3, 4, 5].includes(Number(b.code)) || typeof b.name !== 'string' || b.geometry?.type !== 'MultiPolygon' || !Array.isArray(b.geometry.coordinates) || !b.geometry.coordinates.length)) throw Error('All five NYC borough boundaries are required');
  const polygons = [], edges = [], maskRings = [];
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const borough of boroughs) for (const rings of borough.geometry.coordinates) {
    if (!rings.length || rings.some(r => r.length < 4)) throw Error('Invalid borough polygon');
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const ring of rings) {
      maskRings.push(ring.map(([lng, lat]) => [lat, lng]));
      for (let i = 0; i < ring.length; i++) {
        const [x, y] = ring[i];
        if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 180 || Math.abs(y) > 90) throw Error('Invalid boundary coordinate');
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        if (i) edges.push([ring[i - 1], ring[i]]);
      }
    }
    west = Math.min(west, minX); south = Math.min(south, minY); east = Math.max(east, maxX); north = Math.max(north, maxY);
    polygons.push({borough, rings, minX, minY, maxX, maxY});
  }
  function boroughAt(point) {
    if (!Number.isFinite(point?.lat) || !Number.isFinite(point?.lng)) return null;
    const p = [point.lng, point.lat];
    for (const polygon of polygons) {
      if (p[0] < polygon.minX || p[0] > polygon.maxX || p[1] < polygon.minY || p[1] > polygon.maxY) continue;
      if (ringLocation(p, polygon.rings[0]) >= 0 && !polygon.rings.slice(1).some(ring => ringLocation(p, ring) === 1)) return polygon.borough;
    }
    return null;
  }
  const contains = point => Boolean(boroughAt(point));
  function routeInside(coordinates) {
    if (!Array.isArray(coordinates) || coordinates.length < 2 || !coordinates.every(p => Array.isArray(p) && contains({lng:p[0], lat:p[1]}))) return false;
    // Check every interval between boundary crossings, not just route vertices.
    for (let i = 1; i < coordinates.length; i++) {
      const a = coordinates[i - 1], b = coordinates[i], dx = b[0] - a[0], dy = b[1] - a[1], cuts = [0, 1];
      for (const [c, d] of edges) {
        if (Math.max(a[0], b[0]) < Math.min(c[0], d[0]) || Math.min(a[0], b[0]) > Math.max(c[0], d[0]) || Math.max(a[1], b[1]) < Math.min(c[1], d[1]) || Math.min(a[1], b[1]) > Math.max(c[1], d[1])) continue;
        const ex = d[0] - c[0], ey = d[1] - c[1], denominator = dx * ey - dy * ex;
        if (Math.abs(denominator) < 1e-15) continue;
        const t = ((c[0] - a[0]) * ey - (c[1] - a[1]) * ex) / denominator;
        const u = ((c[0] - a[0]) * dy - (c[1] - a[1]) * dx) / denominator;
        if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t);
      }
      cuts.sort((x, y) => x - y);
      for (let j = 1; j < cuts.length; j++) {
        if (cuts[j] - cuts[j - 1] < 1e-12) continue;
        const t = (cuts[j] + cuts[j - 1]) / 2;
        if (!contains({lng:a[0] + dx * t, lat:a[1] + dy * t})) return false;
      }
    }
    return true;
  }
  return {contains, boroughAt, routeInside, maskRings, bounds:[[south, west], [north, east]]};
}
