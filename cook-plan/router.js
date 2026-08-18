// =============================================
// Cook Planner — router.js
// Breaks circular dependency between render-input and render-schedule.
// Both modules register their render functions here; main.js wires them up.
// =============================================

import { state, setView } from './state.js';

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

// Paint whichever view `state.view` says we should be on. Used after an edit,
// and after a change arrives from the server — so it has to stay on the
// schedule when that is where the cook is, rather than dropping back to the
// editor. An empty plan has no schedule to show, so it falls back to the
// editor and records that, keeping the stored view honest.
export function renderCurrentView() {
  if (state.view === 'schedule' && state.items.length > 0) {
    showScheduleView();
    return;
  }
  if (state.view !== 'input') setView('input');
  showInputView();
}
