/**
 * ai.js — Gemini API integration for pre-flight parameter tuning
 *         and post-trace semantic SVG cleanup.
 *
 * All API calls go directly from the browser to the Gemini REST API
 * using the user's own API key (stored in localStorage, never proxied).
 *
 * Exports:
 *   getStoredKey()           → string | null
 *   setStoredKey(key)
 *   getStoredModel()         → string
 *   setStoredModel(model)
 *   analyzeImage(base64Jpeg) → { imageType, recommendedSettings, reasoning }
 *   cleanupSVG(svgString)    → string (cleaned SVG)
 */

const STORAGE_KEY_APIKEY = 'trace_v2_gemini_key';
const STORAGE_KEY_MODEL  = 'trace_v2_gemini_model';
const DEFAULT_MODEL      = 'gemini-1.5-pro';
const API_BASE           = 'https://generativelanguage.googleapis.com/v1beta/models';
const SVG_CLEANUP_LIMIT  = 120_000; // chars — above this we warn but still try

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
 * parts: array of Gemini Part objects (text / inlineData)
 */
async function callGemini(parts, apiKey, model) {
  const url = `${API_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.1,   // low temperature for deterministic, structured output
      topP: 0.95,
      maxOutputTokens: 8192,
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

  // Strip the data URL prefix to get raw base64
  const [, base64Data] = base64DataUrl.split(',');

  const systemPrompt = `You are an expert graphic designer and technical SVG specialist. Analyze the provided image and determine the optimal parameters for a vector tracing algorithm (ImageTracerJS).

Task: Categorize the image and output a JSON configuration.

1. Analyze the image type: Is it a "photograph", "flat_logo", "sketch_line_art", or "complex_illustration"?
2. Based on the type, suggest parameters:
   - "flat_logo": fewer colors (4–8), low blurRadius, low pathOmit (2–4), moderate curveTolerance (1–2)
   - "photograph": many colors (24–48), moderate blurRadius (0.5–1.5), moderate pathOmit (8–16), higher curveTolerance (2–4)
   - "sketch_line_art": few colors (2–4), low blurRadius (0–1), low pathOmit (2–6), moderate curveTolerance (1–3)
   - "complex_illustration": medium colors (12–24), low-to-moderate blurRadius (0–1), moderate pathOmit (4–12), moderate curveTolerance (1–3)

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
    { text: systemPrompt },
    {
      inlineData: {
        mimeType: 'image/jpeg',
        data: base64Data,
      },
    },
  ];

  const raw = await callGemini(parts, apiKey, model);

  // Extract JSON even if the model wrapped it in backticks
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Gemini returned unexpected format (no JSON found).');

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    throw new Error(`Failed to parse Gemini JSON response: ${e.message}`);
  }

  // Validate and clamp
  const s = parsed.recommended_settings ?? {};
  return {
    imageType: parsed.image_type ?? 'unknown',
    reasoning: parsed.reasoning ?? '',
    recommendedSettings: {
      colors:          clamp(Math.round(s.colors ?? 16), 2, 64),
      blurRadius:      clamp(parseFloat(s.blurRadius ?? 0), 0, 5),
      pathOmit:        clamp(Math.round(s.pathOmit ?? 8), 0, 64),
      curveTolerance:  clamp(parseFloat(s.curveTolerance ?? 1), 0.1, 10),
    },
  };
}

/**
 * Phase 3: Post-trace SVG semantic cleanup.
 * Sends the raw SVG string to Gemini and gets back a cleaned,
 * semantically grouped version.
 *
 * Returns the cleaned SVG string.
 */
export async function cleanupSVG(svgString) {
  const apiKey = getStoredKey();
  if (!apiKey) throw new Error('No Gemini API key configured. Open Settings to add one.');

  const model = getStoredModel();

  if (svgString.length > SVG_CLEANUP_LIMIT) {
    console.warn(`SVG is ${svgString.length} chars — sending to Gemini anyway (may hit token limits).`);
  }

  const systemPrompt = `You are an expert frontend developer and SVG optimizer. I am providing you with an SVG generated by an automated tracing tool. It is functionally correct but structurally messy.

Task: Refactor the provided SVG code based on these rules:

1. Semantic Grouping: Group related <path> elements into <g> (group) tags based on spatial proximity or shared colors.
2. Naming: Add descriptive id or class attributes to <g> and <path> tags based on what they visually represent (e.g. <g id="background">, <path class="main-shape">). Infer names from structure and colors.
3. Optimization:
   - Round coordinate decimals to at most 2 decimal places (e.g. 10.4563 → 10.46).
   - If multiple paths share the exact same fill or stroke, move those attributes to a parent <g> tag.
4. DO NOT alter the actual shape coordinates (the d attribute) in a way that breaks the visual appearance.

Return ONLY the raw SVG code. No markdown. No explanation. No code fences.`;

  const parts = [
    { text: systemPrompt },
    { text: svgString },
  ];

  const result = await callGemini(parts, apiKey, model);

  // If the model accidentally wrapped it in a code fence, strip it
  return stripCodeFence(result);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function stripCodeFence(text) {
  // Remove ```svg ... ``` or ``` ... ``` wrappers if present
  return text
    .replace(/^```(?:svg|xml)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
}
