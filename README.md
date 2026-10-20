# Gridway

A minimal map-first NYC coordinate demo. The complete app is `dist/index.html`; there is no build step, package install, backend, or API key configuration.

## Run locally

From the repository root, run:

```sh
python -m http.server 8000 --bind 127.0.0.1 --directory dist
```

Open <http://127.0.0.1:8000>. Internet access is required for the map library, map tiles, address search, and external walking directions. Device location requires browser permission and a secure context (HTTPS or localhost).

## What it does

- Displays a Leaflet 1.9.4 map with OpenStreetMap tiles and contributor attribution.
- Searches addresses with Komoot's Photon service after submitting a search.
- Offers a fixed letter-number geographic grid overlay. Letters increase east; numbers increase north. Grid cells are not city blocks, official addresses, or a walkable route.
- Requests device location once, only after clicking **Use my location**.
- Opens an external Google Maps link for walking directions. There is no in-app turn-by-turn routing or Google Maps JavaScript API integration.

Searches are sent to Photon; map providers receive the viewed area; opening Google Maps shares the selected origin and destination with Google. App state stays in memory and is not persisted by this app.

## Hosting

Deploy on Render as a **Static Site**. The root `render.yaml` defines the service;
its build command checks that the existing HTML file is present, and only `dist`
is published. No package installation, server process, or environment variables
are required for the current demo.

After the configuration is approved and pushed to GitHub:

1. In Render, select **New > Blueprint** and connect
   `https://github.com/bofrompursuit/gridway`.
2. Select the `main` branch and the root `render.yaml` file.
3. Review the `gridway` static site and deploy it.
4. Open the HTTPS URL assigned by Render and verify address search, the grid
   toggle, device location permission, and the external walking-directions link.

For manual **New > Static Site** setup, use branch `main`, leave the root directory
at the repository root, set the build command to `test -f dist/index.html`, and set
the publish directory to `dist`. No start command is needed.

Local `.env` files are not published and are not read by this static HTML app.
The NYC API settings in `.env.example` are reserved for future integration;
the address search uses NYC GeoSearch directly in the browser. Never put secret API keys into
browser JavaScript or the published `dist` directory.

## Source provenance

Imported unchanged from source commit `ba9af7fef9fe6630cad84eccee8148dec7c95c22` of the original Gridway concept. The SHA-256 of `dist/index.html` is `ef2fb239d625d683d3d08f9c6f788c64a7cf7856edfe22a9b9901af2ae16e951` (14,008 bytes).
