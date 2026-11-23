// =============================================
// Cook Planner — render-schedule.js
// =============================================

import { state, saveItem, resetState, setView } from './state.js';
import { EV_TYPE_CHIP } from './constants.js';
import { escHtml, formatTime, formatDuration, nowMins } from './utils.js';
import { applianceConfig } from './appliances.js';
import { applianceLabel, mergedLabel, mergedSub, joinNames } from './events.js';
import { computeSchedule } from './schedule.js';
import { startClock, stopClock, getNextDayOffset, dismissNotification, clearNotifications, renderNotifications } from './clock.js';
import { toggleWakeLock, releaseWakeLock } from './wake-lock.js';
import { showInputView } from './router.js';
import { renderHeader, bindHeader } from './header.js';
import { initSimUI } from './sim-dialog.js';
import { buildShareLink } from './share-link.js';
import { exportJSON } from './render-input.js';

export function renderScheduleView() {
  stopClock();
  const { items, conflicts, events } = computeSchedule();

  // Everything from the first thing you touch to the food being on the table:
  // prep, cooking, resting and carving, not just the longest cook time.
  const firstAt   = events.length > 0 ? events[0].time : null;
  const serveAt   = events.find(ev => ev.type === 'serve')?.time ?? null;
  const totalSpan = (firstAt != null && serveAt != null) ? serveAt - firstAt : null;

  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="view" id="view-schedule">
      <div class="container">
        ${renderHeader(`
          <button class="btn btn-secondary btn-sm" id="btn-edit-plan">✏️ Edit</button>
          <button class="btn-icon" id="btn-simulate" aria-label="Simulate the clock">
            <span class="icon-mask icon-stopwatch" aria-hidden="true"></span>
          </button>
        `)}

        <div class="schedule-view">
          <!-- Clock bar -->
          <div class="clock-bar" id="clock-bar">
            <div class="clock-bar-top">
              <div class="clock-next" id="clock-next"></div>
              <button class="wake-lock-btn" id="wake-lock-btn">🔆 Keep awake</button>
            </div>
            <div class="clock-now">
              <span class="clock-time" id="clock-time">--:--:--</span>
              <span class="clock-date" id="clock-date"></span>
            </div>
          </div>

          <!-- Serve summary. The serve time is read off the schedule rather
               than from the target: in start mode the target is when cooking
               begins, and in either mode a hand-set start can push the meal
               later than planned. -->
          <div class="serve-summary">
            <div class="serve-stat">
              <div class="serve-stat-label">First action</div>
              <div class="serve-stat-value">${firstAt != null ? formatTime(firstAt) : '--:--'}</div>
            </div>
            <div class="serve-stat">
              <div class="serve-stat-label">Serving at</div>
              <div class="serve-stat-value">${serveAt != null ? formatTime(serveAt) : '--:--'}</div>
            </div>
            <div class="serve-stat">
              <div class="serve-stat-label">Start to table</div>
              <div class="serve-stat-value">${totalSpan ? formatDuration(totalSpan) : '\u2014'}</div>
            </div>
            <div class="serve-stat">
              <div class="serve-stat-label">Items</div>
              <div class="serve-stat-value">${state.items.length}</div>
            </div>
          </div>

          <!-- Conflicts -->
          ${conflicts.length > 0 ? renderConflicts(conflicts) : ''}
          ${renderNotices(items)}

          <!-- Timeline, with the chime log beside it once there is room -->
          <div class="schedule-main">
            <div class="timeline-section">
              <h2>Timeline</h2>
              <div class="timeline" id="timeline">
                ${renderTimeline(events, items)}
              </div>
            </div>

            <!-- Notifications: in-memory only, populated as chimes fire -->
            <aside class="schedule-aside">
              <h2>Chimes</h2>
              <div class="notifications" id="notifications" hidden></div>
              <p class="schedule-aside-empty">Each chime is logged here as the cook goes on.</p>
            </aside>
          </div>

          <!-- Appliance summary -->
          ${renderApplianceSummary(items)}

          <!-- Footer -->
          <div class="schedule-footer">
            <button class="btn btn-secondary btn-sm" id="btn-share">📋 Copy link</button>
            <button class="btn btn-secondary btn-sm" id="btn-new-cook">Start new cook</button>
            <button class="btn btn-ghost btn-sm" id="btn-export">⬇ Export JSON</button>
            <button class="btn btn-ghost btn-sm" id="btn-print">🖨 Print</button>
          </div>
        </div>
      </div>
    </div>
  `;

  bindScheduleEvents(items, events);
  startClock(events);
  // After startClock, so the simulate controls act on a clock that is running.
  initSimUI(events);
  // Re-paint any notifications that survived the re-render (e.g. after toggling
  // an override). The notification stack itself is module-private to clock.js.
  renderNotifications();
}

// Things the planner has arranged that you would never guess from the list of
// dishes: a tray changing oven halfway through, or coming out early to sit
// covered. Both need knowing about while there is still time to disagree,
// rather than being discovered at twenty to four — so they go at the top with
// the conflicts rather than only on the stop they happen at.
export function renderNotices(items) {
  const notes = [];

  for (const i of items) {
    if (!i._moveTo) continue;
    notes.push(`${i.name} starts in the Combi Oven and moves across to the Main Oven`
      + `${i._moveTo.shelf ? `, shelf ${i._moveTo.shelf},` : ''} at ${formatTime(i._moveTo.at)}`
      + ` — that is what frees the combi to microwave ${i._moveTo.forItem}.`);
  }

  // Grouped by how long each waits, since that is the part worth reading.
  const byHold = new Map();
  for (const i of items) {
    if (!(i._holdFor > 0)) continue;
    if (!byHold.has(i._holdFor)) byHold.set(i._holdFor, []);
    byHold.get(i._holdFor).push(i.name);
  }
  for (const [mins, names] of byHold) {
    const many = names.length > 1;
    notes.push(`${joinNames(names)} ${many ? 'come' : 'comes'} out ${formatDuration(mins)}`
      + ` before everything else so the combi is free in time.`
      + ` Cover ${many ? 'them' : 'it'} and ${many ? 'they' : 'it'} will keep.`);
  }

  if (notes.length === 0) return '';
  return `
    <div class="notices-section">
      ${notes.map(n => `
        <div class="notice-card">
          <strong>Heads up</strong>
          <div class="notice-detail">${escHtml(n)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

export function renderConflicts(conflicts) {
  return `
    <div class="conflicts-section">
      ${conflicts.map(c => `
        <div class="conflict-card">
          <strong>⚠️ Conflict</strong>
          <div class="conflict-detail">${escHtml(c.message)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

// Events sharing a clock time are one stop on the timeline.
function groupEvents(events) {
  const groups = [];
  for (const ev of events) {
    const last = groups[groups.length - 1];
    if (last && last.time === ev.time) last.events.push(ev);
    else groups.push({ time: ev.time, events: [ev] });
  }
  return groups;
}

export function renderTimeline(events, items) {
  const nextDayOffset = getNextDayOffset();
  const nowM = nowMins() - nextDayOffset;
  const cfg = applianceConfig();

  return groupEvents(events).map(group => {
    const isServeGroup = group.events.some(ev => ev.type === 'serve');
    // A group is past if ALL events in it are past
    const isPast   = group.events.every(ev => ev.endTime < nowM);
    // A group is active if ANY non-serve event in it is active
    const isActive = group.events.some(ev => ev.time <= nowM && ev.endTime >= nowM && ev.type !== 'serve');

    let cls = 'tl-event';
    if (isPast)       cls += ' tl-past';
    if (isActive)     cls += ' tl-active';
    if (isServeGroup) cls += ' tl-serve';

    // Within the time-group, merge events that share the same type+applianceKey
    const clusters = [];
    for (const ev of group.events) {
      const key = `${ev.type}::${ev.applianceKey || ''}`;
      const existing = clusters.find(c => c.key === key);
      if (existing) existing.events.push(ev);
      else clusters.push({ key, type: ev.type, events: [ev] });
    }

    const evRows = clusters.map(cluster => {
      const { type, events: evs } = cluster;
      const chip = EV_TYPE_CHIP[type] || '';

      // Merged label and sub-line
      const names = evs.map(e => e.itemName).filter(Boolean);
      const label = mergedLabel(type, evs, names);
      const sub   = mergedSub(type, evs);
      const tray  = trayNote(evs);

      // One panel of manual adjustments per overridable event in this cluster
      const overridable = evs.filter(e => e.canOverride && e.itemId);
      const editHtml = overridable.map(ev => {
        const item = items.find(i => i.id === ev.itemId);
        const namePrefix = evs.length > 1 ? `<span class="override-name">${escHtml(ev.itemName)}</span>` : '';
        return `<div class="tl-edit-row" data-id="${ev.itemId}">
            ${namePrefix}
            ${editFields(ev, item, cfg)}
          </div>`;
      }).join('');

      // Edit toggle: only present when at least one event in the cluster can be overridden
      const editBtn = overridable.length > 0
        ? `<button type="button" class="tl-edit" aria-label="Adjust this step" title="Adjust time, oven and shelf">✏️ Edit</button>`
        : '';

      // How long this step has been going. Only steps that take time get one --
      // "chicken out of oven" is an instant, not something you can be 40
      // minutes into. The clock fills it in and decides when to show it, so
      // the markup carries the window rather than a value.
      const runsUntil = Math.max(...evs.map(e => e.endTime ?? e.time));
      const elapsedHtml = runsUntil > group.time
        ? `<div class="tl-elapsed" data-start="${group.time}" data-end="${runsUntil}" hidden>
            <span class="tl-elapsed-value"></span> so far
          </div>`
        : '';

      // Hidden trackers so the clock updater can find each original event
      const trackers = evs.map(ev =>
        `<span class="tl-tracker" data-item="${ev.itemId || ''}" data-type="${ev.type}" aria-hidden="true"></span>`
      ).join('');

      return `
        <div class="tl-sub-event tl-type-${type}" data-item="${evs[0].itemId || ''}" data-type="${type}">
          ${trackers}
          ${chip ? `<span class="tl-chip">${chip}</span>` : ''}
          ${editBtn}
          <div class="tl-label">${escHtml(label)}</div>
          ${sub ? `<div class="tl-sub">${escHtml(sub)}</div>` : ''}
          ${elapsedHtml}
          ${tray ? `<div class="tl-tray">🍲 ${escHtml(tray)}</div>` : ''}
          ${editHtml ? `<div class="tl-override">${editHtml}</div>` : ''}
        </div>
      `;
    }).join('');

    return `
      <div class="${cls}" data-time="${group.time}">
        <div class="tl-time">
          ${formatTime(group.time)}
          <span class="tl-stage tl-stage-now">Now</span>
          <span class="tl-stage tl-stage-next">Next</span>
        </div>
        <div class="tl-dot"><span></span></div>
        <div class="tl-content">${evRows}</div>
      </div>
    `;
  }).join('');
}

// Tray advice for a step, printed only where the catalogue actually recommends
// the pairing — so it reads as advice rather than as a description of where
// things happened to land. Two dishes going in at the same moment are told to
// share one tray; a dish whose partner is already in (or still to come) is told
// what it is sharing with, which is the cue to use a big tray and leave room.
function trayNote(evs) {
  const inCluster = new Set(evs.map(e => e.itemName));
  const together = new Set();
  const apart = new Set();
  for (const ev of evs) {
    for (const mate of ev.trayMates || []) {
      if (inCluster.has(mate)) {
        together.add(ev.itemName);
        together.add(mate);
      } else {
        apart.add(mate);
      }
    }
  }
  if (together.size >= 2) {
    const also = apart.size ? ` (and ${joinNames([...apart])})` : '';
    return `One tray: ${joinNames([...together])}${also}`;
  }
  if (apart.size) return `Shares a tray with ${joinNames([...apart])}`;
  return null;
}

// The manual adjustments for a single dish: when it goes in, and where.
function editFields(ev, item, cfg) {
  const resource = ev.ct?.resource;
  const override = item?.overrideCookStart || '';
  const fields = [`
    <label class="tl-field">
      <span>Cook start</span>
      <span class="tl-field-control">
        <input type="time" class="override-input" data-id="${ev.itemId}" value="${escHtml(override)}">
        ${override ? `<button type="button" class="btn-clear-override" data-id="${ev.itemId}" title="Clear override">✕</button>` : ''}
      </span>
    </label>`];

  if (resource === 'oven') {
    const pref = item?.appliancePref || 'auto';
    fields.push(`
      <label class="tl-field">
        <span>Oven</span>
        <select class="tl-appl-input" data-id="${ev.itemId}">
          <option value="auto" ${pref === 'auto' ? 'selected' : ''}>Auto</option>
          <option value="main" ${pref === 'main' ? 'selected' : ''}>Main oven</option>
          ${cfg.hasCombi ? `<option value="combi" ${pref === 'combi' ? 'selected' : ''}>Combi oven</option>` : ''}
        </select>
      </label>`);

    if (cfg.mainOvenShelves > 1) {
      const shelfPref = item?.shelfPref ? String(item.shelfPref) : 'auto';
      fields.push(`
        <label class="tl-field">
          <span>Shelf</span>
          <select class="tl-shelf-input" data-id="${ev.itemId}">
            <option value="auto" ${shelfPref === 'auto' ? 'selected' : ''}>Auto</option>
            ${Array.from({ length: cfg.mainOvenShelves }, (_, i) => i + 1).map(n =>
              `<option value="${n}" ${shelfPref === String(n) ? 'selected' : ''}>Shelf ${n}</option>`
            ).join('')}
          </select>
        </label>`);
    }
  }

  if (resource === 'hob') {
    const pref = item?.appliancePref || 'auto';
    fields.push(`
      <label class="tl-field">
        <span>Hob</span>
        <select class="tl-appl-input" data-id="${ev.itemId}">
          <option value="auto" ${pref === 'auto' ? 'selected' : ''}>Auto</option>
          ${Array.from({ length: cfg.hobCount }, (_, i) => i + 1).map(n =>
            `<option value="hob${n}" ${pref === `hob${n}` ? 'selected' : ''}>Hob ${n}</option>`
          ).join('')}
        </select>
      </label>`);
  }

  return fields.join('');
}

export function renderApplianceSummary(items) {
  const cfg = applianceConfig();
  const nextDayOffset = getNextDayOffset();
  const hobItems = items.filter(i => i._appliance?.startsWith('hob'));

  // A dish that moves between ovens belongs to both cards, for the stretch it
  // actually spends in each. Everything else is one window covering its cook.
  const mainWindows = [];
  const combiWindows = [];
  for (const i of items) {
    if (i._appliance === 'main') {
      mainWindows.push({ item: i, shelf: i._shelf, start: i._s.cookStart, end: i._s.cookEnd });
    } else if (i._appliance === 'combi' || i._appliance === 'combi-mw') {
      combiWindows.push({
        item: i, start: i._s.cookStart, end: i._moveTo ? i._moveTo.at : i._s.cookEnd,
        mode: i._appliance === 'combi' ? 'oven' : 'MW',
      });
      if (i._moveTo) {
        mainWindows.push({
          item: i, shelf: i._moveTo.shelf, start: i._moveTo.at, end: i._s.cookEnd, moved: true,
        });
      }
    }
  }

  // Current slot usage at nowMins
  const now = nowMins() - nextDayOffset;
  function usedSlots(wins) {
    return wins.filter(w => w.start <= now && w.end > now)
               .reduce((s, w) => s + (w.item.shelfSlots || 1), 0);
  }

  const mainUsed  = usedSlots(mainWindows);
  const combiUsed = usedSlots(combiWindows);

  function slotBar(used, total) {
    let html = `<div class="slot-bar" aria-label="${used} of ${total} slots used">`;
    for (let i = 0; i < total; i++) {
      html += `<div class="slot${i < used ? ' used' : ''}"></div>`;
    }
    return html + '</div>';
  }

  // Shelf is called out here too, so a hand-picked one is verifiable at a
  // glance; a pin marks the ones the cook chose rather than the planner.
  function ovenLine(w) {
    const shelf = cfg.mainOvenShelves > 1 && w.shelf
      ? `Shelf ${w.shelf}${w.item._shelfPinned ? ' 📌' : ''} · ` : '';
    const moved = w.moved ? ' · moved in' : '';
    return `<span>${escHtml(w.item.name)}: ${shelf}${formatTime(w.start)}–${formatTime(w.end)}${moved}</span>`;
  }

  return `
    <div class="appliance-section">
      <h2>Appliances</h2>
      <div class="appliance-grid">
        <div class="appliance-card">
          <div class="app-name">Main Oven</div>
          <div class="app-capacity">${cfg.mainOvenShelves * 2} slots (${cfg.mainOvenShelves} shelf${cfg.mainOvenShelves > 1 ? ' × 2' : ''})</div>
          ${slotBar(mainUsed, cfg.mainOvenShelves * 2)}
          <div class="app-items">
            ${mainWindows.length === 0 ? '<span style="color:var(--text-3)">Nothing scheduled</span>' :
              mainWindows.map(ovenLine).join('')}
          </div>
        </div>
        ${cfg.hasCombi ? `
        <div class="appliance-card">
          <div class="app-name">Combi</div>
          <div class="app-capacity">2 slots (1 shelf), oven or MW</div>
          ${slotBar(combiUsed, 2)}
          <div class="app-items">
            ${combiWindows.length === 0 ? '<span style="color:var(--text-3)">Nothing scheduled</span>' :
              combiWindows.map(w => `<span>${escHtml(w.item.name)} (${w.mode}): ${formatTime(w.start)}–${formatTime(w.end)}${w.item._moveTo ? ' · then main oven' : ''}</span>`).join('')}
          </div>
        </div>` : ''}
        <div class="appliance-card">
          <div class="app-name">Hobs</div>
          <div class="app-capacity">${cfg.hobCount} independent hob${cfg.hobCount !== 1 ? 's' : ''}</div>
          <div class="slot-bar">
            ${Array.from({length: cfg.hobCount}, (_, i) => i + 1).map(h => {
              const inUse = hobItems.some(i => i._appliance === `hob${h}` && i._s.cookStart <= now && i._s.cookEnd > now);
              return `<div class="slot${inUse ? ' used' : ''}"></div>`;
            }).join('')}
          </div>
          <div class="app-items">
            ${hobItems.length === 0 ? '<span style="color:var(--text-3)">Nothing scheduled</span>' :
              hobItems.map(i => `<span>${escHtml(i.name)} (${applianceLabel(i._appliance, null)}): ${formatTime(i._s.cookStart)}–${formatTime(i._s.cookEnd)}</span>`).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

// Read the adjustment panel back onto the items. Returns true when something
// actually changed, i.e. when the schedule needs recomputing.
function commitEdits(subEvent) {
  let changed = false;

  const setField = (selector, apply) => {
    subEvent.querySelectorAll(selector).forEach(input => {
      const item = state.items.find(i => i.id === input.dataset.id);
      if (!item) return;
      if (apply(item, input.value)) {
        saveItem(item);
        changed = true;
      }
    });
  };

  setField('.override-input', (item, value) => {
    const next = value || null;
    if ((item.overrideCookStart || null) === next) return false;
    item.overrideCookStart = next;
    return true;
  });

  setField('.tl-appl-input', (item, value) => {
    const next = value || 'auto';
    if ((item.appliancePref || 'auto') === next) return false;
    item.appliancePref = next;
    return true;
  });

  setField('.tl-shelf-input', (item, value) => {
    const next = value === 'auto' ? null : value;
    if ((item.shelfPref ?? null) === next) return false;
    item.shelfPref = next;
    return true;
  });

  return changed;
}

export function bindScheduleEvents(items, events) {
  bindHeader();

  document.getElementById('btn-edit-plan').addEventListener('click', () => {
    stopClock();
    releaseWakeLock();
    setView('input');
    showInputView();
  });

  document.getElementById('btn-new-cook')?.addEventListener('click', async () => {
    if (confirm('Start a new cook? This will clear all items and settings.')) {
      stopClock();
      releaseWakeLock();
      clearNotifications();
      await resetState();
      setView('input');
      showInputView();
    }
  });

  document.getElementById('notifications')?.addEventListener('click', e => {
    const btn = e.target.closest('.notification-dismiss');
    if (!btn) return;
    if (e.shiftKey) clearNotifications();
    else dismissNotification(btn.dataset.id);
  });

  document.getElementById('btn-share')?.addEventListener('click', async () => {
    const link = buildShareLink(state);
    try {
      await navigator.clipboard.writeText(link);
      const btn = document.getElementById('btn-share');
      if (btn) { btn.textContent = '✅ Copied!'; setTimeout(() => { if (btn) btn.textContent = '📋 Copy link'; }, 2000); }
    } catch {
      // Clipboard blocked (e.g. insecure context) — surface the link to copy by hand.
      prompt('Copy this URL to share:', link);
    }
  });

  document.getElementById('btn-export')?.addEventListener('click', exportJSON);
  document.getElementById('btn-print')?.addEventListener('click', () => window.print());

  document.getElementById('wake-lock-btn')?.addEventListener('click', toggleWakeLock);

  // Edit / save toggle for the adjustment panel (commits on save click)
  document.getElementById('timeline')?.addEventListener('click', e => {
    const editBtn = e.target.closest('.tl-edit');
    if (editBtn) {
      const subEvent = editBtn.closest('.tl-sub-event');
      if (!subEvent) return;
      const editing = subEvent.classList.toggle('editing');
      if (editing) {
        editBtn.innerHTML = '💾 Save';
        editBtn.setAttribute('aria-label', 'Save changes');
        // Focus the first input so the user can pick a time straight away
        subEvent.querySelector('.override-input')?.focus();
      } else if (commitEdits(subEvent)) {
        renderScheduleView();
      }
      return;
    }

    const clearBtn = e.target.closest('.btn-clear-override');
    if (clearBtn) {
      const id = clearBtn.dataset.id;
      const item = state.items.find(i => i.id === id);
      if (item) {
        item.overrideCookStart = null;
        saveItem(item);
        renderScheduleView();
      }
    }
  });
}
