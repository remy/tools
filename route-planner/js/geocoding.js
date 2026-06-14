// Address search via Nominatim (no key required) and browser geolocation.

const NOMINATIM = "https://nominatim.openstreetmap.org/search";

// Search for places matching a free-text query. Returns a normalised array.
export async function geocode(query, { signal, country = "gb", limit = 6 } = {}) {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: String(limit),
    addressdetails: "1",
  });
  if (country) params.set("countrycodes", country);

  const res = await fetch(`${NOMINATIM}?${params}`, { signal });
  if (!res.ok) {
    throw new Error(res.status === 429 ? "Search rate limited — wait a moment." : `Search failed (HTTP ${res.status})`);
  }
  const data = await res.json().catch(() => []);
  if (!Array.isArray(data)) return [];

  return data.map((r) => {
    const parts = (r.display_name || "").split(", ");
    return {
      title: parts.shift() || r.display_name || "Result",
      detail: parts.join(", "),
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
    };
  }).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

// Promisified geolocation. Resolves to {lat, lng}.
export function locate() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not available in this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new Error(err.code === err.PERMISSION_DENIED
        ? "Location permission denied."
        : "Couldn't get your location.")),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}
