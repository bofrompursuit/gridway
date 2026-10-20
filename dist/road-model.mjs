import {parseRoadReference} from './road-reference.mjs';

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

export const GEOGRAPHIC_NUMBERING = Object.freeze({
  method:'geographic',
  vertical:'west-to-east',
  horizontal:'south-to-north',
  groupOrder:'vertical first, then horizontal; one continuous sequence per borough',
  position:'shared latitude crossings for vertical roads; shared longitude crossings for horizontal roads',
  comparison:'median road crossings sampled at 25%, 50%, and 75% of the shared extent; at least two valid samples, and every valid sample must agree',
  conflicts:'apply longest shared extents first; reject constraints that create a cycle',
  fallback:'length-weighted road center for roads without a shared ordering constraint',
  distance:'local equirectangular projection at the midpoint of the road latitude bounds',
  ties:'secondary center coordinate, then street name',
  precisionDegrees:1e-9,
  minimumSharedExtentDegrees:0.00005,
  minimumCrossingSeparationDegrees:1e-7,
  reassignOnImport:true
});

export function roadCenter(road) {
  let south = Infinity, north = -Infinity, west = Infinity, east = -Infinity;
  for (const line of road.lines) for (const [lat, lng] of line) {
    south = Math.min(south, lat); north = Math.max(north, lat);
    west = Math.min(west, lng); east = Math.max(east, lng);
  }
  if (!Number.isFinite(south)) throw Error('Road geometry is required for geographic numbering');
  // One longitude scale for the whole road keeps the center independent of
  // how often a straight segment was split into vertices in the source data.
  const scale = Math.cos((south + north) * Math.PI / 360);
  let total = 0, latitude = 0, longitude = 0;
  for (const line of road.lines) for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    const length = Math.hypot((b[1] - a[1]) * scale, b[0] - a[0]);
    total += length;
    latitude += (a[0] + b[0]) / 2 * length;
    longitude += (a[1] + b[1]) / 2 * length;
  }
  return total ? {lat:latitude / total, lng:longitude / total}
    : {lat:(south + north) / 2, lng:(west + east) / 2};
}

const geographicPosition = coordinate => Math.round(coordinate / GEOGRAPHIC_NUMBERING.precisionDegrees);
const compareNames = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function orderRoadGroup(ranked) {
  const vertical = ranked[0].group === 0, axis = vertical ? 0 : 1, cross = 1 - axis;
  const compare = (a, b) => a.primary - b.primary || a.secondary - b.secondary || compareNames(a.road.name, b.road.name);
  // Start in a canonical order so graph construction never depends on input
  // order, centerline direction, or the previous catalog's numeric IDs.
  ranked.sort(compare);
  const profiles = ranked.map(({road}) => {
    const segments = [], extent = [];
    for (const line of road.lines) {
      for (const point of line) extent.push(point[axis]);
      for (let i = 1; i < line.length; i++) segments.push([line[i - 1], line[i]]);
    }
    return {segments, min:Math.min(...extent), max:Math.max(...extent)};
  });
  const crossingAt = (profile, coordinate) => {
    const crossings = new Set();
    for (const [a, b] of profile.segments) {
      const span = b[axis] - a[axis];
      if (Math.abs(span) < 1e-12 || coordinate < Math.min(a[axis], b[axis]) || coordinate > Math.max(a[axis], b[axis])) continue;
      crossings.add(geographicPosition(a[cross] + (b[cross] - a[cross]) * (coordinate - a[axis]) / span));
    }
    // Duplicate segment endpoints count once, so inserting a source vertex
    // cannot bias the median of a road with several crossings.
    const values = [...crossings].sort((a, b) => a - b), middle = Math.floor(values.length / 2);
    return values.length ? (values[middle] + values[Math.ceil(values.length / 2) - 1]) / 2 : null;
  };
  const candidates = [], gap = GEOGRAPHIC_NUMBERING.minimumCrossingSeparationDegrees / GEOGRAPHIC_NUMBERING.precisionDegrees;
  for (let a = 0; a < ranked.length; a++) for (let b = a + 1; b < ranked.length; b++) {
    const start = Math.max(profiles[a].min, profiles[b].min), end = Math.min(profiles[a].max, profiles[b].max);
    if (end - start < GEOGRAPHIC_NUMBERING.minimumSharedExtentDegrees) continue;
    let direction = 0, samples = 0, agrees = true;
    for (const fraction of [.25, .5, .75]) {
      const coordinate = start + (end - start) * fraction;
      const av = crossingAt(profiles[a], coordinate), bv = crossingAt(profiles[b], coordinate);
      if (av === null || bv === null) continue;
      const difference = bv - av, sign = Math.sign(difference);
      if (Math.abs(difference) <= gap || (direction && direction !== sign)) { agrees = false; break; }
      direction = sign; samples++;
    }
    if (agrees && samples >= 2) candidates.push({from:direction > 0 ? a : b, to:direction > 0 ? b : a, overlap:geographicPosition(end - start)});
  }
  candidates.sort((a, b) => b.overlap - a.overlap
    || compareNames(ranked[a.from].road.name, ranked[b.from].road.name)
    || compareNames(ranked[a.to].road.name, ranked[b.to].road.name));
  const edges = ranked.map(() => []), degrees = ranked.map(() => 0), reach = ranked.map(() => 0n);
  const bits = ranked.map((_, index) => 1n << BigInt(index));
  for (const {from, to} of candidates) {
    // Crossing, curved, and branched named roads can give contradictory
    // constraints. Preserve the strongest comparisons without forming cycles.
    if ((reach[to] & bits[from]) || (reach[from] & bits[to])) continue;
    edges[from].push(to); degrees[to]++;
    const more = reach[to] | bits[to];
    for (let i = 0; i < ranked.length; i++) if (i === from || (reach[i] & bits[from])) reach[i] |= more;
  }
  const ready = [], result = [];
  for (let i = 0; i < ranked.length; i++) if (!degrees[i]) ready.push(i);
  while (ready.length) {
    ready.sort((a, b) => compare(ranked[a], ranked[b]));
    const index = ready.shift();
    result.push(ranked[index].road);
    for (const next of edges[index]) if (--degrees[next] === 0) ready.push(next);
  }
  return result;
}

export function numberRoadsGeographically(roads) {
  const ranked = roads.map(road => {
    const center = roadCenter(road), vertical = roadOrientation(road) === 'vertical';
    return {road, code:road.boroughCode || 1, group:vertical ? 0 : 1,
      primary:geographicPosition(vertical ? center.lng : center.lat),
      secondary:geographicPosition(vertical ? center.lat : center.lng)};
  });
  const boroughs = [...new Set(ranked.map(item => item.code))].sort((a, b) => a - b), result = [];
  for (const code of boroughs) {
    let id = 0;
    for (const group of [0, 1]) {
      const subset = ranked.filter(item => item.code === code && item.group === group);
      if (subset.length) for (const road of orderRoadGroup(subset)) result.push({...road, id:++id});
    }
  }
  return result;
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
  const reference = parseRoadReference(query);
  if (reference) return roads.filter(r => r.boroughCode === reference.boroughCode && r.id === reference.id);
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
