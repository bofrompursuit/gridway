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
  return roads.filter(r => displayName(r.name).toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
}
