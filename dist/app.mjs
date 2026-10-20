import { displayName, nearestRoad, findRoads } from './road-model.mjs';
const $ = id => document.getElementById(id);
let map, roadLayer, selectedLayer, pointLayer, labelLayer, selectedRoad;
let roads = [], searching = false, lastSearch = 0;
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

async function search(kind){if(searching)return;const input=$(kind==='start'?'origin':'destination'),q=input.value.trim();if(!q)return;searching=true;$('status').textContent='Finding places…';$('results').replaceChildren();try{let data=cache.get(q.toLowerCase());if(!data){const wait=Math.max(0,1200-(Date.now()-lastSearch));if(wait)await new Promise(r=>setTimeout(r,wait));lastSearch=Date.now();const url=new URL('https://photon.komoot.io/api/');url.search=new URLSearchParams({q,limit:'4',lat:'40.75',lon:'-73.98',lang:'en'});const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);let response;try{response=await fetch(url,{signal:controller.signal})}finally{clearTimeout(timeout)}if(!response.ok)throw Error('service');data=await response.json();cache.set(q.toLowerCase(),data)}if(!data.features?.length){$('status').textContent='No places found. Add a street number or city.';return}$('status').textContent='Choose the matching place:';for(const f of data.features){const p=f.properties,name=[p.name,[p.housenumber,p.street].filter(Boolean).join(' '),p.city||p.county,p.state,p.country].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(', ');const button=document.createElement('button');button.textContent=name||'Map location';button.onclick=()=>{const point={lat:f.geometry.coordinates[1],lng:f.geometry.coordinates[0],name};if(kind==='start')start=point;else end=point;input.value=name;$('results').replaceChildren();$('status').textContent='';update()};$('results').appendChild(button)}}catch(e){$('status').textContent='Search is temporarily unavailable. Try again, or open this address in Google Maps.';const u=new URL('https://www.google.com/maps/dir/');u.search=new URLSearchParams({api:'1',origin:$('origin').value,destination:$('destination').value,travelmode:'walking'});$('google').href=u.toString()}finally{searching=false}}

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
  if (!navigator.geolocation) { $('status').textContent='Location is unavailable here. Enter a starting address.'; return; }
  $('status').textContent='Requesting your location…';
  navigator.geolocation.getCurrentPosition(pos => {
    start={lat:pos.coords.latitude,lng:pos.coords.longitude,name:'My location'};
    $('origin').value='My location'; $('status').textContent=`Location found (accuracy about ${Math.round(pos.coords.accuracy)} m).`; update();
  }, err => { $('status').textContent=err.code===1?'Location permission was declined. Enter a starting address.':'Could not get your location. Enter a starting address.'; }, {enableHighAccuracy:true,timeout:12000,maximumAge:60000});
};
$('example').onclick = () => {
  start={...EXAMPLE[0]}; end={...EXAMPLE[1]};
  $('origin').value=start.name; $('destination').value=end.name;
  $('status').textContent=''; $('results').replaceChildren();
  $('roadResults').replaceChildren(); $('roadStatus').textContent=''; $('roadQuery').value=''; update();
};
initMap(); update(false); loadRoads();
