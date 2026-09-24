// Curated Google Fonts, plus on-demand loading of any family by name.

export const DEFAULT_FONT = 'Inter';

export const FONT_GROUPS = [
  ['Sans serif', ['Inter', 'Plus Jakarta Sans', 'Manrope', 'DM Sans', 'Montserrat', 'Poppins', 'Outfit', 'Space Grotesk', 'Work Sans', 'Roboto', 'Open Sans', 'Lato', 'Raleway']],
  ['Serif', ['Playfair Display', 'DM Serif Display', 'Fraunces', 'Instrument Serif', 'Lora', 'Merriweather', 'Libre Baskerville']],
  ['Display', ['Bebas Neue', 'Anton', 'Oswald', 'Archivo Black', 'Abril Fatface']],
  ['Handwriting', ['Caveat', 'Permanent Marker', 'Pacifico']],
  ['Monospace', ['JetBrains Mono', 'Space Mono']],
];

export const ALL_FONTS = FONT_GROUPS.flatMap(([, fonts]) => fonts);

const CSS_API = 'https://fonts.googleapis.com/css2';
const stylesheets = new Map();

function addStylesheet(href) {
  if (stylesheets.has(href)) return stylesheets.get(href);
  const promise = new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => {
      link.remove();
      stylesheets.delete(href);
      reject(new Error(`Could not load ${href}`));
    };
    document.head.append(link);
  });
  stylesheets.set(href, promise);
  return promise;
}

const familyParam = (family) => encodeURIComponent(family.trim()).replace(/%20/g, '+');

/**
 * Loads a family at a weight so it's ready to draw on a canvas. Families that
 * don't ship the requested weight fall back to their default (the browser then
 * synthesises bold). Rejects if the family doesn't exist on Google Fonts.
 */
export async function loadFont(family, weight) {
  const fam = familyParam(family);
  try {
    await addStylesheet(`${CSS_API}?family=${fam}:wght@${weight}&display=block`);
  } catch {
    await addStylesheet(`${CSS_API}?family=${fam}&display=block`);
  }
  // A stylesheet only declares @font-face; the file itself loads on first use.
  const faces = await document.fonts.load(`${weight} 64px "${family}"`);
  if (!faces.length) throw new Error(`${family} has no usable font files`);
}

/** Preview family name for the picker, kept apart from the real family. */
export const previewFamily = (family) => `preview ${family}`;

/**
 * Loads tiny subsets (just the letters of the names) of every curated font so
 * the picker can show each name in its own face. The subset faces are renamed
 * so they never stand in for the full font when drawing the card.
 */
export async function loadPreviews() {
  const text = [...new Set(ALL_FONTS.join(''))].join('');
  const families = ALL_FONTS.map((f) => `family=${familyParam(f)}`).join('&');
  try {
    const res = await fetch(`${CSS_API}?${families}&text=${encodeURIComponent(text)}&display=swap`);
    if (!res.ok) return;
    const css = (await res.text()).replace(/font-family:\s*'([^']+)'/g, (_, f) => `font-family: '${previewFamily(f)}'`);
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
  } catch {
    // Previews are cosmetic; the picker still works with plain names.
  }
}
