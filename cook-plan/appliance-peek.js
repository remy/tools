// =============================================
// Cook Planner — appliance-peek.js
//
// Hover an appliance's name anywhere on the timeline and it says what is in
// it at that moment. The timeline tells you what to do next; this answers the
// other question a cook asks at the oven door — what is already in there.
//
// Built on the popover API, so the browser handles the top layer, Escape and
// light dismiss, and on CSS anchor positioning, so the box finds its own way
// to the right place (with a small manual fallback for older browsers).
// =============================================

import { escHtml, formatTime } from './utils.js';
import { applianceConfig, applianceWindows } from './appliances.js';
import { applianceLabel } from './events.js';

const HOVERS = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? false;
const ANCHORED = CSS.supports?.('anchor-name', '--a') ?? false;

let scheduled = [];
let anchoredEl = null;

// The combi is one box with two jobs, so peeking at either shows both.
const sameBox = (a, b) =>
  a === b || (a.startsWith('combi') && b.startsWith('combi'));

function capacityNote(key, wins) {
  const cfg = applianceConfig();
  const slots = wins.reduce((n, w) => n + (w.item.shelfSlots || 1), 0);
  if (key === 'main') return `${slots} of ${cfg.mainOvenShelves * 2} slots`;
  if (key.startsWith('combi')) {
    return wins.some(w => w.mode === 'MW')
      ? 'Microwaving — nothing else can go in'
      : `${slots} of 2 slots`;
  }
  return slots > 1 ? `${slots} pans` : '';
}

function peekHtml(key, at) {
  const label = applianceLabel(key, null);
  const wins = applianceWindows(scheduled)
    .filter(w => sameBox(w.key, key) && w.start <= at && w.end > at)
    .sort((a, b) => a.start - b.start);

  const rows = wins.map(w => {
    // A dish whose stretch here ends at its move time is not coming out, it is
    // going next door -- "out" would have the cook reaching for a plate.
    const movesOn = !w.moved && w.item._moveTo && w.end === w.item._moveTo.at;
    const where = [
      w.shelf && w.key === 'main' ? `Shelf ${w.shelf}` : null,
      w.mode === 'MW' ? 'microwaving' : null,
      w.moved ? 'moved in' : null,
      movesOn ? `→ Main Oven ${formatTime(w.end)}` : `out ${formatTime(w.end)}`,
    ].filter(Boolean).join(' · ');
    return `<li><span class="peek-dish">${escHtml(w.item.name)}</span>`
      + `<span class="peek-when">${where}</span></li>`;
  }).join('');

  const note = capacityNote(key, wins);
  return `
    <div class="peek-head">${escHtml(label)}<span>${formatTime(at)}</span></div>
    ${wins.length === 0
      ? `<div class="peek-empty">Empty — nothing in it at ${formatTime(at)}</div>`
      : `<ul class="peek-list">${rows}</ul>`}
    ${note ? `<div class="peek-foot">${note}</div>` : ''}
  `;
}

// Without anchor positioning a popover would sit dead centre, which for a
// tooltip is worse than useless -- so place it by hand in that case only.
function placeManually(peek, el) {
  const r = el.getBoundingClientRect();
  peek.style.position = 'fixed';
  peek.style.inset = 'auto';
  peek.style.margin = '0';
  peek.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - 360))}px`;
  peek.style.top = `${r.bottom + 6}px`;
}

function fill(peek, el) {
  if (anchoredEl && anchoredEl !== el) anchoredEl.style.anchorName = '';
  anchoredEl = el;
  if (ANCHORED) el.style.anchorName = '--appl-peek';
  peek.innerHTML = peekHtml(el.dataset.appliance, Number(el.dataset.at));
  if (!ANCHORED) placeManually(peek, el);
}

// showPopover/hidePopover throw if the popover is already in that state.
const open  = (peek) => { if (!peek.matches(':popover-open')) peek.showPopover(); };
const close = (peek) => { if (peek.matches(':popover-open')) peek.hidePopover(); };

// Called after every render of the schedule: the triggers are new elements
// each time, while the popover itself lives in index.html.
export function initAppliancePeek(items) {
  scheduled = items;
  const peek = document.getElementById('appliance-peek');
  if (!peek) return;

  for (const el of document.querySelectorAll('.appl-peek')) {
    // Before the click that popovertarget turns into a toggle, so the box is
    // already filled in by the time it opens. Covers taps and keyboard too.
    el.addEventListener('pointerdown', () => fill(peek, el));
    el.addEventListener('focus', () => fill(peek, el));

    if (!HOVERS) continue;
    el.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse') return;
      fill(peek, el);
      open(peek);
    });
    el.addEventListener('pointerleave', () => close(peek));
  }
}
