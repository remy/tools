// =============================================
// Cook Planner — main.js (entry point)
// =============================================

import { state, loadFromDb, setView, replaceAll } from './state.js';
import { db } from './db.js';
import { takeHashState } from './share-link.js';
import { migrateLegacy } from './migrate.js';
import { renderInputView } from './render-input.js';
import { renderScheduleView } from './render-schedule.js';
import { registerInputView, registerScheduleView, renderCurrentView } from './router.js';
import { initSettings } from './settings.js';
import { initSync } from './sync.js';
import { requestWakeLock } from './wake-lock.js';

// Register view renderers with the router so modules can switch views
// without importing each other (avoids circular dependencies).
registerInputView(renderInputView);
registerScheduleView(renderScheduleView);

const REPLACE_WARNING =
  'This link contains a different cook. Opening it replaces the plan on this '
  + 'device, and on anything it syncs with.\n\nOpen the shared cook?';

// Adopt a cook carried in `#state=`, if there is one. The fragment is stripped
// either way, so the URL never disagrees with what ends up on screen.
async function consumeShareLink() {
  const incoming = takeHashState();
  if (!incoming) return null;
  // A link is an explicit "show me this cook", so it wins over what is already
  // here — but not silently, when there is a real plan to lose.
  if (await db.hasData() && !confirm(REPLACE_WARNING)) return null;
  await replaceAll(incoming);
  return incoming;
}

async function show(incoming) {
  await loadFromDb();
  // A link captured mid-cook opens straight on the schedule.
  if (incoming?.view === 'schedule' && state.items.length > 0) setView('schedule');
  renderCurrentView();
}

async function init() {
  const incoming = await consumeShareLink();
  if (!incoming) await migrateLegacy();
  await show(incoming);
  initSettings();
  initSync();
}

// A link opened in a tab that already has the app running changes only the
// fragment — a same-document navigation, so init() never runs again.
window.addEventListener('hashchange', async () => {
  const incoming = await consumeShareLink();
  if (incoming) await show(incoming);
});

document.addEventListener('DOMContentLoaded', init);

// Re-acquire wake lock when page becomes visible again
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.view === 'schedule') {
    requestWakeLock();
  }
});
