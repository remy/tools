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
   session rather than surprising you later. */

const wakeRow = $('opt-wake-row'), wakeBox = $('opt-wake'), wakeNote = $('opt-note');
let wakeSentinel = null;

async function takeWakeLock() {
  try {
    wakeSentinel = await navigator.wakeLock.request('screen');
    // The system can drop it on its own (going to hidden, or low battery), and
    // says so through this event rather than by rejecting anything.
    wakeSentinel.addEventListener('release', () => { wakeSentinel = null; });
  } catch (ex) {
    wakeSentinel = null;
    wakeBox.checked = false;
    wakeNote.textContent = 'The browser turned the wake lock down (' + ex.name +
      '). A low battery will do that.';
  }
}

function dropWakeLock() {
  wakeSentinel?.release();
  wakeSentinel = null;
}

// Not in Firefox before 126 or iOS Safari before 16.4, and a secure context
// only, so the row stays out of the way where it wouldn't work.
if ('wakeLock' in navigator) {
  wakeRow.hidden = false;
  wakeBox.addEventListener('change', () => {
    wakeNote.textContent = '';
    if (wakeBox.checked) takeWakeLock(); else dropWakeLock();
  });
  // Switching tabs releases the lock and does not give it back, so a board left
  // open behind another app would quietly stop holding the screen on return.
  document.addEventListener('visibilitychange', () => {
    if (wakeBox.checked && !wakeSentinel && document.visibilityState === 'visible')
      takeWakeLock();
  });
}
