// =============================================
// Cook Planner — render-schedule.js
// =============================================

import { state, saveItem, resetState, setView } from './state.js';
import { EV_TYPE_CHIP } from './constants.js';
import { escHtml, formatTime, formatDuration, nowMins } from './utils.js';
import { applianceConfig } from './appliances.js';
import { applianceLabel, mergedLabel, mergedSub } from './events.js';
import { computeSchedule } from './schedule.js';
import { startClock, stopClock, getNextDayOffset, dismissNotification, clearNotifications, renderNotifications } from './clock.js';
import { toggleWakeLock, releaseWakeLock } from './wake-lock.js';
import { showInputView } from './router.js';
import { renderHeader, bindHeader } from './header.js';
import { buildShareLink } from './share-link.js';
import { exportJSON } from './render-input.js';

export function renderScheduleView() {
  stopClock();
  const { items, conflicts, events } = computeSchedule();

  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="view" id="view-schedule">
      <div class="container">
        ${renderHeader('<button class="btn btn-secondary btn-sm" id="btn-edit-plan">\u270f\ufe0f Edit</button>')}

        <div class="schedule-view">
          <!-- Clock bar -->
          <div class="clock-bar" id="clock-bar">
            <div class="clock-bar-top">
              <div class="clock-next" id="clock-next"></div>
              <button class="wake-lock-btn" id="wake-lock-btn">\ud83d\udd06 Keep awake</button>
            </div>
            <div class="clock-now">
              <span class="clock-time" id="clock-time">--:--:--</span>
              <span class="clock-date" id="clock-date"></span>
            </div>
          </div>

          <!-- Notifications: in-memory only, populated as chimes fire -->
          <div class="notifications" id="notifications" hidden></div>

          <!-- Serve summary -->
          <div class="serve-summary">
            <div class="serve-stat">
              <div class="serve-stat-label">${state.mode === 'end' ? 'Serving at' : 'Starting at'}</div>
              <div class="serve-stat-value">${state.targetTime}</div>
            </div>
            <div class="serve-stat">
              <div class="serve-stat-label">Items</div>
              <div class="serve-stat-value">${state.items.length}</div>
            </div>
            <div class="serve-stat">
              <div class="serve-stat-label">First action</div>
              <div class="serve-stat-value">${events.length > 0 ? formatTime(events[0].time) : '--:--'}</div>
            </div>
          </div>

          <!-- Conflicts -->
          ${conflicts.length > 0 ? renderConflicts(conflicts) : ''}

          <!-- Timeline -->
          <div class="timeline-section">
            <h2>Timeline</h2>
            <div class="timeline" id="timeline">
              ${renderTimeline(events, items)}
            </div>
          </div>

          <!-- Appliance summary -->
          ${renderApplianceSummary(items)}

          <!-- Footer -->
          <div class="schedule-footer">
            <button class="btn btn-secondary btn-sm" id="btn-share">\ud83d\udccb Copy link</button>
            <button class="btn btn-secondary btn-sm" id="btn-new-cook">Start new cook</button>
            <button class="btn btn-ghost btn-sm" id="btn-export">\u2b07 Export JSON</button>
            <button class="btn btn-ghost btn-sm" id="btn-print">\ud83d\udda8 Print</button>
          </div>
        </div>
      </div>
    </div>
  `;

  bindScheduleEvents(items, events);
  startClock(events);
  // Re-paint any notifications that survived the re-render (e.g. after toggling
  // an override). The notification stack itself is module-private to clock.js.
  renderNotifications();
}

export function renderConflicts(conflicts) {
  return `
    <div class="conflicts-section">
      ${conflicts.map(c => `
        <div class="conflict-card">
          <strong>\u26a0\ufe0f Conflict</strong>
          <div class="conflict-detail">${escHtml(c.message)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

export function renderTimeline(events, items) {
  const nextDayOffset = getNextDayOffset();
  const nowM = nowMins() - nextDayOffset;

  // Group events by time
  const groups = [];
  for (const ev of events) {
    const last = groups[groups.length - 1];
    if (last && last.time === ev.time) last.events.push(ev);
    else groups.push({ time: ev.time, events: [ev] });
  }

  return groups.map(group => {
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

      // Override inputs (one per event in this cluster that canOverride)
      const overridable = evs.filter(e => e.canOverride && e.itemId);
      const overrideHtml = overridable.map(ev => {
        const item = items.find(i => i.id === ev.itemId);
        const override = item?.overrideCookStart || '';
        const namePrefix = evs.length > 1 ? `<span class="override-name">${escHtml(ev.itemName)}:</span> ` : '';
        return `
          <div class="tl-override">
            <label>${namePrefix}Override cook start:</label>
            <input type="time" class="override-input" data-id="${ev.itemId}" value="${override}">
            ${override ? `<button class="btn-clear-override" data-id="${ev.itemId}" title="Clear override">\u2715</button>` : ''}
          </div>
        `;
      }).join('');

      // Edit toggle: only present when at least one event in the cluster can be overridden
      const editBtn = overridable.length > 0
        ? `<button type="button" class="tl-edit" aria-label="Edit cook start" title="Edit cook start">\u270f\ufe0f Edit</button>`
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
          ${overrideHtml}
        </div>
      `;
    }).join('');

    return `
      <div class="${cls}">
        <div class="tl-time">${formatTime(group.time)}</div>
        <div class="tl-dot"><span></span></div>
        <div class="tl-content">${evRows}</div>
      </div>
    `;
  }).join('');
}

export function renderApplianceSummary(items) {
  const cfg = applianceConfig();
  const nextDayOffset = getNextDayOffset();
  const ovenItems  = items.filter(i => i._appliance === 'main');
  const combiItems = items.filter(i => i._appliance === 'combi' || i._appliance === 'combi-mw');
  const hobItems   = items.filter(i => i._appliance?.startsWith('hob'));

  // Current slot usage at nowMins
  const now = nowMins() - nextDayOffset;
  function usedSlots(arr) {
    return arr.filter(i => i._s.cookStart <= now && i._s.cookEnd > now)
              .reduce((s, i) => s + (i.shelfSlots || 1), 0);
  }

  const mainUsed  = usedSlots(ovenItems);
  const combiUsed = usedSlots(combiItems);

  function slotBar(used, total) {
    let html = `<div class="slot-bar" aria-label="${used} of ${total} slots used">`;
    for (let i = 0; i < total; i++) {
      html += `<div class="slot${i < used ? ' used' : ''}"></div>`;
    }
    return html + '</div>';
  }

  return `
    <div class="appliance-section">
      <h2>Appliances</h2>
      <div class="appliance-grid">
        <div class="appliance-card">
          <div class="app-name">Main Oven</div>
          <div class="app-capacity">${cfg.mainOvenShelves * 2} slots (${cfg.mainOvenShelves} shelf${cfg.mainOvenShelves > 1 ? ' \u00d7 2' : ''})</div>
          ${slotBar(mainUsed, cfg.mainOvenShelves * 2)}
          <div class="app-items">
            ${ovenItems.length === 0 ? '<span style="color:var(--text-3)">Nothing scheduled</span>' :
              ovenItems.map(i => `<span>${escHtml(i.name)}: ${formatTime(i._s.cookStart)}\u2013${formatTime(i._s.cookEnd)}</span>`).join('')}
          </div>
        </div>
        ${cfg.hasCombi ? `
        <div class="appliance-card">
          <div class="app-name">Combi</div>
          <div class="app-capacity">2 slots (1 shelf), oven or MW</div>
          ${slotBar(combiUsed, 2)}
          <div class="app-items">
            ${combiItems.length === 0 ? '<span style="color:var(--text-3)">Nothing scheduled</span>' :
              combiItems.map(i => `<span>${escHtml(i.name)} (${i._appliance === 'combi' ? 'oven' : 'MW'}): ${formatTime(i._s.cookStart)}\u2013${formatTime(i._s.cookEnd)}</span>`).join('')}
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
              hobItems.map(i => `<span>${escHtml(i.name)} (${applianceLabel(i._appliance, null)}): ${formatTime(i._s.cookStart)}\u2013${formatTime(i._s.cookEnd)}</span>`).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
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
      if (btn) { btn.textContent = '\u2705 Copied!'; setTimeout(() => { if (btn) btn.textContent = '\ud83d\udccb Copy link'; }, 2000); }
    } catch {
      // Clipboard blocked (e.g. insecure context) — surface the link to copy by hand.
      prompt('Copy this URL to share:', link);
    }
  });

  document.getElementById('btn-export')?.addEventListener('click', exportJSON);
  document.getElementById('btn-print')?.addEventListener('click', () => window.print());

  document.getElementById('wake-lock-btn')?.addEventListener('click', toggleWakeLock);

  // Edit / save toggle for override inputs (commits on save click)
  document.getElementById('timeline')?.addEventListener('click', e => {
    const editBtn = e.target.closest('.tl-edit');
    if (editBtn) {
      const subEvent = editBtn.closest('.tl-sub-event');
      if (!subEvent) return;
      const editing = subEvent.classList.toggle('editing');
      if (editing) {
        editBtn.innerHTML = '💾 Save';
        editBtn.setAttribute('aria-label', 'Save cook start');
        // Focus the first input so the user can pick a time straight away
        subEvent.querySelector('.override-input')?.focus();
      } else {
        // Commit any changed values then re-render the schedule
        let changed = false;
        subEvent.querySelectorAll('.override-input').forEach(inp => {
          const id = inp.dataset.id;
          const item = state.items.find(i => i.id === id);
          const newVal = inp.value || null;
          if (item && (item.overrideCookStart || null) !== newVal) {
            item.overrideCookStart = newVal;
            saveItem(item);
            changed = true;
          }
        });
        if (changed) renderScheduleView();
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
