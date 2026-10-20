import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {GEOGRAPHIC_NUMBERING, numberRoadsGeographically} from '../dist/road-model.mjs';

export function renumberCatalog(catalog) {
  const roads = numberRoadsGeographically(catalog.roads);
  return {...catalog, numbering:'per-borough', numberingDetails:GEOGRAPHIC_NUMBERING,
    idRegistry:Object.fromEntries(roads.map(road => [`${road.boroughCode || 1}:${road.name}`, road.id])), roads};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = process.argv[2] || fileURLToPath(new URL('../dist/streets.json', import.meta.url));
  const catalog = JSON.parse(readFileSync(target, 'utf8'));
  const data = renumberCatalog(catalog);
  writeFileSync(target, JSON.stringify(data) + '\n');
  console.log(JSON.stringify({roads:data.roads.length, numbering:data.numberingDetails.method}));
}
