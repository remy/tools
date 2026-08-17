// Per-device preferences.
//
// These deliberately stay in localStorage rather than the synced database: the
// timer setup you want on the phone you take to the gym is not necessarily the
// one you want on the laptop, and the open tab is a property of this screen,
// not of the plan.

export function isRestTimerEnabled() {
  try { return localStorage.getItem('rep-rest-timer') === '1'; }
  catch { return false; }
}

export function setRestTimerEnabled(on) {
  try { localStorage.setItem('rep-rest-timer', on ? '1' : '0'); } catch {}
}

export function getCircuitSetting(key, fallback) {
  try { return parseInt(localStorage.getItem('circuit-' + key), 10) || fallback; }
  catch { return fallback; }
}

export function setCircuitSetting(key, val) {
  try { localStorage.setItem('circuit-' + key, val); } catch {}
}

export function getActiveTab() {
  try { return parseInt(localStorage.getItem('activeTab'), 10); }
  catch { return NaN; }
}

export function setActiveTab(index) {
  try { localStorage.setItem('activeTab', index); } catch {}
}
