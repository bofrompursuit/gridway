import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const BOROUGHS = {1:'Manhattan', 2:'Bronx', 3:'Brooklyn', 4:'Queens', 5:'Staten Island'};

export function buildCatalog(rows, boundaryRows, previous = {}, retrieved = '2026-10-19') {
  const perBorough = previous.numbering === 'per-borough';
  const registry = Object.fromEntries(Object.entries(previous.idRegistry || {}).filter(([key]) => perBorough || key.startsWith('1:')));
  for (const road of previous.roads || []) {
    if (perBorough || (road.boroughCode || 1) === 1) registry[`${road.boroughCode || 1}:${road.name}`] = road.id;
  }
  const nextIds = Object.fromEntries(Object.keys(BOROUGHS).map(code => [code,
    Math.max(0, ...Object.entries(registry).filter(([key]) => key.startsWith(code + ':')).map(([, id]) => id)) + 1]));
  const groups = new Map(), sourceCounts = {};
  for (const row of rows) {
    const code = Number(row.boroughcode), name = String(row.full_street_name || '').trim().replace(/\s+/g, ' ');
    if (!BOROUGHS[code] || !name || row.the_geom?.type !== 'MultiLineString') throw Error('Invalid NYC street row');
    sourceCounts[code] = (sourceCounts[code] || 0) + 1;
    if (['CONNECTOR', 'UNNAMED ST'].includes(name)) continue;
    const key = `${code}:${name}`;
    if (!groups.has(key)) groups.set(key, {name, boroughCode:code, borough:BOROUGHS[code], lines:[]});
    for (const line of row.the_geom.coordinates) {
      if (line.length < 2) continue;
      groups.get(key).lines.push(line.map(([lng, lat]) => {
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 40 || lat > 42 || lng < -75 || lng > -73) throw Error('Invalid NYC street coordinate');
        return [Math.round(lat * 1e6) / 1e6, Math.round(lng * 1e6) / 1e6];
      }));
    }
  }
  if (Object.keys(sourceCounts).length !== 5) throw Error('Street data must include every borough');
  const collator = new Intl.Collator('en', {numeric:true});
  const roads = [...groups.entries()].sort(([, a], [, b]) => a.boroughCode - b.boroughCode || collator.compare(a.name, b.name)).map(([key, road]) => {
    if (!registry[key]) registry[key] = nextIds[road.boroughCode]++;
    return {id:registry[key], ...road};
  });
  const boroughs = boundaryRows.map(b => ({code:Number(b.borocode), name:BOROUGHS[Number(b.borocode)], geometry:b.the_geom}));
  if (boroughs.length !== 5 || new Set(boroughs.map(b => b.code)).size !== 5 || boroughs.some(b => !b.name || b.geometry?.type !== 'MultiPolygon')) throw Error('Invalid five-borough boundaries');
  return {source:'NYC Open Data Street Centerline (CSCL), inkn-q76z', sourceUrl:'https://data.cityofnewyork.us/d/inkn-q76z', boundarySourceUrl:'https://data.cityofnewyork.us/d/wh2p-dxnf', retrieved,
    scope:'NYC five boroughs; boroughcode in 1..5; rw_type=1 (streets)', numbering:'per-borough', sourceCounts, idRegistry:registry, boroughs, roads};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const folder = process.argv[2];
  if (!folder) throw Error('Usage: node tools/import_streets.mjs SOURCE_DIRECTORY [OUTPUT_JSON] [YYYY-MM-DD]');
  const target = process.argv[3] || fileURLToPath(new URL('../dist/streets.json', import.meta.url));
  const read = path => JSON.parse(readFileSync(path, 'utf8'));
  const previous = read(target), rows = [];
  for (const code of Object.keys(BOROUGHS)) {
    const page = read(resolve(folder, `borough-${code}.json`));
    if (!Array.isArray(page) || !page.length || page.length >= 50000 || page.some(r => Number(r.boroughcode) !== Number(code))) throw Error('Missing borough data or query limit reached; paginate before importing');
    rows.push(...page);
  }
  const data = buildCatalog(rows, read(resolve(folder, 'borough-boundaries.json')), previous, process.argv[4] || '2026-10-19');
  writeFileSync(target, JSON.stringify(data) + '\n');
  console.log(JSON.stringify({roads:data.roads.length, sourceCounts:data.sourceCounts, bytes:readFileSync(target).length}));
}
