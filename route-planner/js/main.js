import { createMap } from "./map.js";
import { geocode, locate } from "./geocoding.js";
import { roundTrip, pointToPoint, getApiKey, setApiKey, hasApiKey } from "./routing.js";
import { downloadGpx } from "./gpx.js";
import {
  toMetres, fromMetres, unitLabel, formatDistance, formatDuration,
  metresToMinutes, minutesToMetres, haversine, bearingBetween,
  destinationPoint, compassDirection,
} from "./utils.js";

const UNITS_KEY = "route-planner:units";
const SPEEDS = { walk: 5, run: 10 };

const $ = (id) => document.getElementById(id);

const state = {
  units: localStorage.getItem(UNITS_KEY) === "mi" ? "mi" : "km",
  mode: "run",
  outwardMetres: 5000,
  budget: "distance",
  shape: "outback",
  origin: null,
  destination: null,
  seed: Math.floor(Math.random() * 1e6),
  bearing: Math.floor(Math.random() * 360),
  route: null,        // last generated, parsed ORS result
  turnaround: null,   // {lat,lng} for out & back
};

const ui = createMap("map");

// ---- Speed helper ----
function speedKmh() {
  if (state.mode === "custom") {
    const v = parseFloat($("custom-speed").value);
    return Number.isFinite(v) && v > 0 ? v : 8;
  }
  return SPEEDS[state.mode];
}

// ---- Budget sync ----
function syncBudgetFields(source) {
  const speed = speedKmh();
  if (source === "time") {
    const min = parseFloat($("time-input").value) || 0;
    state.outwardMetres = minutesToMetres(min, speed);
    $("distance-input").value = fromMetres(state.outwardMetres, state.units).toFixed(1);
  } else if (source === "distance") {
    const val = parseFloat($("distance-input").value) || 0;
    state.outwardMetres = toMetres(val, state.units);
    $("time-input").value = Math.round(metresToMinutes(state.outwardMetres, speed));
  } else {
    // unit/speed change: keep canonical metres, refresh both fields
    $("distance-input").value = fromMetres(state.outwardMetres, state.units).toFixed(1);
    $("time-input").value = Math.round(metresToMinutes(state.outwardMetres, speed));
  }
  refreshHints();
}

function refreshHints() {
  const speed = speedKmh();
  $("budget-hint").textContent =
    `≈ ${formatDistance(state.outwardMetres, state.units)} out at ${speed} km/h`;
  $("hint-loop").textContent = `~${formatDistance(state.outwardMetres, state.units, 1)} total`;
  $("hint-outback").textContent = `~${formatDistance(state.outwardMetres * 2, state.units, 1)} total`;
  $("distance-unit").textContent = unitLabel(state.units);
}

// ---- Units ----
function setUnits(units) {
  state.units = units;
  localStorage.setItem(UNITS_KEY, units);
  $("unit-km").setAttribute("aria-pressed", String(units === "km"));
  $("unit-mi").setAttribute("aria-pressed", String(units === "mi"));
  // Update distance input min/max/step to sensible per-unit ranges.
  const di = $("distance-input");
  if (units === "mi") { di.min = "0.3"; di.max = "12"; di.step = "0.1"; }
  else { di.min = "0.5"; di.max = "20"; di.step = "0.1"; }
  syncBudgetFields();
}

// ---- Origin / Destination ----
function setOrigin(point, label) {
  state.origin = point;
  ui.setOrigin(point);
  ui.flyTo(point);
  if (label !== undefined) $("origin-input").value = label;
}

function setDestination(point, label) {
  state.destination = point;
  ui.setDestination(point);
  if (label !== undefined) $("dest-input").value = label;
  updateDestShape();
}

function updateDestShape() {
  const radio = $("shape-dest-label").querySelector("input");
  const hasDest = Boolean(state.destination);
  radio.disabled = !hasDest;
  $("shape-dest-label").classList.toggle("disabled", !hasDest);
  if (!hasDest && state.shape === "dest") {
    document.querySelector('input[name="shape"][value="outback"]').checked = true;
    state.shape = "outback";
    updateShapeUi();
  }
}

// ---- Shape ----
function updateShapeUi() {
  // Regenerate is meaningful for loop (new seed) and random out & back (new bearing).
  const showRegen = state.route && (
    state.shape === "loop" || (state.shape === "outback" && !state.destination)
  );
  $("btn-regenerate").hidden = !showRegen;
}

// ---- Address search wiring ----
function wireSearch(inputId, resultsId, onPick) {
  const input = $(inputId);
  const list = $(resultsId);
  let timer = null;
  let abort = null;

  function close() { list.hidden = true; list.innerHTML = ""; }

  function render(results) {
    list.innerHTML = "";
    if (!results.length) { close(); return; }
    for (const r of results) {
      const li = document.createElement("li");
      li.innerHTML = `<span class="r-name"></span><span class="r-meta"></span>`;
      li.querySelector(".r-name").textContent = r.title;
      li.querySelector(".r-meta").textContent = r.detail;
      li.addEventListener("click", () => {
        close();
        onPick({ lat: r.lat, lng: r.lng }, r.title);
      });
      list.append(li);
    }
    list.hidden = false;
  }

  input.addEventListener("input", () => {
    const q = input.value.trim();
    clearTimeout(timer);
    if (q.length < 3) { close(); return; }
    timer = setTimeout(async () => {
      abort?.abort();
      abort = new AbortController();
      try {
        render(await geocode(q, { signal: abort.signal }));
      } catch (err) {
        if (err.name !== "AbortError") console.warn(err);
      }
    }, 400);
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(`#${resultsId}`) && e.target !== input) close();
  });
}

// ---- Error / loading ----
function showError(msg) {
  const el = $("error");
  el.textContent = msg;
  el.hidden = !msg;
}

function setBusy(busy) {
  $("map-loading").hidden = !busy;
  $("btn-generate").disabled = busy;
  $("btn-generate").textContent = busy ? "Generating…" : "Generate →";
}

// ---- Generate ----
async function generate() {
  showError("");
  if (!state.origin) { showError("Set an origin first — use your location or search an address."); return; }
  if (!hasApiKey()) { showError("Add your OpenRouteService API key in Settings to generate routes."); return; }
  if (!(state.outwardMetres > 0)) { showError("Enter a distance or time greater than zero."); return; }

  setBusy(true);
  try {
    let result;
    state.turnaround = null;

    if (state.shape === "loop") {
      result = await roundTrip(state.origin, state.outwardMetres, state.seed);
    } else if (state.shape === "dest") {
      result = await pointToPoint([state.origin, state.destination]);
    } else {
      // out & back
      const bearing = state.destination
        ? bearingBetween(state.origin, state.destination)
        : state.bearing;
      const turn = destinationPoint(state.origin, bearing, state.outwardMetres);
      state.turnaround = turn;
      ui.setDestination(turn);
      result = await pointToPoint([state.origin, turn, state.origin]);
    }

    state.route = result;
    ui.drawRoute(result.coordinates);
    renderStats(result);
    $("btn-download").disabled = false;
    updateShapeUi();
  } catch (err) {
    console.warn("Route generation failed:", err);
    showError(err.message || "Could not generate a route. Try a different budget or location.");
  } finally {
    setBusy(false);
  }
}

function renderStats(r) {
  const u = state.units;
  const speed = speedKmh();
  $("stats").hidden = false;

  // Outward row
  const outwardRow = $("row-outward");
  if (state.shape === "loop") {
    outwardRow.hidden = true;
  } else {
    outwardRow.hidden = false;
    if (state.shape === "outback" && state.turnaround) {
      const straight = haversine(state.origin, state.turnaround);
      const routed = r.outwardRoutedM ?? r.totalDistanceM / 2;
      $("stat-outward").textContent =
        `${formatDistance(routed, u)} (${formatDistance(straight, u)} straight)`;
    } else {
      $("stat-outward").textContent = formatDistance(r.totalDistanceM, u);
    }
  }

  $("stat-total").textContent = formatDistance(r.totalDistanceM, u);
  $("stat-time").textContent = `~${formatDuration(metresToMinutes(r.totalDistanceM, speed))}`;

  if (r.ascent != null || r.descent != null) {
    $("stat-elev").textContent = `+${Math.round(r.ascent || 0)}m / −${Math.round(r.descent || 0)}m`;
  } else {
    $("stat-elev").textContent = "n/a";
  }

  // Note line
  const note = $("stat-note");
  if (state.shape === "dest") {
    note.hidden = false;
    note.textContent = "One-way route — no return leg included.";
  } else if (state.shape === "outback" && !state.destination) {
    note.hidden = false;
    note.textContent = `Heading ${compassDirection(state.bearing)} — use Regenerate for a new direction.`;
  } else {
    note.hidden = true;
  }
}

// ---- Settings dialog ----
const dialog = $("settings-dialog");
function openSettings() {
  $("ors-key-input").value = getApiKey();
  $("settings-status").textContent = hasApiKey() ? "A key is saved in this browser." : "No key saved yet.";
  dialog.showModal();
}
dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
$("btn-save-key").addEventListener("click", () => { setApiKey($("ors-key-input").value); });
$("btn-clear-key").addEventListener("click", () => {
  setApiKey("");
  $("ors-key-input").value = "";
  $("settings-status").textContent = "Key cleared.";
});

// ---- Event wiring ----
function init() {
  setUnits(state.units);
  syncBudgetFields("distance");
  updateDestShape();

  ui.setOriginDragHandler((point) => { state.origin = point; });

  wireSearch("origin-input", "origin-results", (p, label) => setOrigin(p, label));
  wireSearch("dest-input", "dest-results", (p, label) => setDestination(p, label));

  $("btn-locate").addEventListener("click", async () => {
    $("btn-locate").classList.add("busy");
    showError("");
    try {
      const p = await locate();
      setOrigin(p);
      $("origin-input").value = "My location";
    } catch (err) {
      showError(err.message);
    } finally {
      $("btn-locate").classList.remove("busy");
    }
  });

  // Mode
  document.querySelectorAll('input[name="mode"]').forEach((r) =>
    r.addEventListener("change", () => {
      state.mode = r.value;
      $("custom-speed").disabled = r.value !== "custom";
      syncBudgetFields();
    })
  );
  $("custom-speed").addEventListener("input", () => syncBudgetFields());

  // Budget
  $("distance-input").addEventListener("input", () => {
    document.querySelector('input[name="budget"][value="distance"]').checked = true;
    state.budget = "distance";
    syncBudgetFields("distance");
  });
  $("time-input").addEventListener("input", () => {
    document.querySelector('input[name="budget"][value="time"]').checked = true;
    state.budget = "time";
    syncBudgetFields("time");
  });
  document.querySelectorAll('input[name="budget"]').forEach((r) =>
    r.addEventListener("change", () => { state.budget = r.value; })
  );

  // Units
  $("unit-km").addEventListener("click", () => setUnits("km"));
  $("unit-mi").addEventListener("click", () => setUnits("mi"));

  // Shape
  document.querySelectorAll('input[name="shape"]').forEach((r) =>
    r.addEventListener("change", () => { state.shape = r.value; updateShapeUi(); })
  );

  // Generate / regenerate
  $("btn-generate").addEventListener("click", generate);
  $("btn-regenerate").addEventListener("click", () => {
    if (state.shape === "loop") state.seed = Math.floor(Math.random() * 1e6);
    else state.bearing = Math.floor(Math.random() * 360);
    generate();
  });

  // Download
  $("btn-download").addEventListener("click", () => {
    if (!state.route) return;
    const label = state.mode === "walk" ? "Walk" : "Run";
    downloadGpx(state.route.coordinates, label);
  });

  // Settings
  $("btn-settings").addEventListener("click", openSettings);

  // Prompt for a key on first load if none is configured.
  if (!hasApiKey()) {
    showError("Tip: add a free OpenRouteService API key in Settings to start generating routes.");
  }
}

init();
