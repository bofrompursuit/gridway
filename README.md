# Gridway

A map-first Manhattan street-reference demo. Each named road has one stable numeric Gridway reference. Selecting a number highlights that road's geometry; there are no coordinate cells or cell-offset instructions.

## Run locally

From the repository root:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

Open <http://127.0.0.1:8000>. There is no build step, package install, backend, or API key configuration. Use HTTP rather than opening the HTML as a file, because the app loads a bundled JSON catalog and JavaScript modules.

Internet access is required for Leaflet, OpenStreetMap tiles, NYC GeoSearch address search, and external Google Maps walking directions. The street catalog is bundled locally. Device location requires browser permission and HTTPS or localhost.

## What it does

- Draws actual Manhattan street centerlines, with numeric labels on roads rather than grid cells.
- Colors mostly vertical roads blue and mostly horizontal roads amber. Lines and number labels share the same color; the legend names both groups. Direction uses the length-weighted geometry of the whole road, so bends do not change its color. Selection adds a wider line and white halo.
- Assigns one Gridway reference to each normalized street name. All segments under that name share the reference. East and West street names have separate references.
- Highlights the selected road throughout its available geometry. Map labels avoid overlapping each other; zoom in to see local roads. A reference can appear again as the map moves, but its number stays the same.
- Looks up a road by its Gridway number or real street name, without a remote request.
- Searches start and destination addresses using NYC Planning's GeoSearch service after a 500 ms typing pause (at least three characters), or immediately on submission.
- Shows a nearby road reference for each endpoint when a catalog road is within 150 meters. This is proximity to a centerline, not a verified entrance, address match, or walking instruction.
- Requests device location once, only after clicking **Use my location**.
- Opens Google Maps for walking directions. It does not calculate or draw a route, provide in-app turn-by-turn directions, or integrate the Google Maps JavaScript API.

Gridway numbers are app references, not official street numbers, addresses, block numbers, or emergency-service identifiers. Numbered-road coverage is Manhattan. Address search and the Google Maps link remain available outside that coverage.

Searches are sent to NYC GeoSearch; the map provider receives the viewed area; opening Google Maps shares the selected origin and destination with Google. State stays in memory and is not persisted by the app. Viewing the road catalog does not make a live street-data API request.

## Street data and stable references

`dist/streets.json` contains a frozen snapshot of [NYC Open Data Street Centerline (CSCL)](https://data.cityofnewyork.us/d/inkn-q76z), retrieved October 19, 2026. It includes 909 normalized street names and 9,988 centerline geometries. Coordinates are rounded to six decimal places. The source is roadbed centerline geometry, not a pedestrian routing network. Generic `CONNECTOR` and `UNNAMED ST` features are excluded because they can refer to unrelated roads.

Source API query:

```text
https://data.cityofnewyork.us/resource/inkn-q76z.json
$where=boroughcode="1" AND rw_type="1"
$select=the_geom,full_street_name,physicalid
$limit=50000
$order=physicalid
```

To rebuild from a downloaded response:

```sh
python3 tools/import_streets.py /path/to/centerlines.json
```

The argument is the local JSON response file. Keep the existing `dist/streets.json` when refreshing: the importer preserves its name-to-number mapping and appends IDs for new names. Review name changes and removals before publishing a refresh. The initial assignment follows natural name order; it does not imply travel order or geographic position.

## Checks

With Node.js installed:

```sh
node --check dist/app.mjs
node --test tests/road-model.test.mjs
```

Browser checks: select a numbered road; look up Broadway and a numeric reference; toggle street numbers; reset the example; submit an address search; check the walking-directions destination; check mobile layout and keyboard focus. Do not request real location for a routine demo check.

## Hosting

Deploy on Render as a **Static Site**. The root `render.yaml` deploys branch `main`, checks that `dist/index.html` exists, and publishes `dist`. No package installation, server process, or environment variables are required.

For manual setup, connect `https://github.com/bofrompursuit/gridway`, select branch `main`, leave the root directory at the repository root, set the build command to `test -f dist/index.html`, and set the publish directory to `dist`. No start command is needed.

Local `.env` files are not published and are not read by this static app. The NYC API settings in `.env.example` are reserved for future integration; address search uses NYC GeoSearch directly in the browser. Never put secret API keys into browser JavaScript or the published `dist` directory.

## Source provenance

The original repository imported the earlier coordinate demo from source commit `ba9af7fef9fe6630cad84eccee8148dec7c95c22`. The street-reference revision replaces that demo's artificial coordinate overlay and splits its HTML, styles, and behavior into separate static files.
