// MapLibre GL initialisation and layer/marker management.
// `maplibregl` is provided as a global by the CDN script in index.html.

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const ROUTE_SRC = "route";
const UK_CENTRE = [-1.5, 52.8];

function pinElement(kind) {
  const el = document.createElement("div");
  el.className = `map-pin map-pin-${kind}`;
  el.innerHTML = `<svg viewBox="0 0 24 36" width="30" height="45" aria-hidden="true">
    <path d="M12 0C5.92 0 1 4.92 1 11c0 7.84 9.36 23.06 9.76 23.7a1.46 1.46 0 0 0 2.48 0C13.64 34.06 23 18.84 23 11 23 4.92 18.08 0 12 0Z"/>
    <circle cx="12" cy="11" r="4"/>
  </svg>`;
  return el;
}

export function createMap(container) {
  const map = new maplibregl.Map({
    container,
    style: STYLE_URL,
    center: UK_CENTRE,
    zoom: 5,
    attributionControl: true,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

  let originMarker = null;
  let destMarker = null;
  let onOriginDrag = null;

  function ready(fn) {
    if (map.isStyleLoaded()) fn();
    else map.once("load", fn);
  }

  return {
    map,

    setOriginDragHandler(fn) { onOriginDrag = fn; },

    setOrigin(lngLat) {
      const pos = [lngLat.lng, lngLat.lat];
      if (!originMarker) {
        originMarker = new maplibregl.Marker({ element: pinElement("origin"), draggable: true, anchor: "bottom" })
          .setLngLat(pos)
          .addTo(map);
        originMarker.on("dragend", () => {
          const ll = originMarker.getLngLat();
          onOriginDrag?.({ lat: ll.lat, lng: ll.lng });
        });
      } else {
        originMarker.setLngLat(pos);
      }
    },

    setDestination(lngLat) {
      if (!lngLat) {
        destMarker?.remove();
        destMarker = null;
        return;
      }
      const pos = [lngLat.lng, lngLat.lat];
      if (!destMarker) {
        destMarker = new maplibregl.Marker({ element: pinElement("dest"), anchor: "bottom" })
          .setLngLat(pos).addTo(map);
      } else {
        destMarker.setLngLat(pos);
      }
    },

    flyTo(lngLat, zoom = 14) {
      map.flyTo({ center: [lngLat.lng, lngLat.lat], zoom, duration: 800 });
    },

    // coordinates: array of [lon, lat, ...]
    drawRoute(coordinates) {
      ready(() => {
        const geojson = {
          type: "Feature",
          geometry: { type: "LineString", coordinates: coordinates.map((c) => [c[0], c[1]]) },
        };
        const src = map.getSource(ROUTE_SRC);
        if (src) {
          src.setData(geojson);
        } else {
          map.addSource(ROUTE_SRC, { type: "geojson", data: geojson });
          map.addLayer({
            id: "route-underlay",
            type: "line",
            source: ROUTE_SRC,
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": "#ffffff", "line-width": 6 },
          });
          map.addLayer({
            id: "route-line",
            type: "line",
            source: ROUTE_SRC,
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": "#2563eb", "line-width": 4 },
          });
        }
        this.fitTo(coordinates);
      });
    },

    clearRoute() {
      const src = map.getSource(ROUTE_SRC);
      if (src) src.setData({ type: "Feature", geometry: { type: "LineString", coordinates: [] } });
    },

    fitTo(coordinates) {
      if (!coordinates.length) return;
      const bounds = coordinates.reduce(
        (b, c) => b.extend([c[0], c[1]]),
        new maplibregl.LngLatBounds([coordinates[0][0], coordinates[0][1]], [coordinates[0][0], coordinates[0][1]])
      );
      map.fitBounds(bounds, { padding: 60, duration: 800, maxZoom: 16 });
    },
  };
}
