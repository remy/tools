const ELEVATION_API = "https://api.open-meteo.com/v1/elevation";
const GEOCODE_API = "https://geocoding-api.open-meteo.com/v1/search";

const els = {
  elevationValue: document.getElementById("elevationValue"),
  elevationFeet: document.getElementById("elevationFeet"),
  coords: document.getElementById("coords"),
  copyBtn: document.getElementById("copyBtn"),
  searchForm: document.getElementById("searchForm"),
  searchInput: document.getElementById("searchInput"),
  searchResults: document.getElementById("searchResults"),
  locateBtn: document.getElementById("locateBtn"),
};

// Restore last view, falling back to a sensible default.
let start = { lat: 50.8229, lng: -0.1363, zoom: 13 };
try {
  const saved = JSON.parse(localStorage.getItem("point-elevation:view"));
  if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lng)) {
    start = saved;
  }
} catch { /* ignore malformed storage */ }

const map = L.map("map", { zoomControl: true, attributionControl: true })
  .setView([start.lat, start.lng], start.zoom);

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

// ---- Elevation lookup ----
let elevationAbort = null;
let elevationTimer = null;

function formatCoord(value) {
  return value.toFixed(5);
}

function updateCoords(lat, lng) {
  els.coords.textContent = `${formatCoord(lat)}, ${formatCoord(lng)}`;
  els.copyBtn.hidden = false;
}

async function fetchElevation(lat, lng) {
  if (elevationAbort) elevationAbort.abort();
  elevationAbort = new AbortController();

  els.elevationValue.textContent = "…";
  els.elevationValue.classList.add("loading");
  els.elevationFeet.textContent = "";

  const url = `${ELEVATION_API}?latitude=${lat.toFixed(6)}&longitude=${lng.toFixed(6)}`;
  try {
    const res = await fetch(url, { signal: elevationAbort.signal });
    const data = await res.json().catch(() => null);
    els.elevationValue.classList.remove("loading");

    if (!res.ok || data?.error) {
      const reason = data?.reason || `HTTP ${res.status}`;
      console.warn("Elevation request failed:", reason);
      els.elevationValue.textContent = res.status === 429 ? "rate limited" : "error";
      els.elevationFeet.textContent = "";
      return;
    }

    const metres = data?.elevation?.[0];
    if (typeof metres !== "number") {
      els.elevationValue.textContent = "n/a";
      return;
    }
    els.elevationValue.textContent = Math.round(metres).toLocaleString();
    els.elevationFeet.textContent = `(${Math.round(metres * 3.28084).toLocaleString()} ft)`;
  } catch (err) {
    if (err.name === "AbortError") return;
    console.warn("Elevation request error:", err);
    els.elevationValue.classList.remove("loading");
    els.elevationValue.textContent = "error";
    els.elevationFeet.textContent = "";
  }
}

function refresh() {
  const c = map.getCenter();
  updateCoords(c.lat, c.lng);
  localStorage.setItem(
    "point-elevation:view",
    JSON.stringify({ lat: c.lat, lng: c.lng, zoom: map.getZoom() })
  );
  clearTimeout(elevationTimer);
  elevationTimer = setTimeout(() => fetchElevation(c.lat, c.lng), 250);
}

map.on("moveend", refresh);
refresh();

// ---- Copy coordinates ----
els.copyBtn.addEventListener("click", async () => {
  const c = map.getCenter();
  const text = `${formatCoord(c.lat)}, ${formatCoord(c.lng)}`;
  try {
    await navigator.clipboard.writeText(text);
    const original = els.copyBtn.textContent;
    els.copyBtn.textContent = "Copied";
    setTimeout(() => { els.copyBtn.textContent = original; }, 1200);
  } catch { /* clipboard unavailable */ }
});

// ---- Search ----
function clearResults() {
  els.searchResults.hidden = true;
  els.searchResults.innerHTML = "";
}

function showMessage(text) {
  els.searchResults.innerHTML = "";
  const li = document.createElement("li");
  li.className = "empty";
  li.textContent = text;
  els.searchResults.append(li);
  els.searchResults.hidden = false;
}

function renderResults(results) {
  els.searchResults.innerHTML = "";
  if (!results.length) {
    showMessage("No places found");
    return;
  }

  for (const r of results) {
    const li = document.createElement("li");
    const meta = [r.admin1, r.country].filter(Boolean).join(", ");
    const name = document.createElement("span");
    name.className = "result-name";
    name.textContent = r.name;
    const sub = document.createElement("span");
    sub.className = "result-meta";
    sub.textContent = meta;
    li.append(name, sub);
    li.addEventListener("click", () => {
      clearResults();
      els.searchInput.value = r.name;
      map.flyTo([r.latitude, r.longitude], Math.max(map.getZoom(), 12), { duration: 0.8 });
    });
    els.searchResults.append(li);
  }
  els.searchResults.hidden = false;
}

els.searchForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const query = els.searchInput.value.trim();
  if (!query) return;

  showMessage("Searching…");

  const url = `${GEOCODE_API}?name=${encodeURIComponent(query)}&count=8&language=en&format=json`;
  try {
    const res = await fetch(url);
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.error) {
      const reason = data?.reason || `Search failed (HTTP ${res.status})`;
      console.warn("Geocoding request failed:", reason);
      showMessage(res.status === 429 ? "Rate limited — wait a moment and try again." : reason);
      return;
    }
    renderResults(data?.results || []);
  } catch (err) {
    console.warn("Geocoding request error:", err);
    showMessage("Couldn't reach the search service. Check your connection.");
  }
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-panel")) clearResults();
});

// ---- Geolocation ----
els.locateBtn.addEventListener("click", () => {
  if (!navigator.geolocation) return;
  els.locateBtn.classList.add("busy");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      els.locateBtn.classList.remove("busy");
      map.flyTo([pos.coords.latitude, pos.coords.longitude], 15, { duration: 0.8 });
    },
    () => { els.locateBtn.classList.remove("busy"); },
    { enableHighAccuracy: true, timeout: 10000 }
  );
});
