"use strict";

/* ==========================================================================
   D2. view options -- the two switches under Layers
   ========================================================================== */

/* ---- dim the board on highlight ----
   Off by default: the board keeps its own colours at full strength and the lit
   net is picked out by the yellow alone. Dropping everything else to 10%
   opacity reads well on a monitor and badly on a phone, where outdoors the rest
   of the board vanishes into the background and you lose the context you were
   tracing against — so it is the option rather than the default.

   It is the one preference worth remembering — someone who wants it wants it
   every time — so it is stored. localStorage throws rather than returning null
   on a file:// origin in some browsers, hence the guards. */

const DIM_KEY = 'pcb-tracer.dim';

let dimOnHighlight = false;
try { dimOnHighlight = localStorage.getItem(DIM_KEY) === '1'; } catch (ex) { /* private mode */ }

const dimBox = $('opt-dim');
dimBox.checked = dimOnHighlight;
dimBox.addEventListener('change', () => {
  dimOnHighlight = dimBox.checked;
  try { localStorage.setItem(DIM_KEY, dimOnHighlight ? '1' : '0'); } catch (ex) { /* ditto */ }
  paint();
});

/* ---- screen wake lock ----
   Tracing a net on a bench means long stretches of looking without touching,
   which is exactly when a phone locks itself. Deliberately *not* remembered:
   holding a device awake is the sort of thing that should need asking for each
   session rather than surprising you later.

   A ticked box is not evidence that anything is held, and that is the whole
   difficulty here:

   * a reload starts with no lock at all, but browsers restore form state, so
     the box comes back ticked — a lie, and the exact case that prompted this;
   * a bfcache restore (back, or the app switcher) brings the *script's* state
     back with it, sentinel and all, but the lock itself was released while the
     page sat in the cache, so `wakeSentinel` is non-null and already released;
   * the system can drop the lock any time it likes — a flat battery will do it
     — and only says so through the sentinel's `release` event.

   So the sentinel is the only source of truth about what is held, `wantWake` is
   what the user asked for, and the two are shown separately: the tick is the
   request, the pill next to it is the fact. */

const wakeRow = $('opt-wake-row'), wakeBox = $('opt-wake'),
      wakeState = $('opt-wake-state'), wakeNote = $('opt-note');
let wakeSentinel = null;
let wantWake = false;

const holdingWake = () => !!wakeSentinel && !wakeSentinel.released;

function showWake() {
  const held = holdingWake();
  wakeBox.checked = wantWake;
  wakeState.hidden = !wantWake;
  wakeState.textContent = held ? 'holding' : 'not held';
  wakeState.classList.toggle('on', held);
}

async function takeWakeLock() {
  try {
    wakeSentinel = await navigator.wakeLock.request('screen');
    wakeSentinel.addEventListener('release', showWake);
  } catch (ex) {
    wakeSentinel = null;
    wantWake = false;
    wakeNote.textContent = 'The browser turned the wake lock down (' + ex.name +
      '). A low battery will do that.';
  }
  showWake();
}

function dropWakeLock() {
  wakeSentinel?.release();
  wakeSentinel = null;
  showWake();
}

/** Re-check what is actually held and take the lock again if it is owed. The
    one place that decides, called from every event that can invalidate the
    display behind our back. */
function verifyWakeLock() {
  if (wantWake && !holdingWake() && document.visibilityState === 'visible')
    takeWakeLock();                      // showWake() runs at the end of it
  else showWake();
}

// Not in Firefox before 126 or iOS Safari before 16.4, and a secure context
// only, so the row stays out of the way where it wouldn't work.
if ('wakeLock' in navigator) {
  wakeRow.hidden = false;
  showWake();                            // clears any tick the browser restored
  wakeBox.addEventListener('change', () => {
    wantWake = wakeBox.checked;
    wakeNote.textContent = '';
    if (wantWake) takeWakeLock(); else dropWakeLock();
  });
  // Hiding the page releases the lock and coming back does not return it, so a
  // board left behind another app would quietly stop holding the screen.
  document.addEventListener('visibilitychange', verifyWakeLock);
  // Covers the bfcache restore, and re-asserts the tick after a plain reload in
  // browsers that put it back during load rather than during parsing.
  addEventListener('pageshow', verifyWakeLock);
}
