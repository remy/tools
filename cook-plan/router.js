// =============================================
// Cook Planner — router.js
// Breaks circular dependency between render-input and render-schedule.
// Both modules register their render functions here; main.js wires them up.
// =============================================

let _renderInputView = null;
let _renderScheduleView = null;

export function registerInputView(fn) {
  _renderInputView = fn;
}

export function registerScheduleView(fn) {
  _renderScheduleView = fn;
}

export function showInputView() {
  if (_renderInputView) _renderInputView();
}

export function showScheduleView() {
  if (_renderScheduleView) _renderScheduleView();
}

// Render whichever view state.view says we should be on (used after item edits)
export function renderCurrentView() {
  // Lazy import to avoid pulling state into the router at module-parse time
  // Both render modules will have registered by the time this runs.
  if (_renderInputView) _renderInputView();
}
