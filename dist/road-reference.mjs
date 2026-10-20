export const BOROUGH_PREFIXES = Object.freeze({1:'M', 2:'BX', 3:'BK', 4:'Q', 5:'S'});

export function roadReference(road) {
  return `${BOROUGH_PREFIXES[road.boroughCode] || ''}${road.id}`;
}

export function parseRoadReference(query) {
  const match = query.trim().replace(/^road\s*#?\s*/i, '').replace(/^#/, '').match(/^(M|BX|BK|Q|S)\s*[-#]?\s*(\d+)$/i);
  if (!match) return null;
  const boroughCode = Number(Object.keys(BOROUGH_PREFIXES).find(code => BOROUGH_PREFIXES[code] === match[1].toUpperCase()));
  const id = Number(match[2]);
  return Number.isSafeInteger(id) && id > 0 ? {boroughCode, id} : null;
}
