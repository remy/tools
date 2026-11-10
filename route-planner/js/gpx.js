// Client-side GPX track serialisation and download.

function isoDate(d = new Date()) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

// `coordinates` is an array of [lon, lat, ele?] (ORS GeoJSON order).
export function buildGpx(coordinates, name) {
  const points = coordinates
    .map(([lon, lat, ele]) => {
      const elev = Number.isFinite(ele) ? `<ele>${ele.toFixed(1)}</ele>` : "";
      return `      <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}">${elev}</trkpt>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Route Planner"
  xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${escapeXml(name)}</name>
    <trkseg>
${points}
    </trkseg>
  </trk>
</gpx>
`;
}

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, (c) => (
    { "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]
  ));
}

export function downloadGpx(coordinates, label = "Route") {
  const date = isoDate();
  const gpx = buildGpx(coordinates, `${label} – ${date}`);
  const blob = new Blob([gpx], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `route-${date}.gpx`;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
