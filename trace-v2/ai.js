/**
 * ai.js — Gemini API integration for pre-flight parameter tuning
 *         and post-trace semantic SVG grouping.
 *
 * All API calls go directly from the browser to the Gemini REST API
 * using the user's own API key (stored in localStorage, never proxied).
 *
 * Exports:
 *   getStoredKey()                          → string | null
 *   setStoredKey(key)
 *   getStoredModel()                        → string
 *   setStoredModel(model)
 *   analyzeImage(base64DataUrl)             → { imageType, recommendedSettings, reasoning }
 *   getColorGroupLabels(colorList, imgType) → { [color]: label }
 */

const STORAGE_KEY_APIKEY = 'trace_v2_gemini_key';
const STORAGE_KEY_MODEL  = 'trace_v2_gemini_model';
const DEFAULT_MODEL      = 'gemini-2.5-flash-lite';
const API_BASE           = 'https://generativelanguage.googleapis.com/v1beta/models';

export function getStoredKey() {
  return localStorage.getItem(STORAGE_KEY_APIKEY) || null;
}

export function setStoredKey(key) {
  if (key) {
    localStorage.setItem(STORAGE_KEY_APIKEY, key);
  } else {
    localStorage.removeItem(STORAGE_KEY_APIKEY);
  }
}

export function getStoredModel() {
  return localStorage.getItem(STORAGE_KEY_MODEL) || DEFAULT_MODEL;
}

export function setStoredModel(model) {
  localStorage.setItem(STORAGE_KEY_MODEL, model);
}

/**
 * Internal: call the Gemini generateContent endpoint.
 */
async function callGemini(parts, apiKey, model) {
  const url = `${API_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.1,
      topP: 0.95,
      maxOutputTokens: 1024, // labels only — no SVG reproduction needed
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    let message = `Gemini API error ${res.status}`;
    try {
      const errJson = JSON.parse(errText);
      message = errJson?.error?.message ?? message;
    } catch { /* ignore */ }
    throw new Error(message);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return text.trim();
}

/**
 * Phase 2: Pre-flight image analysis.
 * Sends a compressed JPEG to Gemini Vision and gets back optimal
 * tracing parameters as a JSON object.
 *
 * base64DataUrl: full data URL string (data:image/jpeg;base64,...)
 */
export async function analyzeImage(base64DataUrl) {
  const apiKey = getStoredKey();
  if (!apiKey) throw new Error('No Gemini API key configured. Open Settings to add one.');

  const model = getStoredModel();
  const [, base64Data] = base64DataUrl.split(',');

  const prompt = `You are an expert graphic designer and technical SVG specialist. Analyze the provided image and determine the optimal parameters for a vector tracing algorithm (ImageTracerJS).

Task: Categorize the image and output a JSON configuration.

1. Analyze the image type: Is it a "photograph", "flat_logo", "sketch_line_art", or "complex_illustration"?
2. Based on the type, suggest parameters:
   - "flat_logo": fewer colors (4–8), low blurRadius, low pathOmit (2–4), moderate curveTolerance (1–2)
   - "photograph": many colors (24–48), moderate blurRadius (0.5–1.5), moderate pathOmit (8–16), higher curveTolerance (2–4)
   - "sketch_line_art": few colors (2–4), low blurRadius (0–1), low pathOmit (2–6), moderate curveTolerance (1–3)
   - "complex_illustration": medium colors (12–24), low blurRadius (0–1), moderate pathOmit (4–12), moderate curveTolerance (1–3)

Output ONLY strictly valid JSON matching this exact schema (no markdown, no explanation):
{
  "image_type": "string",
  "recommended_settings": {
    "colors": <number 2–64>,
    "blurRadius": <number 0.0–5.0>,
    "pathOmit": <number 0–64>,
    "curveTolerance": <number 0.1–10.0>
  },
  "reasoning": "<1-sentence explanation>"
}`;

  const parts = [
    { text: prompt },
    { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
  ];

  // Use a higher token limit for the vision call since the prompt schema needs room
  const url = `${API_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0.1, topP: 0.95, maxOutputTokens: 512 },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    let message = `Gemini API error ${res.status}`;
    try { message = JSON.parse(errText)?.error?.message ?? message; } catch { /* ignore */ }
    throw new Error(message);
  }

  const data = await res.json();
  const raw = (data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Gemini returned unexpected format (no JSON found).');

  let parsed;
  try { parsed = JSON.parse(jsonMatch[0]); }
  catch (e) { throw new Error(`Failed to parse Gemini JSON response: ${e.message}`); }

  const s = parsed.recommended_settings ?? {};
  return {
    imageType: parsed.image_type ?? 'unknown',
    reasoning: parsed.reasoning ?? '',
    recommendedSettings: {
      colors:         clamp(Math.round(s.colors ?? 16), 2, 64),
      blurRadius:     clamp(parseFloat(s.blurRadius ?? 0), 0, 5),
      pathOmit:       clamp(Math.round(s.pathOmit ?? 8), 0, 64),
      curveTolerance: clamp(parseFloat(s.curveTolerance ?? 1), 0.1, 10),
    },
  };
}

/**
 * Phase 3 (AI part only): ask Gemini to label each unique fill color with a
 * short semantic name. We intentionally never send SVG path data to the AI —
 * all structural work (grouping, coordinate rounding) is done client-side.
 * This keeps input AND output tiny regardless of SVG complexity.
 *
 * colorList: string[]  — unique fill colors in document order (back → front)
 * imageType: string    — from pre-flight, e.g. "flat_logo"
 * Returns: { [color]: label }
 */
export async function getColorGroupLabels(colorList, imageType) {
  const apiKey = getStoredKey();
  if (!apiKey) throw new Error('No Gemini API key configured. Open Settings to add one.');

  const model = getStoredModel();

  const prompt = `You are an SVG semantic analyst. An automated tracer produced an SVG with ${colorList.length} distinct fill colors. Each color represents a visual layer in the image.

Image type: ${imageType || 'unknown'}

Colors (index 0 = backmost layer, last = frontmost):
${colorList.map((c, i) => `${i}: ${c}`).join('\n')}

For each color provide a concise semantic label for what it likely represents visually (e.g. "background", "sky", "main-body", "shadow", "highlight", "outline", "fill-red").

Rules:
- Lowercase, hyphen-separated words only (valid as HTML id values).
- Max 3 words. Index 0 is almost always "background".
- If unsure, use something descriptive like "layer-${0}" or "fill-blue".

Return ONLY valid JSON with no explanation:
{"<color>": "<label>", ...}`;

  const raw = await callGemini([{ text: prompt }], apiKey, model);

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Gemini returned unexpected format (no JSON found).');

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    throw new Error(`Failed to parse Gemini label response: ${e.message}`);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
