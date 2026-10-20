import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {displayName,segmentDistance,nearestRoad,findRoads,roadOrientation,createCityBoundary} from '../dist/road-model.mjs';
import {buildCatalog} from '../tools/import_streets.mjs';
const {roads,boroughs} = JSON.parse(readFileSync(new URL('../dist/streets.json',import.meta.url)));
const city = createCityBoundary(boroughs);

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
  assert.equal(new Set(roads.map(r=>`${r.boroughCode}:${r.id}`)).size,roads.length);
  assert.equal(new Set(roads.map(r=>`${r.boroughCode}:${r.name}`)).size,roads.length);
  assert.ok(roads.every(r=>Number.isInteger(r.id)&&r.id>0&&r.lines.length));
  assert.ok(roads.every(r=>!['CONNECTOR','UNNAMED ST'].includes(r.name)));
  const broadway=roads.find(r=>r.name==='BROADWAY');
  assert.ok(broadway.lines.length>20,'Broadway segments share a single ID');
});

test('all five boroughs contain streets and recognize real NYC locations',()=>{
  const locations = [
    [1,40.758,-73.9855], [2,40.8296,-73.9262], [3,40.6925,-73.9903],
    [4,40.758,-73.8303], [5,40.6437,-74.0736]
  ];
  assert.equal(roads.length,9892);
  for(const [code,lat,lng] of locations){
    assert.ok(roads.some(r=>r.boroughCode===code));
    assert.equal(city.boroughAt({lat,lng}).code,code);
    assert.ok(nearestRoad({lat,lng},roads,300));
  }
});

test('outside NYC points are rejected, including neighbors inside the map rectangle',()=>{
  for(const point of [
    {lat:40.7178,lng:-74.0431}, // Jersey City
    {lat:40.742,lng:-74.0324}, // Hoboken
    {lat:40.9115,lng:-73.7824}, // New Rochelle
    {lat:40.663,lng:-73.708}, // Valley Stream, Nassau
    {lat:40.5776,lng:-74.2776}, // New Jersey west of Staten Island
    {lat:34.05,lng:-118.24}, {lat:NaN,lng:-74}, null
  ]) assert.equal(city.contains(point),false);
});

test('boundary holes and outside crossings between valid route vertices are rejected',()=>{
  const square=(x,y,size)=>[[x,y],[x+size,y],[x+size,y+size],[x,y+size],[x,y]];
  const sample=Array.from({length:5},(_,i)=>({code:i+1,name:String(i+1),geometry:{type:'MultiPolygon',coordinates:[[square(i*10,0,4)]]}}));
  sample[0].geometry.coordinates[0].push(square(1,1,2));
  const area=createCityBoundary(sample);
  assert.equal(area.contains({lat:2,lng:2}),false);
  assert.equal(area.contains({lat:0,lng:0}),true);
  assert.equal(area.routeInside([[.5,2],[3.5,2]]),false);
  assert.equal(area.routeInside([[.5,.5],[3.5,.5]]),true);
  assert.equal(area.routeInside([[.5,.5],[10.5,.5]]),false);
  assert.throws(()=>createCityBoundary(sample.slice(0,4)));
});

test('importer preserves borough-specific IDs and separates duplicate street names',()=>{
  const rows=Array.from({length:5},(_,i)=>({boroughcode:String(i+1),full_street_name:'BROADWAY',the_geom:{type:'MultiLineString',coordinates:[[[-74,40.7],[-74,40.71]]]}}));
  const boundaries=boroughs.map(b=>({borocode:b.code,the_geom:b.geometry}));
  const first=buildCatalog(rows,boundaries,{roads:[{id:86,name:'BROADWAY'}]});
  assert.equal(first.roads[0].id,86);
  assert.deepEqual(first.roads.map(r=>r.id),[86,1,1,1,1]);
  const again=buildCatalog([...rows].reverse(),boundaries,first);
  assert.deepEqual(again.roads.map(r=>r.id),first.roads.map(r=>r.id));
  assert.throws(()=>buildCatalog(rows.slice(0,4),boundaries,first));
  const queens=findRoads('Broadway Queens',first.roads);
  assert.equal(queens.length,1);
  assert.equal(queens[0].boroughCode,4);
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
  assert.ok(findRoads(String(broadway.id),roads).includes(broadway));
  assert.ok(findRoads('Road '+broadway.id,roads).includes(broadway));
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

test('road numbers restart at one and stay unique within each borough',()=>{
  for(const code of [1,2,3,4,5]){
    const subset=roads.filter(r=>r.boroughCode===code);
    assert.equal(Math.min(...subset.map(r=>r.id)),1);
    assert.equal(new Set(subset.map(r=>r.id)).size,subset.length);
  }
  assert.equal(findRoads('Road 1',roads).length,5);
});
