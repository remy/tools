// Geometry, unit and time/distance helpers.
// Coordinates in this app are {lat, lng} objects; ORS uses [lon, lat] arrays.

export const EARTH_R = 6371000; // metres
export const KM_PER_MILE = 1.609344;
export const M_PER_MILE = KM_PER_MILE * 1000;

const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

// Great-circle distance between two {lat, lng} points, in metres.
export function haversine(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Point reached by travelling `distanceM` metres from `origin` on `bearingDeg`.
export function destinationPoint(origin, bearingDeg, distanceM) {
  const ang = distanceM / EARTH_R;
  const brng = toRad(bearingDeg);
  const la1 = toRad(origin.lat);
  const ln1 = toRad(origin.lng);

  const la2 = Math.asin(
    Math.sin(la1) * Math.cos(ang) + Math.cos(la1) * Math.sin(ang) * Math.cos(brng)
  );
  const ln2 =
    ln1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(ang) * Math.cos(la1),
      Math.cos(ang) - Math.sin(la1) * Math.sin(la2)
    );
  return { lat: toDeg(la2), lng: ((toDeg(ln2) + 540) % 360) - 180 };
}

// Initial bearing (degrees, 0–360) from a → b.
export function bearingBetween(a, b) {
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(la2);
  const x =
    Math.cos(la1) * Math.sin(la2) -
    Math.sin(la1) * Math.cos(la2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const COMPASS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
];

export function compassDirection(bearingDeg) {
  const i = Math.round((((bearingDeg % 360) + 360) % 360) / 22.5) % 16;
  return COMPASS[i];
}

// ---- Units ----

// Convert a value typed in the active unit into metres.
export function toMetres(value, unit) {
  return unit === "mi" ? value * M_PER_MILE : value * 1000;
}

// Convert metres into the active unit's numeric value.
export function fromMetres(metres, unit) {
  return unit === "mi" ? metres / M_PER_MILE : metres / 1000;
}

export function unitLabel(unit) {
  return unit === "mi" ? "mi" : "km";
}

// Format a distance in metres for display, e.g. "3.0 mi".
export function formatDistance(metres, unit, dp = 1) {
  return `${fromMetres(metres, unit).toFixed(dp)} ${unitLabel(unit)}`;
}

// ---- Time ⇄ distance (speed in km/h) ----

export function metresToMinutes(metres, speedKmh) {
  if (!speedKmh) return 0;
  return (metres / 1000 / speedKmh) * 60;
}

export function minutesToMetres(minutes, speedKmh) {
  return (speedKmh * (minutes / 60)) * 1000;
}

export function formatDuration(minutes) {
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}
