"use strict";

/* ==========================================================================
   A1. KiCad: s-expression parser
   ========================================================================== */

const TOK = /\s*(?:(\()|(\))|"((?:[^"\\]|\\.)*)"|([^\s()"]+))/y;

function parseSexp(text) {
  const root = [];
  const stack = [root];
  TOK.lastIndex = 0;
  let m;
  while (TOK.lastIndex < text.length && (m = TOK.exec(text))) {
    if (m[1]) {
      const node = [];
      stack[stack.length - 1].push(node);
      stack.push(node);
    } else if (m[2]) {
      if (stack.length > 1) stack.pop();
    } else if (m[3] !== undefined) {
      stack[stack.length - 1].push(m[3].replace(/\\(.)/g, '$1'));
    } else {
      stack[stack.length - 1].push(m[4]);
    }
  }
  if (!root.length) throw new Error('nothing parseable in this file');
  return root[0];
}

const kids = (node, name) =>
  node.filter(c => Array.isArray(c) && c.length && c[0] === name);

function kid(node, name) {
  for (const c of node) if (Array.isArray(c) && c.length && c[0] === name) return c;
  return null;
}

const hasFlag = (node, name) => node.some(c => c === name);

/** `hide` is a bare atom up to KiCad 7 and `(hide yes)` from KiCad 8. */
function isHidden(node) {
  if (hasFlag(node, 'hide')) return true;
  const h = kid(node, 'hide');
  return !!h && h[1] !== 'no';
}

/** Reference and value live in `(fp_text reference …)` up to KiCad 7 and in
    `(property "Reference" …)` from KiCad 8. Boards in the wild have either. */
function fpField(fpn, which) {
  for (const t of kids(fpn, 'fp_text'))
    if (t[1] === which) return t.length > 2 ? String(t[2]) : '';
  const want = which === 'reference' ? 'Reference' : 'Value';
  for (const p of kids(fpn, 'property'))
    if (p[1] === want) return p.length > 2 ? String(p[2]) : '';
  return '';
}

function f(x, dflt) {
  const v = parseFloat(x);
  return Number.isFinite(v) ? v : (dflt === undefined ? 0 : dflt);
}

function atOf(node, name) {
  const a = kid(node, name || 'at');
  if (!a) return [0, 0, 0];
  return [f(a[1]), f(a[2]), a.length > 3 ? f(a[3]) : 0];
}

function ptsOf(node) {
  const p = kid(node, 'pts');
  return p ? kids(p, 'xy').map(c => [f(c[1]), f(c[2])]) : [];
}
