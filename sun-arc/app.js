"use strict";

/* -------------------------------------------------------------------------
 * Solar position maths
 * Compact implementation of the algorithms popularised by Vladimir
 * Agafonkin's SunCalc (BSD-2). Computes sunrise / solar-noon / sunset for a
 * date + location, plus the sun's altitude at an arbitrary instant.
 * ---------------------------------------------------------------------- */
const PI = Math.PI;
const rad = PI / 180;
const dayMs = 86400000;
const J1970 = 2440588;
const J2000 = 2451545;
const e = rad * 23.4397; // obliquity of the ecliptic

const toJulian = (d) => d.valueOf() / dayMs - 0.5 + J1970;
const fromJulian = (j) => new Date((j + 0.5 - J1970) * dayMs);
const toDays = (d) => toJulian(d) - J2000;

const rightAscension = (l, b) =>
  Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
const declination = (l, b) =>
  Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
const altitudeOf = (H, phi, dec) =>
  Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
const siderealTime = (d, lw) => rad * (280.16 + 360.9856235 * d) - lw;

const solarMeanAnomaly = (d) => rad * (357.5291 + 0.98560028 * d);
function eclipticLongitude(M) {
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const P = rad * 102.9372;
  return M + C + P + PI;
}
function sunCoords(d) {
  const M = solarMeanAnomaly(d);
  const L = eclipticLongitude(M);
  return { dec: declination(L, 0), ra: rightAscension(L, 0) };
}

// Sun altitude (radians) for an absolute instant.
function sunAltitude(date, lat, lng) {
  const lw = rad * -lng;
  const phi = rad * lat;
  const d = toDays(date);
  const c = sunCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  return altitudeOf(H, phi, c.dec);
}

/* -------------------------------------------------------------------------
 * Clear-sky UV index estimate
 * A physically-motivated approximation — not a substitute for a measured /
 * forecast UVI, but it captures the things the user asked for: the time of
 * day and year, the latitude, and the altitude.
 *
 *   UVI ≈ k · sin(altitude)^a · (1/r)^2 · (O3ref/O3)^b
 *
 * - sin(altitude)^a  solar-elevation term (the dominant factor); equals
 *                    cos(zenith), and the exponent approximates the longer
 *                    atmospheric path the light takes when the sun is low.
 * - (1/r)^2          Earth–Sun distance: ~7% stronger at perihelion (early Jan).
 * - ozone            thinner ozone (lower latitudes / autumn) lets more UVB
 *                    through; modelled as a smooth latitude + season function.
 * ---------------------------------------------------------------------- */
function uvIndex(altRad, date, lat) {
  if (altRad <= 0) return 0; // sun at or below the horizon

  const cosSza = Math.sin(altRad); // cos(zenith) = sin(altitude)

  // Earth–Sun distance factor. Perihelion ~3 Jan (day-of-year ≈ 3).
  const doy = dayOfYear(date);
  const r = 1 - 0.0167 * Math.cos((2 * PI * (doy - 3)) / 365.25);
  const distFactor = 1 / (r * r);

  // Total-column ozone estimate (Dobson Units): higher toward the poles and
  // in late winter/spring, lower near the equator and in autumn. The seasonal
  // swing is phased by hemisphere.
  const absLat = Math.abs(lat);
  const seasonPhase = lat >= 0 ? doy : doy + 182.6; // flip seasons south
  const ozone =
    260 +
    100 * (absLat / 90) +
    20 * Math.cos((2 * PI * (seasonPhase - 60)) / 365.25);
  const ozoneFactor = Math.pow(300 / ozone, 1.2);

  // Scale calibrated against clear-sky references (e.g. London midsummer
  // noon ≈ 7–8, tropical overhead sun ≈ 11–13).
  const uvi = 9.2 * Math.pow(cosSza, 1.12) * distFactor * ozoneFactor;
  return Math.max(0, uvi);
}

// UV index category label (WHO bands).
function uvCategory(uvi) {
  if (uvi < 3) return "Low";
  if (uvi < 6) return "Moderate";
  if (uvi < 8) return "High";
  if (uvi < 11) return "Very high";
  return "Extreme";
}

// UV index -> the standard WHO colour (green/yellow/orange/red/violet),
// interpolated so the gradient blends smoothly between bands.
const UV_STOPS = [
  [0, [76, 175, 80]], // green
  [3, [255, 214, 0]], // yellow
  [6, [255, 143, 0]], // orange
  [8, [244, 67, 54]], // red
  [11, [156, 39, 176]], // violet
];
function uvColor(uvi) {
  const v = Math.max(0, uvi);
  let lo = UV_STOPS[0];
  let hi = UV_STOPS[UV_STOPS.length - 1];
  for (let i = 0; i < UV_STOPS.length - 1; i++) {
    if (v >= UV_STOPS[i][0] && v <= UV_STOPS[i + 1][0]) {
      lo = UV_STOPS[i];
      hi = UV_STOPS[i + 1];
      break;
    }
  }
  const span = hi[0] - lo[0] || 1;
  const k = Math.min(1, Math.max(0, (v - lo[0]) / span));
  const ch = (j) => Math.round(lo[1][j] + (hi[1][j] - lo[1][j]) * k);
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
}

const dayOfYear = (d) => {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d - start) / dayMs);
};

const J0 = 0.0009;
const julianCycle = (d, lw) => Math.round(d - J0 - lw / (2 * PI));
const approxTransit = (Ht, lw, n) => J0 + (Ht + lw) / (2 * PI) + n;
const solarTransitJ = (ds, M, L) => J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
const hourAngle = (h, phi, dec) =>
  Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));

function getTimes(date, lat, lng) {
  const lw = rad * -lng;
  const phi = rad * lat;
  const d = toDays(date);
  const n = julianCycle(d, lw);
  const ds = approxTransit(0, lw, n);
  const M = solarMeanAnomaly(ds);
  const L = eclipticLongitude(M);
  const dec = declination(L, 0);
  const Jnoon = solarTransitJ(ds, M, L);

  const h0 = -0.833 * rad; // standard sunrise/sunset altitude (refraction + disc)
  const w = hourAngle(h0, phi, dec);
  let sunrise = null;
  let sunset = null;
  if (!Number.isNaN(w)) {
    const Jset = solarTransitJ(approxTransit(w, lw, n), M, L);
    const Jrise = Jnoon - (Jset - Jnoon);
    sunrise = fromJulian(Jrise);
    sunset = fromJulian(Jset);
  }
  // No rise/set: is the sun up or down for the whole day?
  const noonAlt = altitudeOf(0, phi, dec);
  return {
    sunrise,
    sunset,
    solarNoon: fromJulian(Jnoon),
    alwaysUp: sunrise === null && noonAlt > h0,
    alwaysDown: sunrise === null && noonAlt <= h0,
  };
}

/* -------------------------------------------------------------------------
 * Geometry of the drawn arc
 * fraction 0 -> sunrise (left), 1 -> sunset (right); theta sweeps PI..0.
 * ---------------------------------------------------------------------- */
const CX = 400;
const YB = 380; // horizon line (svg y)
const RX = 320;
const RY = 230;

function arcPoint(f) {
  const theta = PI - f * PI;
  return { x: CX + RX * Math.cos(theta), y: YB - RY * Math.sin(theta) };
}

function arcPath(from, to) {
  const steps = 80;
  let dStr = "";
  for (let i = 0; i <= steps; i++) {
    const f = from + ((to - from) * i) / steps;
    const p = arcPoint(f);
    dStr += (i === 0 ? "M" : "L") + p.x.toFixed(1) + " " + p.y.toFixed(1) + " ";
  }
  return dStr.trim();
}

// Closed region between the arc (from..to) and the horizon line.
function areaPath(from, to) {
  const start = arcPoint(from);
  const end = arcPoint(to);
  return (
    `M${start.x.toFixed(1)} ${YB} ` +
    arcPath(from, to).replace(/^M/, "L") +
    ` L${end.x.toFixed(1)} ${YB} Z`
  );
}

/* -------------------------------------------------------------------------
 * Time helpers — everything the slider touches is "minutes since local
 * midnight" so the arc fraction is a transparent linear mapping.
 * ---------------------------------------------------------------------- */
const pad = (n) => String(n).padStart(2, "0");
const fmtMinutes = (m) => pad(Math.floor(m / 60) % 24) + ":" + pad(Math.round(m) % 60);
const toDateInput = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());

// Local minutes-of-day for an absolute Date (or "--:--" placeholder text).
const dateToMinutes = (d) => (d ? d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60 : null);
const fmtClock = (d) => (d ? pad(d.getHours()) + ":" + pad(d.getMinutes()) : "--:--");

/* -------------------------------------------------------------------------
 * DOM + state
 * ---------------------------------------------------------------------- */
const $ = (id) => document.getElementById(id);
const els = {
  subtitle: $("subtitle"),
  uvArea: $("uv-area"),
  uvGrad: $("uv-grad"),
  arcFull: $("arc-full"),
  arcDone: $("arc-done"),
  riseDot: $("rise-dot"),
  setDot: $("set-dot"),
  riseLabel: $("rise-label"),
  setLabel: $("set-label"),
  sun: $("sun"),
  sunRays: document.querySelector(".sun-rays"),
  sRise: $("s-rise"),
  sNoon: $("s-noon"),
  sSet: $("s-set"),
  sLen: $("s-len"),
  sAlt: $("s-alt"),
  sUv: $("s-uv"),
  date: $("date"),
  time: $("time"),
  timeOut: $("time-out"),
  now: $("now"),
  lat: $("lat"),
  lng: $("lng"),
  geo: $("geo"),
  geoMsg: $("geo-msg"),
  locSummary: $("loc-summary"),
};

const state = {
  lat: 51.5074,
  lng: -0.1278,
  label: "London, UK",
  date: new Date(), // selected calendar day (local)
  minutes: 720, // minutes since local midnight (slider value)
};

// Build the 8-ray sun glyph once.
(function buildRays() {
  const ns = "http://www.w3.org/2000/svg";
  for (let i = 0; i < 8; i++) {
    const a = (i * PI) / 4;
    const ln = document.createElementNS(ns, "line");
    ln.setAttribute("x1", (Math.cos(a) * 13).toFixed(2));
    ln.setAttribute("y1", (Math.sin(a) * 13).toFixed(2));
    ln.setAttribute("x2", (Math.cos(a) * 18).toFixed(2));
    ln.setAttribute("y2", (Math.sin(a) * 18).toFixed(2));
    els.sunRays.appendChild(ln);
  }
})();

// The absolute instant currently selected (selected day at selected minutes).
function selectedInstant() {
  const d = new Date(state.date);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(state.minutes); // minutes > 59 normalise into hours
  return d;
}

function render() {
  const dayStart = new Date(state.date);
  dayStart.setHours(0, 0, 0, 0);
  const t = getTimes(dayStart, state.lat, state.lng);
  const now = selectedInstant();
  const sel = state.minutes; // selected minutes-of-day

  // Sunrise/sunset as minutes-of-day (local), for both labels and geometry.
  const riseMin = dateToMinutes(t.sunrise);
  const setMin = dateToMinutes(t.sunset);

  // Labels + stats.
  els.riseLabel.textContent = fmtClock(t.sunrise);
  els.setLabel.textContent = fmtClock(t.sunset);
  els.sRise.textContent = fmtClock(t.sunrise);
  els.sNoon.textContent = fmtClock(t.solarNoon);
  els.sSet.textContent = fmtClock(t.sunset);

  if (riseMin !== null && setMin !== null) {
    const lenMin = Math.round(setMin - riseMin);
    els.sLen.textContent = Math.floor(lenMin / 60) + "h " + pad(lenMin % 60) + "m";
  } else {
    els.sLen.textContent = t.alwaysUp ? "24h 00m" : "0h 00m";
  }

  const altRad = sunAltitude(now, state.lat, state.lng);
  const altDeg = (altRad * 180) / PI;
  els.sAlt.textContent = altDeg.toFixed(1) + "°";

  const uvi = uvIndex(altRad, now, state.lat);
  els.sUv.textContent = uvi <= 0 ? "0" : `${uvi.toFixed(1)} · ${uvCategory(uvi)}`;

  // Endpoints + their labels.
  const pL = arcPoint(0);
  const pR = arcPoint(1);
  els.riseDot.setAttribute("cx", pL.x);
  els.riseDot.setAttribute("cy", pL.y);
  els.setDot.setAttribute("cx", pR.x);
  els.setDot.setAttribute("cy", pR.y);
  els.riseLabel.setAttribute("x", pL.x);
  els.riseLabel.setAttribute("y", YB + 40);
  els.setLabel.setAttribute("x", pR.x);
  els.setLabel.setAttribute("y", YB + 40);

  // Full grey arc always spans the whole day.
  els.arcFull.setAttribute("d", arcPath(0, 1));

  // UV-coloured fill under the arc. Sample the UV index across the daylight
  // span and feed those colours into the horizontal gradient, so the band
  // beneath the arc shifts green -> yellow -> orange -> red with the UV level
  // and you can see at a glance when it climbs and falls.
  renderUvFill(riseMin, setMin, dayStart, t);

  // Fraction of the way from sunrise to sunset (linear in time).
  let f;
  if (riseMin !== null && setMin !== null && setMin > riseMin) {
    f = (sel - riseMin) / (setMin - riseMin);
  } else {
    f = t.alwaysUp ? 0.5 : -1; // polar day -> peak; polar night -> hidden
  }

  const below = f < 0 || f > 1; // sun beneath the horizon
  const fClamped = Math.max(-0.12, Math.min(1.12, f));
  const sp = arcPoint(fClamped);
  els.sun.setAttribute("transform", `translate(${sp.x.toFixed(1)} ${sp.y.toFixed(1)})`);
  els.sun.classList.toggle("below", below);

  // Orange "elapsed" arc only while the sun is above the horizon.
  if (!below && riseMin !== null) {
    els.arcDone.setAttribute("d", arcPath(0, f));
    els.arcDone.removeAttribute("hidden");
  } else if (t.alwaysUp) {
    els.arcDone.setAttribute("d", arcPath(0, 0.5));
    els.arcDone.removeAttribute("hidden");
  } else {
    els.arcDone.setAttribute("hidden", "");
  }

  // Status line.
  let status;
  if (t.alwaysUp) status = "Midnight sun — the sun never sets today";
  else if (t.alwaysDown) status = "Polar night — the sun never rises today";
  else if (f < 0) status = "Before sunrise";
  else if (f > 1) status = "After sunset";
  else status = `Sun is up · ${Math.max(0, altDeg).toFixed(0)}° above horizon`;
  els.subtitle.textContent = `${status} · ${fmtMinutes(sel)}`;

  els.timeOut.textContent = fmtMinutes(sel);
}

// Paint the area under the daylight arc with a UV-coloured gradient. The arc
// fraction is linear in time, so a fraction f maps to minutes-of-day, which we
// turn into an absolute instant to evaluate the UV index — then drop a gradient
// stop coloured for that level. The fill is kept light/semi-opaque via CSS.
function renderUvFill(riseMin, setMin, dayStart, t) {
  const hasDay = riseMin !== null && setMin !== null && setMin > riseMin;
  if (!hasDay && !t.alwaysUp) {
    // Polar night (or no daylight): nothing to colour.
    els.uvArea.setAttribute("hidden", "");
    return;
  }
  els.uvArea.removeAttribute("hidden");

  // Daylight span in minutes-of-day (whole day for midnight sun).
  const startMin = hasDay ? riseMin : 0;
  const endMin = hasDay ? setMin : 1440;

  // The fill spans the same fractions as the visible daylight arc.
  els.uvArea.setAttribute("d", areaPath(0, 1));

  // Sample UV across the span and build gradient stops at matching offsets.
  const samples = 24;
  const xStart = arcPoint(0).x;
  const xEnd = arcPoint(1).x;
  let stops = "";
  for (let i = 0; i <= samples; i++) {
    const f = i / samples;
    const mins = startMin + (endMin - startMin) * f;
    const instant = new Date(dayStart);
    instant.setMinutes(mins);
    const alt = sunAltitude(instant, state.lat, state.lng);
    const uvi = uvIndex(alt, instant, state.lat);
    const offsetPct = (f * 100).toFixed(2);
    stops += `<stop offset="${offsetPct}%" stop-color="${uvColor(uvi)}"></stop>`;
  }
  // Keep the gradient's user-space coordinates aligned to the arc width.
  els.uvGrad.setAttribute("x1", xStart.toFixed(1));
  els.uvGrad.setAttribute("x2", xEnd.toFixed(1));
  els.uvGrad.innerHTML = stops;
}

/* -------------------------------------------------------------------------
 * Wiring
 * ---------------------------------------------------------------------- */
function syncInputs() {
  els.date.value = toDateInput(state.date);
  els.time.value = state.minutes;
  els.lat.value = state.lat;
  els.lng.value = state.lng;
  els.locSummary.textContent = state.label;
}

function setToNow() {
  const n = new Date();
  state.date = n;
  state.minutes = n.getHours() * 60 + n.getMinutes();
  syncInputs();
  render();
}

els.date.addEventListener("change", () => {
  const [y, m, d] = els.date.value.split("-").map(Number);
  if (y && m && d) {
    state.date = new Date(y, m - 1, d);
    render();
  }
});

els.time.addEventListener("input", () => {
  state.minutes = Number(els.time.value);
  render();
});

els.now.addEventListener("click", setToNow);

function updateCoord(key, input, lo, hi) {
  const v = parseFloat(input.value);
  if (!Number.isNaN(v) && v >= lo && v <= hi) {
    state[key] = v;
    state.label = `${state.lat.toFixed(3)}, ${state.lng.toFixed(3)}`;
    els.locSummary.textContent = state.label;
    saveLoc();
    render();
  }
}
els.lat.addEventListener("change", () => updateCoord("lat", els.lat, -90, 90));
els.lng.addEventListener("change", () => updateCoord("lng", els.lng, -180, 180));

els.geo.addEventListener("click", () => {
  if (!navigator.geolocation) {
    showGeoMsg("Geolocation is not available in this browser.");
    return;
  }
  showGeoMsg("Locating…");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.lat = Number(pos.coords.latitude.toFixed(4));
      state.lng = Number(pos.coords.longitude.toFixed(4));
      state.label = `${state.lat.toFixed(3)}, ${state.lng.toFixed(3)}`;
      showGeoMsg("");
      saveLoc();
      syncInputs();
      render();
    },
    (err) => showGeoMsg("Couldn't get your location: " + err.message),
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
  );
});

function showGeoMsg(msg) {
  els.geoMsg.textContent = msg;
  els.geoMsg.toggleAttribute("hidden", !msg);
}

/* persistence */
function saveLoc() {
  try {
    localStorage.setItem(
      "sun-arc-loc",
      JSON.stringify({ lat: state.lat, lng: state.lng, label: state.label })
    );
  } catch {}
}
function loadLoc() {
  try {
    const raw = localStorage.getItem("sun-arc-loc");
    if (raw) {
      const o = JSON.parse(raw);
      if (typeof o.lat === "number" && typeof o.lng === "number") {
        state.lat = o.lat;
        state.lng = o.lng;
        state.label = o.label || `${o.lat.toFixed(3)}, ${o.lng.toFixed(3)}`;
      }
    }
  } catch {}
}

/* init: defaults to today + current time + live sun position */
loadLoc();
setToNow();
