// Loading fonts from Google Fonts.
//
// The files served by fonts.googleapis.com are subset per unicode-range and
// have most of their layout features stripped, which is exactly the
// information this tool exists to show. So the original, unsubsetted TTF is
// pulled from the google/fonts repository instead, and the served WOFF2 is
// only a fallback.

const RAW = 'https://raw.githubusercontent.com/google/fonts/main';
const LICENCE_DIRS = ['ofl', 'apache', 'ufl'];

let catalogue;

/** The bundled snapshot of the Google Fonts catalogue, ordered by popularity. */
export async function loadCatalogue() {
  catalogue ??= fetch('./google-fonts.json')
    .then((response) => {
      if (!response.ok) throw new Error('Could not load the font list.');
      return response.json();
    })
    .then((data) => ({
      generated: data.generated,
      fonts: data.fonts.map(([family, category, variable]) => ({
        family,
        category: data.categories[category] ?? 'Other',
        variable: variable === 1,
        search: family.toLowerCase(),
      })),
    }));
  return catalogue;
}

const directoryId = (family) => family.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Pull `fonts { … }` blocks out of a METADATA.pb file. */
function parseMetadata(text) {
  const files = [];
  for (const block of text.matchAll(/fonts\s*\{([^}]*)\}/g)) {
    const body = block[1];
    const filename = body.match(/filename:\s*"([^"]+)"/)?.[1];
    if (!filename) continue;
    files.push({
      filename,
      style: body.match(/style:\s*"([^"]+)"/)?.[1] ?? 'normal',
      weight: Number(body.match(/weight:\s*(\d+)/)?.[1] ?? 400),
      fullName: body.match(/full_name:\s*"([^"]+)"/)?.[1] ?? filename,
      variable: filename.includes('['),
    });
  }
  return {
    designer: text.match(/designer:\s*"([^"]+)"/)?.[1] ?? null,
    licence: text.match(/license:\s*"([^"]+)"/)?.[1] ?? null,
    files,
  };
}

/**
 * Find the upstream sources for a family: every original file plus the
 * directory they live in. Rejects if the family is not in the repository.
 */
export async function findFamilySources(family) {
  const id = directoryId(family);
  const attempts = LICENCE_DIRS.map(async (dir) => {
    const response = await fetch(`${RAW}/${dir}/${id}/METADATA.pb`);
    if (!response.ok) throw new Error(`${dir}: ${response.status}`);
    return { dir, text: await response.text() };
  });

  const found = await Promise.any(attempts).catch(() => null);
  if (!found) return null;

  const metadata = parseMetadata(found.text);
  if (!metadata.files.length) return null;

  // Variable files first, then upright before italic, then closest to regular.
  const files = metadata.files
    .map((file) => ({
      ...file,
      url: `${RAW}/${found.dir}/${id}/${encodeURIComponent(file.filename)}`,
      label: `${file.filename}${file.variable ? ' (variable)' : ''}`,
    }))
    .sort((a, b) =>
      Number(b.variable) - Number(a.variable) ||
      (a.style === 'italic' ? 1 : 0) - (b.style === 'italic' ? 1 : 0) ||
      Math.abs(a.weight - 400) - Math.abs(b.weight - 400));

  return { family, id, dir: found.dir, designer: metadata.designer, files };
}

/**
 * Last resort: the WOFF2 fonts.googleapis.com serves. Subset, so the feature
 * list it yields is incomplete — callers should say so.
 */
export async function findServedFallback(family) {
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}`;
  let response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error('Could not reach Google Fonts — check the connection and try again.');
  }
  if (!response.ok) throw new Error(`Google Fonts has no family called “${family}”.`);
  const css = await response.text();
  const faces = [...css.matchAll(/url\((https:\/\/[^)]+\.woff2)\)/g)].map((m) => m[1]);
  if (!faces.length) throw new Error(`No downloadable file for “${family}”.`);
  // The last @font-face block is the latin one in every response Google sends.
  return { url: faces[faces.length - 1], subset: true };
}

export async function fetchFont(url) {
  let response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error('Could not reach the font — check the connection and try again.');
  }
  if (!response.ok) throw new Error(`Download failed (${response.status}).`);
  return response.arrayBuffer();
}
