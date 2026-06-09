import { db } from './db.js';
import { bindEvents } from './events.js';
import { refreshAll } from './lists.js';

// Coalesce remote-sync changes into a single refresh.
let refreshTimer = null;
function scheduleRefresh() {
  if (refreshTimer) return;
  refreshTimer = setTimeout(async () => {
    refreshTimer = null;
    await refreshAll();
  }, 50);
}

async function init() {
  await refreshAll();
  bindEvents();
  db.onChange(scheduleRefresh);
}

init();
