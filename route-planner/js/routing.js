// OpenRouteService directions. Pedestrian profile only.

const BASE = "https://api.openrouteservice.org/v2/directions";
const PROFILE = "foot-hiking";
const KEY_STORAGE = "route-planner:ors-key";

// Resolve the ORS API key from (in priority order): localStorage (set via the
// settings dialog), a user-provided config.js, or a <meta> tag.
export function getApiKey() {
  const stored = localStorage.getItem(KEY_STORAGE);
  if (stored) return stored.trim();

  const fromConfig = window.ROUTE_PLANNER_CONFIG?.ORS_API_KEY;
  if (fromConfig) return String(fromConfig).trim();

  const meta = document.querySelector('meta[name="ors-api-key"]');
  if (meta?.content) return meta.content.trim();

  return "";
}

export function setApiKey(key) {
  if (key) localStorage.setItem(KEY_STORAGE, key.trim());
  else localStorage.removeItem(KEY_STORAGE);
}

export function hasApiKey() {
  return Boolean(getApiKey());
}

async function request(body, signal) {
  const key = getApiKey();
  if (!key) {
    const err = new Error("Add your free OpenRouteService API key in Settings to generate routes.");
    err.code = "NO_KEY";
    throw err;
  }

  const res = await fetch(`${BASE}/${PROFILE}/geojson`, {
    method: "POST",
    headers: {
      Authorization: key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = data?.error?.message || data?.error || `Routing failed (HTTP ${res.status})`;
    const err = new Error(
      res.status === 401 || res.status === 403
        ? "OpenRouteService rejected the API key. Check it in Settings."
        : res.status === 429
          ? "OpenRouteService rate limit reached — wait a minute and retry."
          : message
    );
    err.status = res.status;
    throw err;
  }
  return data;
}

// Normalise an ORS GeoJSON response into the shape the app consumes.
function parse(geojson) {
  const feature = geojson?.features?.[0];
  if (!feature) throw new Error("No route was returned for these inputs.");

  const coords = feature.geometry.coordinates; // [lon, lat, ele?]
  const props = feature.properties || {};
  const summary = props.summary || {};
  const segments = props.segments || [];

  return {
    coordinates: coords,
    totalDistanceM: summary.distance || 0,
    ascent: props.ascent ?? null,
    descent: props.descent ?? null,
    // Routed distance of the first (outward) leg, when present.
    outwardRoutedM: segments[0]?.distance ?? null,
  };
}

// Loop / round-trip route. `lengthM` is the desired circumference.
export async function roundTrip(origin, lengthM, seed, signal) {
  const data = await request({
    coordinates: [[origin.lng, origin.lat]],
    options: { round_trip: { length: Math.round(lengthM), seed, points: 5 } },
    elevation: true,
    instructions: false,
  }, signal);
  return parse(data);
}

// Standard A→…→A route through ordered {lat, lng} waypoints.
export async function pointToPoint(points, signal) {
  const data = await request({
    coordinates: points.map((p) => [p.lng, p.lat]),
    elevation: true,
    instructions: false,
  }, signal);
  return parse(data);
}
