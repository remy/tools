// Turning a camera roll photo into an avatar.
//
// Whatever comes in — a 12MP phone snap, a screenshot — is centre-cropped to a
// square and shrunk to a thumbnail before it goes anywhere near the database.
// The result is a JPEG data URL of a few kilobytes, small enough to live
// inline on the player document and replicate to CouchDB without anyone
// noticing, which is why this isn't a PouchDB attachment.

const AVATAR_SIZE = 160;
const JPEG_QUALITY = 0.72;

function loadViaImg(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
    img.src = url;
  });
}

// createImageBitmap is the cheap path and applies the EXIF orientation for us,
// so a photo taken sideways isn't stored sideways. It can't decode every
// format everywhere (HEIC on non-Apple browsers), hence the <img> fallback,
// which the browser orients by itself.
async function loadImage(file) {
  if (globalThis.createImageBitmap) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Fall through to the <img> path.
    }
  }
  return loadViaImg(file);
}

export function isImageFile(file) {
  return !!file && (file.type ? file.type.startsWith('image/') : /\.(jpe?g|png|gif|webp|avif|heic)$/i.test(file.name || ''));
}

export async function fileToAvatar(file) {
  if (!isImageFile(file)) throw new Error('That file isn’t an image.');
  const source = await loadImage(file);
  const width = source.width || source.naturalWidth;
  const height = source.height || source.naturalHeight;
  if (!width || !height) throw new Error('Could not read that image.');

  // Centre crop to a square so the circular avatar is never letterboxed.
  const side = Math.min(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(
    source,
    (width - side) / 2, (height - side) / 2, side, side,
    0, 0, AVATAR_SIZE, AVATAR_SIZE,
  );
  source.close?.();
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}
