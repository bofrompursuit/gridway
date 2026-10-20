import test from 'node:test';
import assert from 'node:assert/strict';
import {BOROUGH_PREFIXES, roadReference, parseRoadReference} from '../dist/road-reference.mjs';
import {findRoads} from '../dist/road-model.mjs';

test('borough references are distinct even when numbers and names match', () => {
  const roads = Object.keys(BOROUGH_PREFIXES).map(code => ({boroughCode:Number(code), id:1, name:'BROADWAY'}));
  assert.deepEqual(roads.map(roadReference), ['M1','BX1','BK1','Q1','S1']);
  for (const road of roads) assert.deepEqual(findRoads(roadReference(road), roads), [road]);
  assert.deepEqual(findRoads('1', roads), roads);
  assert.deepEqual(findRoads('Broadway', roads), roads);
});

test('prefixed references accept common spacing and reject invalid boroughs or IDs', () => {
  for (const query of ['bk23','BK 23','Road BK23','#BK23','Road #BK-23']) {
    assert.deepEqual(parseRoadReference(query), {boroughCode:3,id:23});
  }
  for (const query of ['B23','BK0','BK-1.5','Q','M-2X','BK999999999999999999999999','']) assert.equal(parseRoadReference(query), null);
  assert.deepEqual(findRoads('BK23', [{boroughCode:2,id:23,name:'BROADWAY'}]), []);
});
