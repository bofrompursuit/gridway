import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {displayName,segmentDistance,nearestRoad,findRoads,roadOrientation,roadCenter,numberRoadsGeographically,GEOGRAPHIC_NUMBERING,createCityBoundary} from '../dist/road-model.mjs';
import {buildCatalog} from '../tools/import_streets.mjs';
import {renumberCatalog} from '../tools/renumber_streets.mjs';
const catalog = JSON.parse(readFileSync(new URL('../dist/streets.json',import.meta.url)));
const {roads,boroughs} = catalog;
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

test('importer replaces old IDs with geographic numbers within each borough',()=>{
  const rows=Array.from({length:5},(_,i)=>({boroughcode:String(i+1),full_street_name:'BROADWAY',the_geom:{type:'MultiLineString',coordinates:[[[-74,40.7],[-74,40.71]]]}}));
  const boundaries=boroughs.map(b=>({borocode:b.code,the_geom:b.geometry}));
  const first=buildCatalog(rows,boundaries,{roads:[{id:86,name:'BROADWAY'}]});
  assert.deepEqual(first.roads.map(r=>r.id),[1,1,1,1,1]);
  assert.deepEqual(first.numberingDetails,GEOGRAPHIC_NUMBERING);
  const again=buildCatalog([...rows].reverse(),boundaries,first);
  assert.deepEqual(again,first);
  const west={boroughcode:'1',full_street_name:'WEST ROAD',the_geom:{type:'MultiLineString',coordinates:[[[-74.01,40.7],[-74.01,40.71]]]}};
  const added=buildCatalog([...rows,west],boundaries,first);
  assert.equal(added.roads.find(r=>r.boroughCode===1&&r.name==='WEST ROAD').id,1);
  assert.equal(added.roads.find(r=>r.boroughCode===1&&r.name==='BROADWAY').id,2);
  assert.equal(added.idRegistry['1:BROADWAY'],2);
  assert.equal(added.idRegistry['2:BROADWAY'],1);
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
    const subset=roads.filter(r=>r.boroughCode===code).sort((a,b)=>a.id-b.id);
    assert.deepEqual(subset.map(r=>r.id),Array.from({length:subset.length},(_,i)=>i+1));
    assert.equal(new Set(subset.map(r=>r.id)).size,subset.length);
  }
  assert.equal(findRoads('Road 1',roads).length,5);
});

test('geographic numbering sorts vertical roads west to east and horizontal roads south to north',()=>{
  const vertical=(name,lng)=>({name,boroughCode:1,lines:[[[40.7,lng],[40.72,lng]]]});
  const horizontal=(name,lat)=>({name,boroughCode:1,lines:[[[lat,-74],[lat,-73.98]]]});
  const sample=[horizontal('ALPHA NORTH',40.72),vertical('ALPHA EAST',-73.98),
    horizontal('ZULU SOUTH',40.7),vertical('ZULU WEST',-74)];
  const numbered=numberRoadsGeographically(sample);
  assert.deepEqual(numbered.map(r=>[r.name,r.id]),[
    ['ZULU WEST',1],['ALPHA EAST',2],['ZULU SOUTH',3],['ALPHA NORTH',4]
  ]);
  assert.ok(sample.every(r=>r.id===undefined),'numbering does not mutate source roads');
});

test('shared crossings keep unequal-length diagonal streets in geographic order',()=>{
  const west={name:'WEST',boroughCode:1,lines:[[[40.705,-73.9975],[40.71,-73.995]]]};
  const east={name:'EAST',boroughCode:1,lines:[[[40.7,-73.999],[40.706,-73.996]]]};
  const south={name:'SOUTH',boroughCode:1,lines:[[[40.7025,-73.995],[40.705,-73.99]]]};
  const north={name:'NORTH',boroughCode:1,lines:[[[40.701,-74],[40.704,-73.994]]]};
  assert.ok(roadCenter(west).lng>roadCenter(east).lng,'whole-road centers alone reverse west and east');
  assert.ok(roadCenter(south).lat>roadCenter(north).lat,'whole-road centers alone reverse south and north');
  assert.deepEqual(numberRoadsGeographically([north,east,south,west]).map(r=>r.name),['WEST','EAST','SOUTH','NORTH']);
  const split=road=>({...road,lines:road.lines.map(line=>line.flatMap((point,i)=>i
    ? [[(line[i-1][0]+point[0])/2,(line[i-1][1]+point[1])/2],point] : [point]))});
  assert.deepEqual(numberRoadsGeographically([west,east,south,north].map(split)).map(r=>r.name),['WEST','EAST','SOUTH','NORTH']);
});

test('Manhattan cross streets and common avenues follow their shared local geographic order',()=>{
  const local=names=>names.map(name=>roads.find(r=>r.boroughCode===1&&r.name===name));
  const west=local(['W 39 ST','W 40 ST','W 41 ST','W 42 ST','W 43 ST']);
  const east=local(['E 39 ST','E 40 ST','E 41 ST','E 42 ST','E 43 ST']);
  const avenues=local(['12 AVE','11 AVE','10 AVE','9 AVE','8 AVE','7 AVE','AVE OF THE AMERICAS',
    '5 AVE','MADISON AVE','PARK AVE','LEXINGTON AVE','3 AVE','2 AVE','1 AVE']);
  for(const sequence of [west,east,avenues]) {
    assert.ok(sequence.every(Boolean));
    for(let i=1;i<sequence.length;i++) assert.ok(sequence[i-1].id<sequence[i].id,
      `${sequence[i-1].name} precedes ${sequence[i].name}`);
  }
});

test('crossing and disconnected roads use deterministic center and name fallback',()=>{
  const sample=[
    {name:'Z CROSSING',lines:[[[40.701,-74],[40.7,-73.98]]]},
    {name:'A CROSSING',lines:[[[40.7,-74],[40.701,-73.98]]]},
    {name:'DISCONNECTED SOUTH',lines:[[[40.69,-74.02],[40.69,-74.01]]]}
  ];
  const result=numberRoadsGeographically(sample);
  assert.deepEqual(result.map(r=>r.name),['DISCONNECTED SOUTH','A CROSSING','Z CROSSING']);
  assert.deepEqual(numberRoadsGeographically(sample.slice().reverse()),result);
});

test('road centers weight segment length instead of vertex count',()=>{
  const sparse={lines:[[[40.7,-74],[40.7,-73.98]],[[40.7,-74],[40.71,-74]]]};
  const dense={lines:[[[40.7,-74],[40.7,-73.998],[40.7,-73.997],[40.7,-73.98]],[[40.7,-74],[40.71,-74]]]};
  const center=roadCenter(sparse), denseCenter=roadCenter(dense);
  assert.ok(Math.abs(center.lat-denseCenter.lat)<1e-12);
  assert.ok(Math.abs(center.lng-denseCenter.lng)<1e-12);
  const reversed={lines:sparse.lines.slice().reverse().map(line=>line.slice().reverse())};
  assert.ok(Math.abs(roadCenter(reversed).lat-center.lat)<1e-12);
  assert.ok(Math.abs(roadCenter(reversed).lng-center.lng)<1e-12);
  const numbered=numberRoadsGeographically([{...sparse,name:'B ROAD'}, {...dense,name:'A ROAD'}]);
  assert.deepEqual(numbered.map(r=>r.name),['A ROAD','B ROAD']);
  assert.deepEqual(roadCenter({lines:[[[40.7,-74],[40.7,-74]]]}),{lat:40.7,lng:-74});
});

test('geographic ties use the other coordinate and then street name regardless of input order',()=>{
  const vertical=(name,lat)=>({name,boroughCode:1,lines:[[[lat,-74],[lat+.001,-74]]]});
  const horizontal=(name,lng)=>({name,boroughCode:1,lines:[[[40.75,lng],[40.75,lng+.001]]]});
  const sample=[vertical('Z NAME',40.7),vertical('A NAME',40.7),vertical('SOUTH',40.69),
    horizontal('Z NAME',-73.99),horizontal('A NAME',-73.99),horizontal('WEST',-74)];
  const expected=['SOUTH','A NAME','Z NAME','WEST','A NAME','Z NAME'];
  assert.deepEqual(numberRoadsGeographically(sample).map(r=>r.name),expected);
  assert.deepEqual(numberRoadsGeographically(sample.slice().reverse()).map(r=>r.name),expected);
});

test('bundled five-borough catalog follows the shared geographic policy and refreshed registry',()=>{
  assert.deepEqual(catalog.numberingDetails,GEOGRAPHIC_NUMBERING);
  assert.equal(Object.keys(catalog.idRegistry).length,roads.length);
  assert.deepEqual(numberRoadsGeographically(roads),roads);
  const reversed=roads.slice().reverse().map(road=>({...road,lines:road.lines.slice().reverse().map(line=>line.slice().reverse())}));
  const reordered=numberRoadsGeographically(reversed);
  assert.deepEqual(reordered.map(r=>[r.boroughCode,r.name,r.id]),roads.map(r=>[r.boroughCode,r.name,r.id]));
  for(const road of roads) assert.equal(catalog.idRegistry[`${road.boroughCode}:${road.name}`],road.id);
});

test('renumbering changes IDs and registry while preserving geometry, boundaries, and source metadata',()=>{
  const sample={source:'original source',retrieved:'original date',sourceCounts:{1:2},boroughs,
    roads:[{id:1,name:'EAST',boroughCode:1,lines:[[[40.7,-73.99],[40.71,-73.99]]]},
      {id:99,name:'WEST',boroughCode:1,lines:[[[40.7,-74],[40.71,-74]]]}],
    idRegistry:{'1:EAST':1,'1:WEST':99,'1:REMOVED':100}};
  const result=renumberCatalog(sample);
  assert.equal(result.source,sample.source);
  assert.equal(result.retrieved,sample.retrieved);
  assert.deepEqual(result.sourceCounts,sample.sourceCounts);
  assert.equal(result.boroughs,sample.boroughs);
  assert.deepEqual(result.idRegistry,{'1:WEST':1,'1:EAST':2});
  for(const road of result.roads) assert.equal(road.lines,sample.roads.find(r=>r.name===road.name).lines);
  assert.deepEqual(renumberCatalog(result),result);
});
