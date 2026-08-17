// Touch and pointer gestures on exercise rows.

import { openEditDialog, openCardioDialog } from './dialogs.js';

/* ── Scroll gating ──
   Prevent accidental scroll on mobile during a tap on the radio-style
   bullet at the start of an exercise row. Scroll is unlocked when either
   (a) the finger has been held for HOLD_MS, or (b) the finger has moved
   more than FLICK_PX — so deliberate swipes still scroll immediately while
   tap jitter does not cause scroll. Only the bullet gets gated; tapping
   the exercise name/text scrolls normally. */
function bindScrollGating() {
  const HOLD_MS = 180;
  const FLICK_PX = 14;
  // Bullet is 18px + 2×2 border ≈ 22px; give a small margin so the edge of
  // the circle isn't impossible to hit, but stop well before the text.
  const BULLET_HIT_PX = 30;
  let startTime = 0;
  let startX = 0;
  let startY = 0;
  let scrollUnlocked = false;
  let tracking = false;

  document.addEventListener('touchstart', (e) => {
    tracking = false;
    if (e.touches.length !== 1) return;
    const row = e.target.closest('.exercise-row');
    if (!row) return;
    const nameEl = row.querySelector('.ex-name');
    if (!nameEl) return;
    const t = e.touches[0];
    const rect = nameEl.getBoundingClientRect();
    if (t.clientX > rect.left + BULLET_HIT_PX) return;
    startTime = Date.now();
    startX = t.clientX;
    startY = t.clientY;
    scrollUnlocked = false;
    tracking = true;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!tracking || e.touches.length !== 1) return;
    if (scrollUnlocked) return;
    const t = e.touches[0];
    const moved = Math.hypot(t.clientX - startX, t.clientY - startY);
    if (moved > FLICK_PX || Date.now() - startTime >= HOLD_MS) {
      scrollUnlocked = true;
      return;
    }
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchend', () => { tracking = false; }, { passive: true });
  document.addEventListener('touchcancel', () => { tracking = false; }, { passive: true });
}

/* ── Long-press (1s+) on an exercise row or the cardio block opens its edit dialog ── */
function bindLongPress() {
  const HOLD_MS = 1000;
  const MOVE_PX = 10;
  const TARGET_SELECTOR = '.exercise-row, .cardio-block';
  let timer = null;
  let startX = 0;
  let startY = 0;
  let pressEl = null;
  let longPressReady = false;
  let suppressClick = false;

  function cancelPress() {
    if (pressEl) pressEl.classList.remove('long-press-charging', 'long-press-ready');
    clearTimeout(timer);
    timer = null;
    pressEl = null;
    longPressReady = false;
  }

  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = e.target.closest(TARGET_SELECTOR);
    if (!el) return;
    startX = e.clientX;
    startY = e.clientY;
    pressEl = el;
    longPressReady = false;
    el.style.setProperty('--hold-duration', HOLD_MS + 'ms');
    el.classList.add('long-press-charging');
    timer = setTimeout(() => {
      if (!pressEl) return;
      longPressReady = true;
      pressEl.classList.remove('long-press-charging');
      pressEl.classList.add('long-press-ready');
      if (navigator.vibrate) navigator.vibrate(15);
    }, HOLD_MS);
  });

  document.addEventListener('pointermove', (e) => {
    if (!pressEl) return;
    const moved = Math.hypot(e.clientX - startX, e.clientY - startY);
    if (moved > MOVE_PX) cancelPress();
  });

  // Open the dialog only once the finger/mouse has actually lifted, and defer
  // it a tick past that — opening mid-gesture means the release lands on
  // whatever's now under it in the freshly-opened dialog (e.g. Cancel),
  // dismissing it instantly.
  document.addEventListener('pointerup', () => {
    if (longPressReady && pressEl) {
      suppressClick = true;
      const el = pressEl;
      setTimeout(() => {
        if (el.classList.contains('cardio-block')) openCardioDialog(el);
        else openEditDialog(el);
      }, 0);
    }
    cancelPress();
  });
  document.addEventListener('pointercancel', cancelPress);

  document.addEventListener('contextmenu', (e) => {
    if (e.target.closest(TARGET_SELECTOR)) e.preventDefault();
  });

  // Suppress the tap/click that follows a long-press so it doesn't also toggle a set.
  document.addEventListener('click', (e) => {
    if (suppressClick) {
      suppressClick = false;
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);
}

export function bindGestures() {
  bindScrollGating();
  bindLongPress();
}
