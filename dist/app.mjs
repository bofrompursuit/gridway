import { displayName, nearestRoad, findRoads, roadOrientation } from './road-model.mjs';
const $ = id => document.getElementById(id);
const theme = getComputedStyle(document.documentElement);
const ROAD_COLORS = {
  vertical: theme.getPropertyValue('--road-vertical').trim(),
  horizontal: theme.getPropertyValue('--road-horizontal').trim()
};
let map, roadLayer, selectedLayer, pointLayer, labelLayer, selectedRoad, routeLayer;
let roads = [], searchController, searchVersion = 0, labelMode = 'numbers';
const cache = new Map();
let start = {lat:40.7536,lng:-73.9832,name:'Bryant Park, NYC'};
let end = {lat:40.7527,lng:-73.9772,name:'Grand Central Terminal, NYC'};
const EXAMPLE = [{...start}, {...end}];

function mapFitOptions() {
  const headerHeight = document.querySelector('.map-header').offsetHeight;
  return {
    paddingTopLeft: innerWidth > 650 ? [390, 85 + headerHeight] : [35, 50 + headerHeight],
    paddingBottomRight: [45, 45], maxZoom: 16
  };
}

function roadText(point) {
  if (!roads.length) return 'Street references unavailable';
  const match = nearestRoad(point, roads);
  return match ? `Near Road ${match.road.id} · ${displayName(match.road.name)}` : 'No nearby numbered road in the Manhattan catalog';
}

function setRoad(road, fit = false) {
  selectedRoad = road;
  $('roadNumber').textContent = `Road ${road.id}`;
  $('roadName').textContent = displayName(road.name);
  if (!map) return;
  selectedLayer.clearLayers();
  if ($('roadsToggle').checked) {
    L.polyline(road.lines, {color:'#fff', weight:10, opacity:1, interactive:false}).addTo(selectedLayer);
    L.polyline(road.lines, {color:ROAD_COLORS[road.orientation], weight:6, opacity:1, interactive:false}).addTo(selectedLayer);
  }
  if (fit) map.fitBounds(L.latLngBounds(road.lines.flat()), mapFitOptions());
  drawRoads();
}

function intersects(road, b) {
  return road.bounds[0] <= b.getNorth() && road.bounds[2] >= b.getSouth()
    && road.bounds[1] <= b.getEast() && road.bounds[3] >= b.getWest();
}

function drawRoads() {
  if (!map) return;
  roadLayer.clearLayers(); labelLayer.clearLayers();
  if (!$('roadsToggle').checked) { $('mapNote').textContent = 'Road labels hidden · Turn them on to explore roads'; return; }
  if (!roads.length) { $('mapNote').textContent = 'Street references unavailable · Address search still works'; return; }
  if (map.getZoom() < 14) { $('mapNote').textContent = 'Zoom in to see street labels'; return; }
  $('mapNote').textContent = labelMode === 'names' ? 'Street names · Select a label to highlight the road' : 'One number per named road · Select a number to see the street';
  const b = map.getBounds(), size = map.getSize();
  const headerHeight = document.querySelector('.map-header').offsetHeight;
  const visible = roads.filter(r => intersects(r, b));
  // Prioritize the selected road, then the roads nearest the viewport center.
  const candidates = [];
  for (const road of visible) {
    const path = L.polyline(road.lines, {color:ROAD_COLORS[road.orientation], weight:2.5, opacity:.8, bubblingMouseEvents:false}).addTo(roadLayer);
    path.on('click', () => setRoad(road));
    let best, score = Infinity;
    for (const line of road.lines) for (let i = 1; i < line.length; i++) {
      const a = line[i-1], c = line[i];
      const point = [(a[0]+c[0])/2, (a[1]+c[1])/2];
      if (!b.contains(point)) continue;
      const pixel = map.latLngToContainerPoint(point);
      const labelPadding = labelMode === 'names' ? 85 : 30;
      if (pixel.x < labelPadding || pixel.x > size.x-labelPadding || pixel.y < headerHeight+20 || pixel.y > size.y-30) continue;
      if (pixel.x > size.x-210 && pixel.y < headerHeight+205) continue; // Keep labels clear of map controls.
      // Avoid placing labels underneath the desktop search panel.
      if (innerWidth > 650 && pixel.x < 390 && pixel.y < headerHeight + document.querySelector('.card').offsetHeight + 35) continue;
      const d = Math.hypot(pixel.x-size.x/2, pixel.y-size.y/2);
      if (d < score) { score = d; best = {point, pixel}; }
    }
    if (best) candidates.push({road, ...best, score});
  }
  candidates.sort((a,c) => Number(c.road.id === selectedRoad?.id)-Number(a.road.id === selectedRoad?.id) || a.score-c.score);
  const placed = [];
  for (const c of candidates) {
    if (placed.some(p => Math.abs(p.x-c.pixel.x)<(labelMode === 'names' ? 170 : 65) && Math.abs(p.y-c.pixel.y)<40)) continue;
    const button = document.createElement('button');
    button.className = `road-badge road-${c.road.orientation}${labelMode === 'names' ? ' road-badge--name' : ''}`;
    button.textContent = labelMode === 'names' ? displayName(c.road.name) : c.road.id;
    button.title = `Road ${c.road.id} · ${displayName(c.road.name)}`;
    button.setAttribute('aria-label', `Road ${c.road.id}, ${displayName(c.road.name)}, mostly ${c.road.orientation}`);
    button.setAttribute('aria-pressed', String(c.road.id === selectedRoad?.id));
    button.onclick = () => { setRoad(c.road); $('roadNumber').focus({preventScroll:true}); };
    // A real button is the only keyboard target; the Leaflet marker is decorative.
    L.marker(c.point, {keyboard:false, interactive:false, icon:L.divIcon({className:'', html:button, iconSize:[labelMode === 'names' ? 150 : 42,28], iconAnchor:[labelMode === 'names' ? 75 : 21,14]})}).addTo(labelLayer);
    placed.push(c.pixel);
  }
}

const ROUTING_BASE_URL='https://routing.openstreetmap.de/routed-foot/route/v1/driving/';
let routeTimer,routeController,routeVersion=0,lastRouteStarted=0,routeKey='';
const routeCache=new Map(),dirtyFields=new Set();
function clearWalkingRoute(){
  clearTimeout(routeTimer);routeController?.abort();routeVersion++;routeKey='';
  routeLayer?.clearLayers();$('routeSummary').setAttribute('aria-busy','false');
  $('routeDistance').textContent='A to B';$('routeTime').textContent='';
}
function fitRoute(points){map.fitBounds(points,mapFitOptions())}
function renderWalkingRoute(route,fit){
  routeLayer.clearLayers();const points=route.geometry.coordinates.map(([lng,lat])=>[lat,lng]);
  L.polyline(points,{color:'#193c33',weight:6,opacity:.9,interactive:false}).addTo(routeLayer);
  const meters=Math.round(route.distance),minutes=Math.ceil(route.duration/60);
  $('routeDistance').textContent=(route.distance/1609.344).toFixed(2)+' mi';
  $('routeTime').textContent=meters+' m | About '+minutes+' min walk';
  $('routeState').textContent='Live | Walking route from A to B';
  if(fit)fitRoute([...points,[start.lat,start.lng],[end.lat,end.lng]]);
}
function requestWalkingRoute(fit=true,force=false){
  if(dirtyFields.size){clearWalkingRoute();$('routeState').textContent='Select a matching address for each edited field.';return}
  const key=[start.lng,start.lat,end.lng,end.lat].join(',');
  if(!force&&routeKey===key)return;
  clearWalkingRoute();routeKey=key;const version=routeVersion;
  if(!map||!routeLayer){$('routeState').textContent='Map temporarily unavailable. Reload to try again.';return}
  if(start.lat===end.lat&&start.lng===end.lng){$('routeDistance').textContent='0 mi';$('routeTime').textContent='0 m | 0 min walk';$('routeState').textContent='A and B are the same location.';return}
  if(navigator.onLine===false){routeKey='';$('routeState').textContent='No Internet Access. Reconnect, then refresh the route.';return}
  if(!force&&routeCache.has(key)){renderWalkingRoute(routeCache.get(key),fit);return}
  $('routeSummary').setAttribute('aria-busy','true');$('routeState').textContent='Finding walking route...';
  const coordinates=start.lng+','+start.lat+';'+end.lng+','+end.lat;
  routeTimer=setTimeout(async()=>{
    const controller=new AbortController();routeController=controller;
    const timeout=setTimeout(()=>controller.abort(),15000);
    try{
      lastRouteStarted=Date.now();
      const url=new URL(ROUTING_BASE_URL+coordinates);url.search=new URLSearchParams({overview:'full',geometries:'geojson',steps:'false'});
      const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw Error('service');
      const data=await response.json();if(version!==routeVersion)return;
      if(['NoRoute','NoSegment'].includes(data.code)){$('routeState').textContent='No walking route found between A and B. Choose another address.';routeKey='';return}
      const route=data.routes?.[0],coords=route?.geometry?.coordinates;
      if(data.code!=='Ok'||!Number.isFinite(route?.distance)||route.distance<0||!Number.isFinite(route?.duration)||route.duration<0||route.geometry?.type!=='LineString'||!Array.isArray(coords)||coords.length<2||!coords.every(p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Math.abs(p[0])<=180&&Number.isFinite(p[1])&&Math.abs(p[1])<=90))throw Error('response');
      if(routeCache.size>=20)routeCache.delete(routeCache.keys().next().value);routeCache.set(key,route);
      renderWalkingRoute(route,fit);
    }catch(e){if(version!==routeVersion)return;routeKey='';routeLayer.clearLayers();$('routeState').textContent=navigator.onLine===false?'No Internet Access. Reconnect, then refresh the route.':'Walking route temporarily unavailable. Refresh to try again.'}
    finally{clearTimeout(timeout);if(version===routeVersion)$('routeSummary').setAttribute('aria-busy','false')}
  },Math.max(0,1050-(Date.now()-lastRouteStarted)));
}
$('routeRetry').onclick=()=>requestWalkingRoute(true,true);
function update(fit = true) {
  $('originRoad').textContent = roadText(start);
  $('destinationRoad').textContent = roadText(end);
  if (!map) { requestWalkingRoute(fit); return; }
  pointLayer.clearLayers();
  for (const [point, type] of [[start,'start'],[end,'dest']]) {
    const popup = document.createElement('div'); popup.textContent = `${point.name} · ${roadText(point)}`;
    L.marker([point.lat,point.lng], {icon:L.divIcon({className:'', html:`<div class="pin ${type==='dest'?'dest':''}">${type==='dest'?'B':'A'}</div>`, iconSize:[28,28], iconAnchor:[14,14]})}).bindPopup(popup).addTo(pointLayer);
  }
  if (fit) map.fitBounds([[start.lat,start.lng],[end.lat,end.lng]], mapFitOptions());
  const match = nearestRoad(start, roads);
  if (match) setRoad(match.road);
  drawRoads();
  requestWalkingRoute(fit);
}

function initMap() {
  if (!window.L) { $('fallback').textContent='Map could not load. Street lookup still works. Reload to retry the map.'; return; }
  map = L.map('map',{zoomControl:false}).setView([40.754,-73.981],16);
  L.control.zoom({position:'topright'}).addTo(map);
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
  tiles.on('load', () => $('fallback').classList.add('hidden'));
  tiles.on('tileerror', () => { $('fallback').classList.remove('hidden'); $('fallback').textContent='Some map tiles are unavailable. Street lookup and route distance remain available.'; });
  roadLayer = L.layerGroup().addTo(map);
  selectedLayer = L.layerGroup().addTo(map);
  labelLayer = L.layerGroup().addTo(map);
  routeLayer = L.layerGroup().addTo(map);
  pointLayer = L.layerGroup().addTo(map);
  map.attributionControl.addAttribution('Routing: <a href="https://routing.openstreetmap.de/about.html">FOSSGIS</a>');
  map.on('moveend',drawRoads);
  update();
}

async function loadRoads() {
  try {
    const response = await fetch(new URL('./streets.json', import.meta.url));
    if (!response.ok) throw Error('Street catalog unavailable');
    const data = await response.json();
    if (!Array.isArray(data.roads) || !data.roads.length) throw Error('Empty street catalog');
    roads = data.roads;
    for (const road of roads) {
      road.orientation = roadOrientation(road);
      const points = road.lines.flat();
      road.bounds = [Math.min(...points.map(p=>p[0])), Math.min(...points.map(p=>p[1])), Math.max(...points.map(p=>p[0])), Math.max(...points.map(p=>p[1]))];
    }
    $('roadQuery').disabled = false;
    const match = nearestRoad(start, roads);
    if (match) setRoad(match.road);
    else { $('roadNumber').textContent='Choose a street'; $('roadName').textContent='Select a number on the map or search below.'; }
    update(false);
  } catch {
    $('roadNumber').textContent='Street numbers unavailable';
    $('roadName').textContent='Reload to try again. Address search and walking routes still work.';
    $('roadStatus').textContent='Could not load the Manhattan street catalog.';
    drawRoads();
  }
}

function cancelSearch(){searchVersion++;searchController?.abort();$('results').replaceChildren();$('status').textContent=''}
async function search(kind,autocomplete=false){
  searchController?.abort();const version=++searchVersion;
  const input=$(kind==='start'?'origin':'destination'),q=input.value.trim();
  if(!q){$('status').textContent='Enter an NYC street or address to search.';input.focus();return}
  $('results').replaceChildren();
  if(navigator.onLine===false){$('status').textContent='No Internet Access. Reconnect, then search again.';return}
  $('status').textContent='Finding NYC addresses...';
  const controller=new AbortController();searchController=controller;
  const timeout=setTimeout(()=>controller.abort(),12000);
  try{
    const endpoint=autocomplete?'autocomplete':'search',key=endpoint+':'+q.toLowerCase();
    let data=cache.get(key);
    if(!data){
      const url=new URL('https://geosearch.planninglabs.nyc/v2/'+endpoint);
      url.search=new URLSearchParams({text:q,size:'4'});
      const response=await fetch(url,{signal:controller.signal});
      if(!response.ok)throw Error('service');data=await response.json();
      if(!Array.isArray(data.features))throw Error('response');
      data.features=data.features.filter(f=>f?.geometry?.type==='Point'&&Array.isArray(f.geometry.coordinates)&&f.geometry.coordinates.length>=2&&Number.isFinite(f.geometry.coordinates[0])&&Number.isFinite(f.geometry.coordinates[1])&&Math.abs(f.geometry.coordinates[0])<=180&&Math.abs(f.geometry.coordinates[1])<=90&&typeof f.properties?.label==='string'&&f.properties.label.trim()).slice(0,4);
      if(cache.size>=100)cache.delete(cache.keys().next().value);cache.set(key,data);
    }
    if(version!==searchVersion)return;
    if(!data.features.length){$('status').textContent='No NYC addresses found. Add a street number and borough.';return}
    $('status').textContent='Choose the matching NYC address:';
    for(const f of data.features){
      const name=f.properties.label,button=document.createElement('button');button.type='button';button.textContent=name;
      button.onclick=()=>{if(version!==searchVersion)return;cancelSearch();const point={lat:f.geometry.coordinates[1],lng:f.geometry.coordinates[0],name};if(kind==='start')start=point;else end=point;input.value=name;dirtyFields.delete(input.id);update()};
      $('results').appendChild(button);
    }
  }catch(e){if(version!==searchVersion)return;$('status').textContent=navigator.onLine===false?'No Internet Access. Reconnect, then search again.':'Address search is temporarily unavailable. Try again.'}
  finally{clearTimeout(timeout)}
}
for(const [id,kind] of [['origin','start'],['destination','end']]){
  $(id).addEventListener('input',()=>{dirtyFields.add(id);clearWalkingRoute();$('routeState').textContent='Select a matching address for each edited field.';cancelSearch();if(!$(id).value.trim())return;search(kind,true)});
  $(id).addEventListener('focus',()=>cancelSearch());
}

$('originForm').onsubmit = event => { event.preventDefault(); search('start'); };
$('destinationForm').onsubmit = event => { event.preventDefault(); search('end'); };
$('roadNumber').tabIndex = -1;
$('roadQuery').disabled = true;
$('roadForm').onsubmit = event => {
  event.preventDefault(); $('roadResults').replaceChildren();
  if (!roads.length) { $('roadStatus').textContent='Street numbers are unavailable. Reload to try again.'; return; }
  const matches = findRoads($('roadQuery').value, roads);
  $('roadStatus').textContent = matches.length ? `${matches.length} matching road${matches.length===1?'':'s'}${matches.length>6?'; showing the first 6. Add more of the street name to narrow your search.':'.'}` : 'No matching road. Try its full name or a Gridway road number.';
  for (const road of matches.slice(0,6)) {
    const button = document.createElement('button');
    button.textContent = `Road ${road.id} · ${displayName(road.name)}`;
    button.onclick = () => { setRoad(road,true); $('roadResults').replaceChildren(); $('roadStatus').textContent='Street selected on the map.'; $('roadNumber').focus({preventScroll:true}); };
    $('roadResults').appendChild(button);
  }
};
for (const [id, mode] of [['numberLabels','numbers'], ['nameLabels','names']]) {
  $(id).onclick = () => {
    labelMode = mode;
    $('numberLabels').setAttribute('aria-pressed', String(mode === 'numbers'));
    $('nameLabels').setAttribute('aria-pressed', String(mode === 'names'));
    drawRoads();
  };
}
$('roadsToggle').onchange = () => { selectedLayer?.clearLayers(); if (selectedRoad) setRoad(selectedRoad); else drawRoads(); };
$('locate').onclick = () => {
  cancelSearch();
  if (!navigator.geolocation) { $('status').textContent='Location is unavailable here. Enter a starting address.'; return; }
  $('status').textContent='Requesting your location…';
  navigator.geolocation.getCurrentPosition(pos => {
    start={lat:pos.coords.latitude,lng:pos.coords.longitude,name:'My location'};
    $('origin').value='My location'; dirtyFields.delete('origin'); $('status').textContent=`Location found (accuracy about ${Math.round(pos.coords.accuracy)} m).`; update();
  }, err => { $('status').textContent=err.code===1?'Location permission was declined. Enter a starting address.':'Could not get your location. Enter a starting address.'; }, {enableHighAccuracy:true,timeout:12000,maximumAge:60000});
};
$('example').onclick = () => {
  cancelSearch(); dirtyFields.clear();
  start={...EXAMPLE[0]}; end={...EXAMPLE[1]};
  $('origin').value=start.name; $('destination').value=end.name;
  $('status').textContent=''; $('results').replaceChildren();
  $('roadResults').replaceChildren(); $('roadStatus').textContent=''; $('roadQuery').value=''; update();
};
initMap(); update(false); loadRoads();
