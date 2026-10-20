import { displayName, nearestRoad, findRoads } from './road-model.mjs';
const $ = id => document.getElementById(id);
let map, roadLayer, selectedLayer, pointLayer, labelLayer, selectedRoad;
let roads = [], searchTimer, searchController, searchVersion = 0;
const cache = new Map();
let start = {lat:40.7536,lng:-73.9832,name:'Bryant Park, NYC'};
let end = {lat:40.7527,lng:-73.9772,name:'Grand Central Terminal, NYC'};
const EXAMPLE = [{...start}, {...end}];

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
    L.polyline(road.lines, {color:'#316a4d', weight:6, opacity:1, interactive:false}).addTo(selectedLayer);
  }
  if (fit) map.fitBounds(L.latLngBounds(road.lines.flat()), {
    paddingTopLeft:innerWidth > 650 ? [390,85] : [35,50], paddingBottomRight:[45,45], maxZoom:16
  });
  drawRoads();
}

function intersects(road, b) {
  return road.bounds[0] <= b.getNorth() && road.bounds[2] >= b.getSouth()
    && road.bounds[1] <= b.getEast() && road.bounds[3] >= b.getWest();
}

function drawRoads() {
  if (!map) return;
  roadLayer.clearLayers(); labelLayer.clearLayers();
  if (!$('roadsToggle').checked) { $('mapNote').textContent = 'Street numbers hidden · Turn them on to explore roads'; return; }
  if (!roads.length) { $('mapNote').textContent = 'Street references unavailable · Address search still works'; return; }
  if (map.getZoom() < 14) { $('mapNote').textContent = 'Zoom in to see numbered streets'; return; }
  $('mapNote').textContent = 'One number per named road · Select a number to see the street';
  const b = map.getBounds(), size = map.getSize();
  const visible = roads.filter(r => intersects(r, b));
  // Prioritize the selected road, then the roads nearest the viewport center.
  const candidates = [];
  for (const road of visible) {
    const path = L.polyline(road.lines, {color:'#52755f', weight:2, opacity:.55, bubblingMouseEvents:false}).addTo(roadLayer);
    path.on('click', () => setRoad(road));
    let best, score = Infinity;
    for (const line of road.lines) for (let i = 1; i < line.length; i++) {
      const a = line[i-1], c = line[i];
      const point = [(a[0]+c[0])/2, (a[1]+c[1])/2];
      if (!b.contains(point)) continue;
      const pixel = map.latLngToContainerPoint(point);
      if (pixel.x < 25 || pixel.x > size.x-30 || pixel.y < 20 || pixel.y > size.y-30) continue;
      // Avoid placing labels underneath the desktop search panel.
      if (innerWidth > 650 && pixel.x < 390 && pixel.y < document.querySelector('.card').offsetHeight + 35) continue;
      const d = Math.hypot(pixel.x-size.x/2, pixel.y-size.y/2);
      if (d < score) { score = d; best = {point, pixel}; }
    }
    if (best) candidates.push({road, ...best, score});
  }
  candidates.sort((a,c) => Number(c.road.id === selectedRoad?.id)-Number(a.road.id === selectedRoad?.id) || a.score-c.score);
  const placed = [];
  for (const c of candidates) {
    if (placed.some(p => Math.abs(p.x-c.pixel.x)<65 && Math.abs(p.y-c.pixel.y)<40)) continue;
    const button = document.createElement('button');
    button.className = 'road-badge'; button.textContent = c.road.id;
    button.setAttribute('aria-label', `Road ${c.road.id}, ${displayName(c.road.name)}`);
    button.setAttribute('aria-pressed', String(c.road.id === selectedRoad?.id));
    button.onclick = () => { setRoad(c.road); $('roadNumber').focus({preventScroll:true}); };
    // A real button is the only keyboard target; the Leaflet marker is decorative.
    L.marker(c.point, {keyboard:false, interactive:false, icon:L.divIcon({className:'', html:button, iconSize:[42,28], iconAnchor:[21,14]})}).addTo(labelLayer);
    placed.push(c.pixel);
  }
}

function update(fit = true) {
  $('originRoad').textContent = roadText(start);
  $('destinationRoad').textContent = roadText(end);
  const url = new URL('https://www.google.com/maps/dir/');
  url.search = new URLSearchParams({api:'1', origin:`${start.lat},${start.lng}`, destination:`${end.lat},${end.lng}`, travelmode:'walking'});
  $('google').href = url.toString();
  if (!map) return;
  pointLayer.clearLayers();
  for (const [point, type] of [[start,'start'],[end,'dest']]) {
    const popup = document.createElement('div'); popup.textContent = `${point.name} · ${roadText(point)}`;
    L.marker([point.lat,point.lng], {icon:L.divIcon({className:'', html:`<div class="pin ${type==='dest'?'dest':''}">${type==='dest'?'B':'A'}</div>`, iconSize:[28,28], iconAnchor:[14,14]})}).bindPopup(popup).addTo(pointLayer);
  }
  if (fit) map.fitBounds([[start.lat,start.lng],[end.lat,end.lng]], {
    paddingTopLeft:innerWidth>650?[390,85]:[35,50], paddingBottomRight:[45,45], maxZoom:16
  });
  const match = nearestRoad(start, roads);
  if (match) setRoad(match.road);
  drawRoads();
}

function initMap() {
  if (!window.L) { $('fallback').textContent='Map could not load. Street lookup and Google Maps directions still work.'; return; }
  map = L.map('map',{zoomControl:false}).setView([40.754,-73.981],16);
  L.control.zoom({position:'topright'}).addTo(map);
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
  tiles.on('load', () => $('fallback').classList.add('hidden'));
  tiles.on('tileerror', () => { $('fallback').classList.remove('hidden'); $('fallback').textContent='Some map tiles are unavailable. Street lookup and Google Maps directions still work.'; });
  roadLayer = L.layerGroup().addTo(map);
  selectedLayer = L.layerGroup().addTo(map);
  labelLayer = L.layerGroup().addTo(map);
  pointLayer = L.layerGroup().addTo(map);
  map.on('moveend',drawRoads);
  update();
}

async function loadRoads() {
  try {
    const response = await fetch('./streets.json');
    if (!response.ok) throw Error('Street catalog unavailable');
    const data = await response.json();
    if (!Array.isArray(data.roads) || !data.roads.length) throw Error('Empty street catalog');
    roads = data.roads;
    for (const road of roads) {
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
    $('roadName').textContent='Reload to try again. Address search and Google Maps still work.';
    $('roadStatus').textContent='Could not load the Manhattan street catalog.';
    drawRoads();
  }
}

function cancelSearch(){clearTimeout(searchTimer);searchVersion++;searchController?.abort();$('results').replaceChildren();$('status').textContent=''}
async function search(kind,autocomplete=false){
  clearTimeout(searchTimer);searchController?.abort();const version=++searchVersion;
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
      button.onclick=()=>{if(version!==searchVersion)return;cancelSearch();const point={lat:f.geometry.coordinates[1],lng:f.geometry.coordinates[0],name};if(kind==='start')start=point;else end=point;input.value=name;update()};
      $('results').appendChild(button);
    }
  }catch(e){if(version!==searchVersion)return;$('status').textContent=navigator.onLine===false?'No Internet Access. Reconnect, then search again.':'Address search is temporarily unavailable. Try again.'}
  finally{clearTimeout(timeout)}
}
for(const [id,kind] of [['origin','start'],['destination','end']]){
  $(id).addEventListener('input',()=>{cancelSearch();if($(id).value.trim().length<3)return;$('status').textContent='Waiting for you to finish typing...';searchTimer=setTimeout(()=>search(kind,true),500)});
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
$('roadsToggle').onchange = () => { selectedLayer?.clearLayers(); if (selectedRoad) setRoad(selectedRoad); else drawRoads(); };
$('locate').onclick = () => {
  cancelSearch();
  if (!navigator.geolocation) { $('status').textContent='Location is unavailable here. Enter a starting address.'; return; }
  $('status').textContent='Requesting your location…';
  navigator.geolocation.getCurrentPosition(pos => {
    start={lat:pos.coords.latitude,lng:pos.coords.longitude,name:'My location'};
    $('origin').value='My location'; $('status').textContent=`Location found (accuracy about ${Math.round(pos.coords.accuracy)} m).`; update();
  }, err => { $('status').textContent=err.code===1?'Location permission was declined. Enter a starting address.':'Could not get your location. Enter a starting address.'; }, {enableHighAccuracy:true,timeout:12000,maximumAge:60000});
};
$('example').onclick = () => {
  cancelSearch();
  start={...EXAMPLE[0]}; end={...EXAMPLE[1]};
  $('origin').value=start.name; $('destination').value=end.name;
  $('status').textContent=''; $('results').replaceChildren();
  $('roadResults').replaceChildren(); $('roadStatus').textContent=''; $('roadQuery').value=''; update();
};
initMap(); update(false); loadRoads();
