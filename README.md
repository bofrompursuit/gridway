# Gridway

A NYC five-borough street-reference app with a product homepage at `/` and the interactive map at `/map/`. Each named road within a borough has one geographic Gridway reference. Numbering restarts at 1 in each borough and includes a borough prefix: M (Manhattan), BX (Bronx), BK (Brooklyn), Q (Queens), or S (Staten Island). Selecting a number highlights that road's geometry; there are no coordinate cells or cell-offset instructions.

## Run locally

From the repository root:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

Open <http://127.0.0.1:8000> for the homepage or <http://127.0.0.1:8000/map/> for the map. `/map/` is the canonical map URL; `dist/map.html` provides an extensionless `/map` entry on Render and forwards to that page. There is no build step, package install, backend, or API key configuration. Use HTTP rather than opening the HTML as a file, because the app loads a bundled JSON catalog and JavaScript modules.

Internet access is required for Leaflet, OpenStreetMap tiles, NYC GeoSearch address search, and walking-route calculation. The street catalog is bundled locally. Device location requires browser permission and HTTPS or localhost.

## What it does

- Introduces the product on the homepage, with a street photo, three feature cards, and direct links to the map. Feature cards reveal once on scroll; reduced-motion preferences disable the animation.
- Draws actual street centerlines across Manhattan, Bronx, Brooklyn, Queens, and Staten Island, with numeric labels on roads rather than grid cells. Switch between **Numbers** and **Names** on the map; the same road keeps its reference and direction color.
- Colors mostly vertical roads blue and mostly horizontal roads amber. Lines and number labels share the same color; the legend names both groups. Direction uses the length-weighted geometry of the whole road, so bends do not change its color. Selection adds a wider line and white halo.
- Assigns one Gridway reference to each borough and normalized street-name pair. In each borough, vertical roads count west to east first, followed by horizontal roads south to north. All segments of a named road share the reference. East and West street names have separate references.
- Highlights the selected road throughout its available geometry. Map labels avoid overlapping each other; zoom in to see local roads. A reference can appear again as the map moves, but its number stays the same.
- Looks up a road by its full reference (for example, M1, BX1, BK1, Q1, or S1), a number across all boroughs, or its real street name, without a remote request.
- Searches start and destination addresses using NYC Planning's GeoSearch service immediately on each non-empty input change, or on submission. Requests start with the first character; outdated requests are canceled.
- Shows a nearby road reference for each endpoint when a catalog road is within 150 meters. This is proximity to a centerline, not a verified entrance, address match, or walking instruction.
- Requests device location once, only after clicking **Use my location**.
- Draws the walking route between A and B, with distance in miles/meters and estimated walking time, using FOSSGIS foot routing. It does not record GPS travel.

Gridway numbers are app references, not official street numbers, addresses, block numbers, or emergency-service identifiers. Coverage is limited to the five boroughs. Address results, selected endpoints, device location, and walking routes are checked against bundled official NYC municipal boundaries. Outside addresses and locations are rejected. A walking route that leaves NYC is not displayed.

Searches are sent to NYC GeoSearch; the map provider receives the viewed area; selected A and B coordinates are sent to FOSSGIS for route calculation and logged by that provider. State stays in memory and is not persisted by the app. Viewing the road catalog does not make a live street-data API request.

## Street data and geographic numbering

`dist/streets.json` contains a frozen snapshot of [NYC Open Data Street Centerline (CSCL)](https://data.cityofnewyork.us/d/inkn-q76z), retrieved October 19, 2026. It includes 9,892 borough-specific named roads from 99,361 source street records. Road numbers are assigned geographically rather than alphabetically. Coordinates are rounded to six decimal places. The source is roadbed centerline geometry, not a pedestrian routing network. Generic `CONNECTOR` and `UNNAMED ST` features are excluded because they can refer to unrelated roads.

Source API query:

```text
https://data.cityofnewyork.us/resource/inkn-q76z.json
$where=boroughcode="BOROUGH_CODE" AND rw_type="1"
$select=the_geom,full_street_name,physicalid,boroughcode
$limit=50000
$order=physicalid
```

To rebuild from a downloaded response:

```sh
node tools/import_streets.mjs /path/to/source-directory dist/streets.json YYYY-MM-DD
```

Run the query once for each borough code 1 through 5, saving arrays as
`borough-1.json` through `borough-5.json` in the source directory. Each response
must be below the 50,000-record limit; paginate if that limit is reached. The
current largest borough response has 37,883 records. Include the boundary response
as `borough-boundaries.json` from
`https://data.cityofnewyork.us/resource/wh2p-dxnf.json?$limit=5`.

The Node.js importer recomputes geographic numbers within each borough on every
import. Vertical roads receive the first range, west to east; horizontal roads
continue that sequence, south to north. The borough prefix plus number identifies
one road. Parallel roads are compared along their shared extent so unequal road
lengths do not reverse their local order. Curves and crossing roads can have
conflicting positions; the longest shared comparisons take precedence, with the
length-weighted road center and street name resolving remaining ties.

Numbers remain fixed within the bundled catalog. Adding roads or changing their
geometry can renumber other roads on the next import. Old alphabetical references
are replaced. To recompute numbers from the existing bundled geometry without
downloading source data:

```sh
node tools/renumber_streets.mjs
```

`tools/import_streets.py` is an optional Python wrapper around the same Node.js
importer. No Python installation is needed for the Node.js commands.

The bundled boundary source is [NYC Borough Boundaries, water areas included](https://data.cityofnewyork.us/d/wh2p-dxnf).
Boundary checks use polygons, including holes and islands, rather than a rectangular
approximation. Water-inclusive boundaries allow NYC bridges and paths over city
waterways while rejecting neighboring jurisdictions.

| Borough | Named roads | Source street records |
| --- | ---: | ---: |
| Manhattan | 909 | 9,300 |
| Bronx | 1,411 | 13,987 |
| Brooklyn | 1,752 | 23,462 |
| Queens | 2,525 | 37,883 |
| Staten Island | 3,295 | 14,729 |

The map starts with all five boroughs in view. Pan and zoom limits keep the view
center in NYC's extent, and an opaque polygon mask hides map content outside the
municipal boundary. Coverage data must load successfully before address/location
selection is enabled. The app fails closed if that data is unavailable.

## Checks

With Node.js installed:

```sh
node --check dist/app.mjs
node --test tests/*.test.mjs
```

Browser checks: select a numbered road; look up Broadway and a prefixed borough reference; toggle street numbers; reset the example; submit an address search; check walking distance and the drawn route; check mobile layout and keyboard focus. Do not request real location for a routine demo check.

## Hosting

Deploy on Render as a **Static Site**. The root `render.yaml` deploys branch `main`, checks that the homepage, map page, and hero image exist, and publishes `dist`. No package installation, server process, or environment variables are required.

For manual setup, connect `https://github.com/bofrompursuit/gridway`, select branch `main`, leave the root directory at the repository root, set the build command to `test -f dist/index.html`, and set the publish directory to `dist`. No start command is needed.

Local `.env` files are not published and are not read by this static app. The NYC API settings in `.env.example` are reserved for future integration; address search uses NYC GeoSearch directly in the browser. Never put secret API keys into browser JavaScript or the published `dist` directory.

## Source provenance

The original repository imported the earlier coordinate demo from source commit `ba9af7fef9fe6630cad84eccee8148dec7c95c22`. The street-reference revision replaces that demo's artificial coordinate overlay and splits its HTML, styles, and behavior into separate static files.

## Walking routes

The static app calls the public foot-routing service at
`https://routing.openstreetmap.de/routed-foot/route/v1/driving/`.
The `driving` path segment is the OSRM API name; the dedicated `routed-foot`
server computes pedestrian routes. No API key or backend is required. The public
URL is defined in `ROUTING_BASE_URL` in `dist/app.mjs`; static HTML does not
read `.env` files. `WALKING_ROUTING_BASE_URL` in `.env.example` documents the URL
for a future configuration/build integration.

Routes refresh after selecting NYC addresses, setting a device origin, or resetting
the example. Editing an address clears the old route until a match is selected.
Requests are limited to at most one per second per page and cached in memory.
Only routes whose full geometry remains inside NYC are accepted. The app checks
intervals between boundary crossings as well as route vertices. If the provider
returns a route through New Jersey or another outside area, no outside path is
shown; the shared router does not guarantee an alternative that stays in NYC.
Distance and time describe the returned route, not grid displacement or a GPS
recording. Offline, missing-route, timeout, and malformed-response states clear
the old path and offer a refresh action.

Service policy and attribution: <https://routing.openstreetmap.de/about.html>.
This shared service is for light use; availability is not guaranteed.
