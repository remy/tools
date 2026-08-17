// The red badge on the settings cog while sync is failing.
//
// Its own module because both sides need it without depending on each other:
// sync.js pushes the status in, and render.js repaints after a render — the cog
// lives inside every panel, so the dots are new elements each time.

let lastStatus = null;

export function setSyncStatus(s) {
  lastStatus = s;
  paintSyncStatus();
}

export function paintSyncStatus() {
  const failing = lastStatus?.state === 'error';
  document.querySelectorAll('.sync-error-dot').forEach((dot) => {
    dot.hidden = !failing;
  });
}
