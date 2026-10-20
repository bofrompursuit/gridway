import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {displayName,segmentDistance,nearestRoad,findRoads,roadOrientation} from '../dist/road-model.mjs';
const {roads} = JSON.parse(readFileSync(new URL('../dist/streets.json',import.meta.url)));

test('orientation handles bends, reversed segments, and zero-length points',()=>{
  const road={lines:[[[40,-74],[40.01,-74],[40.01,-73.999]],[[40.02,-74],[40.01,-74]],[[40,-74],[40,-74]]]};
  assert.equal(roadOrientation(road),'vertical');
  assert.equal(roadOrientation({lines:road.lines.map(line=>[...line].reverse())}),'vertical');
  assert.equal(roadOrientation({lines:[[[40,-74],[40,-73.99]]]}),'horizontal');
});
test('Manhattan avenues and cross streets use different direction groups',()=>{
  assert.equal(roadOrientation(roads.find(r=>r.name==='5 AVE')),'vertical');
  assert.equal(roadOrientation(roads.find(r=>r.name==='W 42 ST')),'horizontal');
  assert.equal(roadOrientation(roads.find(r=>r.name==='E 42 ST')),'horizontal');
});

test('every named road has one distinct numeric reference across all its segments',()=>{
  assert.ok(roads.length>800);
  assert.equal(new Set(roads.map(r=>r.id)).size,roads.length);
  assert.equal(new Set(roads.map(r=>r.name)).size,roads.length);
  assert.ok(roads.every(r=>Number.isInteger(r.id)&&r.id>0&&r.lines.length));
  assert.ok(roads.every(r=>!['CONNECTOR','UNNAMED ST'].includes(r.name)));
  const broadway=roads.find(r=>r.name==='BROADWAY');
  assert.ok(broadway.lines.length>20,'Broadway segments share a single ID');
});
test('coordinates are valid and remain in the New York area',()=>{
  for(const r of roads) for(const line of r.lines){
    assert.ok(line.length>=2);
    for(const [lat,lng] of line){ assert.ok(lat>40&&lat<42&&lng>-75&&lng<-73); }
  }
});
test('street names remain readable, including ordinal exceptions',()=>{
  assert.equal(displayName('W 42 ST'),'West 42nd Street');
  assert.equal(displayName('E 11 ST'),'East 11th Street');
  assert.equal(displayName('5 AVE'),'5th Avenue');
  assert.equal(displayName('BROADWAY'),'Broadway');
});
test('nearest road uses the full segment, not only its endpoints',()=>{
  const sample=[{id:1,lines:[[[40,-74],[40,-73.99]]]},{id:2,lines:[[[40.001,-73.995],[40.002,-73.995]]]}];
  assert.equal(nearestRoad({lat:40,lng:-73.995},sample).road.id,1);
  assert.ok(segmentDistance({lat:40,lng:-73.995},[40,-74],[40,-73.99])<.001);
});
test('a distant point is not assigned a misleading street reference',()=>{
  assert.equal(nearestRoad({lat:34.05,lng:-118.24},roads),null);
});
test('look up a road number, prefixed reference, or real street name',()=>{
  const broadway=roads.find(r=>r.name==='BROADWAY');
  assert.deepEqual(findRoads(String(broadway.id),roads),[broadway]);
  assert.deepEqual(findRoads('Road '+broadway.id,roads),[broadway]);
  assert.ok(findRoads('west 42nd',roads).some(r=>r.name==='W 42 ST'));
  assert.deepEqual(findRoads('no such street',roads),[]);
  assert.deepEqual(findRoads('',roads),[]);
});
test('the NYC example resolves to nearby streets',()=>{
  for(const point of [{lat:40.7536,lng:-73.9832},{lat:40.7527,lng:-73.9772}]){
    const match=nearestRoad(point,roads);
    assert.ok(match&&match.distance<150);
  }
});
