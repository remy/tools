// Inline markdown → styled runs, plus wrapping, fitting and drawing on canvas.
// Supports **bold**, *italic*, `code`, ~~strike~~, ==highlight==, [links](url)
// (rendered as their text), backslash escapes and hard line breaks.

const MONO = 'ui-monospace, "SF Mono", "Cascadia Code", Menlo, Monaco, Consolas, monospace';

const TOKEN = /\\([\\`*_~=[\]()])|`([^`\n]+)`|\[([^\]\n]+)\]\([^)\n]*\)|(\*\*|__|~~|==|\*|_)|(\n)/g;
const CODE_PAD = 0.14;
const FLAG = { '**': 'b', __: 'b', '*': 'i', _: 'i', '~~': 's', '==': 'mark' };
const isSpace = (c) => !c || /\s/.test(c);
const isWord = (c) => !!c && /[\p{L}\p{N}]/u.test(c);

/** @returns {Array<{ text?: string, br?: true, b?: boolean, i?: boolean, s?: boolean, mark?: boolean, code?: boolean }>} */
export function parseMarkdown(src) {
  const tokens = [];
  const text = (t) => t && tokens.push({ type: 'text', text: t });
  let last = 0;
  for (const m of src.matchAll(TOKEN)) {
    text(src.slice(last, m.index));
    last = m.index + m[0].length;
    const [all, escaped, code, link, delim, br] = m;
    if (escaped) text(escaped);
    else if (code) tokens.push({ type: 'code', text: code });
    else if (link) text(link);
    else if (br) tokens.push({ type: 'br' });
    else if (delim) {
      const prev = src[m.index - 1];
      const next = src[last];
      let open = !isSpace(next);
      let close = !isSpace(prev);
      // underscores inside words (snake_case) are literal
      if (delim[0] === '_') {
        open &&= !isWord(prev);
        close &&= !isWord(next);
      }
      tokens.push({ type: 'delim', text: all, open, close });
    }
  }
  text(src.slice(last));

  // pair delimiters; anything left unpaired is literal text
  const stacks = {};
  for (const t of tokens) {
    if (t.type !== 'delim') continue;
    const stack = (stacks[t.text] ??= []);
    if (t.close && stack.length) {
      stack.pop().active = true;
      t.active = true;
    } else if (t.open) stack.push(t);
  }

  const runs = [];
  const flags = {};
  for (const t of tokens) {
    if (t.type === 'br') runs.push({ br: true });
    else if (t.type === 'delim' && t.active) flags[FLAG[t.text]] = !flags[FLAG[t.text]];
    else runs.push({ ...flags, text: t.text, code: t.type === 'code' });
  }
  return runs;
}

/** Plain-text version of the markdown, for measuring or accessibility. */
export function stripMarkdown(src) {
  return parseMarkdown(src).map((r) => (r.br ? '\n' : r.text)).join('');
}

/**
 * spec: { family, weight, italic } describing the base font.
 * Emphasis inside an italic base flips back to roman, as print does.
 */
function fontFor(spec, size, run) {
  const italic = !!spec.italic !== !!run.i;
  const weight = run.b ? Math.min(900, Math.max(700, spec.weight + 300)) : spec.weight;
  const family = run.code ? MONO : spec.family;
  const px = run.code && spec.family !== MONO ? size * 0.85 : size;
  return `${italic ? 'italic ' : ''}${weight} ${px}px ${family}`;
}

/** Split runs into wrap units: words (possibly spanning styles), spaces and breaks. */
function units(runs) {
  const out = [];
  let word = null;
  for (const run of runs) {
    if (run.br) {
      word = null;
      out.push({ br: true });
      continue;
    }
    const pieces = [];
    for (const part of run.text.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        word = null;
        const space = { ...run, text: ' ' };
        pieces.push(space);
        out.push({ space });
      } else {
        if (!word) out.push((word = { pieces: [] }));
        const piece = { ...run, text: part };
        pieces.push(piece);
        word.pieces.push(piece);
      }
    }
    // only the outer edges of a code span get padding
    if (run.code && pieces.length) {
      pieces[0].padStart = true;
      pieces.at(-1).padEnd = true;
    }
  }
  return out;
}

function layout(ctx, list, spec, size, maxW) {
  const measure = (piece) => {
    const font = fontFor(spec, size, piece);
    ctx.font = font;
    // code pills get breathing room so the background doesn't touch neighbours
    const pad = size * CODE_PAD;
    const inset = piece.padStart ? pad : 0;
    const extra = inset + (piece.padEnd ? pad : 0);
    return { ...piece, font, inset, width: ctx.measureText(piece.text).width + extra };
  };
  const lines = [];
  let line = { pieces: [], width: 0 };
  let pending = null;
  const push = () => {
    lines.push(line);
    line = { pieces: [], width: 0 };
    pending = null;
  };
  for (const u of list) {
    if (u.br) push();
    else if (u.space) pending = line.pieces.length ? measure(u.space) : null;
    else {
      const pieces = u.pieces.map(measure);
      const ww = pieces.reduce((t, p) => t + p.width, 0);
      const sw = pending?.width ?? 0;
      if (line.pieces.length && line.width + sw + ww > maxW) push();
      else if (pending) {
        line.pieces.push(pending);
        line.width += sw;
      }
      pending = null;
      line.pieces.push(...pieces);
      line.width += ww;
    }
  }
  lines.push(line);
  return lines;
}

/** Largest size between min and max whose wrapped markdown fits the box. */
export function fitRich(ctx, src, spec, maxW, maxH, lh, min, max) {
  const list = units(parseMarkdown(src));
  let lo = min;
  let hi = max;
  let best = null;
  for (let i = 0; i < 14; i++) {
    const size = (lo + hi) / 2;
    const lines = layout(ctx, list, spec, size, maxW);
    if (lines.length * size * lh <= maxH && lines.every((l) => l.width <= maxW)) {
      best = { size, lines };
      lo = size;
    } else hi = size;
  }
  return best ?? { size: min, lines: layout(ctx, list, spec, min, maxW) };
}

/**
 * Draws fitted lines using the current fillStyle as the text colour.
 * opts: { align, boxH, valign: 'top'|'center'|'bottom', mark, code } — mark/code are background colours.
 */
export function drawRich(ctx, fit, x, y, lh, opts = {}) {
  const { align = 'left', boxH = 0, valign = 'top', mark = 'rgba(250, 204, 21, 0.45)', code = 'rgba(127, 127, 127, 0.22)' } = opts;
  const color = ctx.fillStyle;
  const { size } = fit;
  const lineH = size * lh;
  const blockH = fit.lines.length * lineH;
  const slack = boxH ? Math.max(0, boxH - blockH) : 0;
  const top = y + (valign === 'center' ? slack / 2 : valign === 'bottom' ? slack : 0);
  ctx.textAlign = 'left';

  fit.lines.forEach((line, i) => {
    const baseline = top + i * lineH + size * 0.95;
    const start = align === 'center' ? x - line.width / 2 : x;

    // backgrounds first, merged across adjacent pieces of the same kind
    let px = start;
    for (let j = 0; j < line.pieces.length; j++) {
      const p = line.pieces[j];
      for (const kind of ['mark', 'code']) {
        if (!p[kind] || line.pieces[j - 1]?.[kind]) continue;
        let w = 0;
        for (let k = j; k < line.pieces.length && line.pieces[k][kind]; k++) w += line.pieces[k].width;
        const padX = kind === 'code' ? 0 : size * 0.06;
        ctx.fillStyle = kind === 'mark' ? mark : code;
        ctx.beginPath();
        ctx.roundRect(px - padX, baseline - size * 0.82, w + padX * 2, size * 1.08, size * 0.12);
        ctx.fill();
      }
      px += p.width;
    }

    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    px = start;
    for (const p of line.pieces) {
      ctx.font = p.font;
      ctx.fillText(p.text, px + p.inset, baseline);
      if (p.s) {
        ctx.lineWidth = Math.max(1, size * 0.06);
        ctx.beginPath();
        ctx.moveTo(px, baseline - size * 0.3);
        ctx.lineTo(px + p.width, baseline - size * 0.3);
        ctx.stroke();
      }
      px += p.width;
    }
  });
}
