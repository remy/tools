// =============================================
// Cook Planner — main.js (entry point)
// =============================================

import { DEFAULT_STATE } from './constants.js';
import { state, loadState, _setState } from './state.js';
import { applyTheme } from './utils.js';
import { initAppliancePopover } from './appliance-popover.js';
import { renderInputView } from './render-input.js';
import { renderScheduleView } from './render-schedule.js';
import { registerInputView, registerScheduleView } from './router.js';
import { requestWakeLock } from './wake-lock.js';

// Register view renderers with the router so modules can switch views
// without importing each other (avoids circular dependencies).
registerInputView(renderInputView);
registerScheduleView(renderScheduleView);

function init() {
  applyTheme();
  initAppliancePopover();
  const loaded = loadState();
  if (loaded) {
    // Migrate/merge with defaults
    _setState({ ...DEFAULT_STATE, ...loaded, items: loaded.items || [] });
  }

  if (state.view === 'schedule' && state.items.length > 0) {
    renderScheduleView();
  } else {
    _setState({ ...state, view: 'input' });
    renderInputView();
  }
}

document.addEventListener('DOMContentLoaded', init);

// Re-acquire wake lock when page becomes visible again
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.view === 'schedule') {
    requestWakeLock();
  }
});
