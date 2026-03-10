/**
 * tracer.js — Canvas pre-processing + ImageTracerJS integration
 *
 * Exports:
 *   loadImageToCanvas(file, canvas)  → { width, height, dataUrl }
 *   traceCanvas(canvas, opts)        → svgString
 *   canvasToBase64Jpeg(canvas, quality, maxDim) → base64DataUrl
 */

const MAX_CANVAS_DIM = 1600; // pixel cap before drawing into canvas

/**
 * Load a File (image) onto a canvas element, downscaling if necessary.
 * Returns the rendered dimensions and a JPEG data URL for display.
 */
export async function loadImageToCanvas(file, canvas) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { naturalWidth: w, naturalHeight: h } = img;

      // Downscale large images to keep tracing performant
      if (w > MAX_CANVAS_DIM || h > MAX_CANVAS_DIM) {
        const scale = Math.min(MAX_CANVAS_DIM / w, MAX_CANVAS_DIM / h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }

      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      // Produce a compact display URL
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      resolve({ width: w, height: h, dataUrl });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

/**
 * Apply a very simple box-blur to ImageData in-place.
 * radius: integer number of pixels (0 = no-op)
 */
function applyBlur(ctx, w, h, radius) {
  if (radius <= 0) return;
  // Use CSS filter on a temporary canvas — simple and fast
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = w;
  tmpCanvas.height = h;
  const tmpCtx = tmpCanvas.getContext('2d');
  tmpCtx.filter = `blur(${radius}px)`;
  tmpCtx.drawImage(ctx.canvas, 0, 0);

  // Write blurred result back to original canvas
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(tmpCanvas, 0, 0);
}

/**
 * Trace the canvas using ImageTracerJS and return an SVG string.
 *
 * opts:
 *   colors        {number}  2–64
 *   blurRadius    {number}  0–5
 *   pathOmit      {number}  0–64 (pixel area threshold)
 *   curveTolerance {number} 0.1–10
 *   strokeWidth   {number}  0–5
 */
export function traceCanvas(canvas, opts = {}) {
  const {
    colors        = 16,
    blurRadius    = 0,
    pathOmit      = 8,
    curveTolerance = 1.0,
    strokeWidth   = 1,
  } = opts;

  const w = canvas.width;
  const h = canvas.height;

  // Work on a copy so we don't destroy the displayed source canvas
  const workCanvas = document.createElement('canvas');
  workCanvas.width = w;
  workCanvas.height = h;
  const ctx = workCanvas.getContext('2d');
  ctx.drawImage(canvas, 0, 0);

  if (blurRadius > 0) {
    applyBlur(ctx, w, h, blurRadius);
  }

  // ImageTracerJS options reference:
  // https://github.com/jankovicsandras/imagetracerjs/blob/master/options.md
  const tracerOptions = {
    // Color quantization
    numberofcolors: Math.max(2, Math.min(64, colors)),
    colorquantcycles: 3,

    // Path / shape handling
    pathomit: pathOmit,
    rightangleenhance: true,

    // Bezier curve fitting
    ltres: curveTolerance,         // line-to-curve threshold
    qtres: curveTolerance,         // quadratic bezier threshold

    // Stroke
    strokewidth: strokeWidth,

    // Output: inline SVG, no viewBox padding, scale 1:1
    scale: 1,
    roundcoords: 2,
    viewbox: false,
    desc: false,
    lcpr: 0,
    qcpr: 0,

    // Blur (handled manually above for more control)
    blurradius: 0,
    blurstep: 0,
  };

  // ImageTracerJS is loaded globally via the vendor script tag
  // It exposes window.ImageTracer
  const svgString = window.ImageTracer.imagedataToSVG(
    ctx.getImageData(0, 0, w, h),
    tracerOptions,
  );

  return svgString;
}

/**
 * Convert the canvas to a Base64 JPEG for sending to the AI API.
 * maxDim caps the image size to save bandwidth and API costs.
 */
export function canvasToBase64Jpeg(canvas, quality = 0.6, maxDim = 512) {
  const w = canvas.width;
  const h = canvas.height;

  const scale = Math.min(1, maxDim / Math.max(w, h));
  const tw = Math.round(w * scale);
  const th = Math.round(h * scale);

  const tmp = document.createElement('canvas');
  tmp.width = tw;
  tmp.height = th;
  tmp.getContext('2d').drawImage(canvas, 0, 0, tw, th);

  // Return only the Base64 portion (strip the data:image/jpeg;base64, prefix)
  const dataUrl = tmp.toDataURL('image/jpeg', quality);
  return dataUrl; // caller can use the full data URL or split on ','
}
