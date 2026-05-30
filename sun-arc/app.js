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

function sunAltitude(date, lat, lng) {
  const lw = rad * -lng;
  const phi = rad * lat;
  const d = toDays(date);
  const c = sunCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  return altitudeOf(H, phi, c.dec); // radians
}

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
  // Is the sun up or down all day? Compare noon altitude to the horizon.
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
 * ---------------------------------------------------------------------- */
const CX = 400; // svg coords
const YB = 380; // horizon line
const RX = 320; // horizontal radius
const RY = 230; // vertical radius

// fraction 0 -> sunrise (left), 1 -> sunset (right). theta sweeps PI..0
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

/* -------------------------------------------------------------------------
 * DOM + state
 * ---------------------------------------------------------------------- */
const $ = (id) => document.getElementById(id);
const els = {
  subtitle: $("subtitle"),
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
  minutes: 0, // minutes since local midnight
};

const pad = (n) => String(n).padStart(2, "0");
const fmtTime = (d) => (d ? pad(d.getHours()) + ":" + pad(d.getMinutes()) : "--:--");
const fmtMinutes = (m) => pad(Math.floor(m / 60)) + ":" + pad(m % 60);
const toDateInput = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());

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

// The instant currently selected (selected day at selected minutes, local).
function selectedInstant() {
  const d = new Date(state.date);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(state.minutes);
  return d;
}

function render() {
  const dayStart = new Date(state.date);
  dayStart.setHours(0, 0, 0, 0);
  const t = getTimes(dayStart, state.lat, state.lng);
  const now = selectedInstant();

  // Endpoint labels + stats
  els.riseLabel.textContent = fmtTime(t.sunrise);
  els.setLabel.textContent = fmtTime(t.sunset);
  els.sRise.textContent = fmtTime(t.sunrise);
  els.sNoon.textContent = fmtTime(t.solarNoon);
  els.sSet.textContent = fmtTime(t.sunset);

  if (t.sunrise && t.sunset) {
    const lenMin = Math.round((t.sunset - t.sunrise) / 60000);
    els.sLen.textContent = Math.floor(lenMin / 60) + "h " + pad(lenMin % 60) + "m";
  } else {
    els.sLen.textContent = t.alwaysUp ? "24h 00m" : "0h 00m";
  }

  const alt = (sunAltitude(now, state.lat, state.lng) * 180) / PI;
  els.sAlt.textContent = alt.toFixed(1) + "°";

  // Position dots at the arc endpoints.
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

  // Where is the sun? Fraction of the way from sunrise to sunset.
  let f;
  if (t.sunrise && t.sunset) {
    f = (now - t.sunrise) / (t.sunset - t.sunrise);
  } else {
    f = t.alwaysUp ? 0.5 : -1; // polar day -> peak; polar night -> hidden
  }

  const below = f < 0 || f > 1;
  const fClamped = Math.max(-0.12, Math.min(1.12, f));
  const sp = arcPoint(fClamped);
  els.sun.setAttribute("transform", `translate(${sp.x.toFixed(1)} ${sp.y.toFixed(1)})`);
  els.sun.classList.toggle("below", below);

  // Orange "elapsed" arc only while the sun is above the horizon.
  if (!below && t.sunrise && t.sunset) {
    els.arcDone.setAttribute("d", arcPath(0, f));
    els.arcDone.removeAttribute("hidden");
  } else if (t.alwaysUp) {
    els.arcDone.setAttribute("d", arcPath(0, 0.5));
    els.arcDone.removeAttribute("hidden");
  } else {
    els.arcDone.setAttribute("hidden", "");
  }

  // Subtitle status line.
  let status;
  if (t.alwaysUp) status = "Midnight sun — the sun never sets today";
  else if (t.alwaysDown) status = "Polar night — the sun never rises today";
  else if (f < 0) status = "Before sunrise";
  else if (f > 1) status = "After sunset";
  else status = alt >= 0 ? `Sun is up · ${alt.toFixed(0)}° above horizon` : "Below horizon";
  els.subtitle.textContent = `${status} · ${state.label}`;

  els.timeOut.textContent = fmtMinutes(state.minutes);
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

/* init */
loadLoc();
setToNow(); // defaults to today + current time, draws current sun position
