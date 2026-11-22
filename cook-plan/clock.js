// =============================================
// Cook Planner — clock.js
// =============================================

import { escHtml, formatCountdown, formatTime, nowMins } from './utils.js';
import { now as clockNow } from './sim-clock.js';

// Module-private state
let clockInterval = null;
let chimesFired = new Set();
// The events the running clock is ticking against, kept so the simulated clock
// can resync without the caller having to hand them back.
let currentEvents = [];
let nextDayOffset = 0;  // 1440 if the schedule is for the next calendar day
// Which timeline stop is the current one, so a change of stage can be brought
// into view. Null means "not looked yet" rather than "nothing is active".
let lastStageKey = null;
// The minute the clock was last resynced to, so that two changes landing on the
// same minute don't sound its chime twice.
let lastSyncMinute = null;

// In-memory notification stack — never persisted. When a chime fires we push
// the event so the user can see what triggered the sound when they tab back in.
let notifications = [];
const MAX_NOTIFICATIONS = 20;

// How many of a moment's other events to name before giving up and counting.
const NOTIFICATION_DETAIL = 3;

// One notification per moment, led by its most significant event. The rest are
// folded into the sub-line: fifteen separate cards for "serve" would bury
// everything earlier in the stack under a single instant.
function addNotification(lead, all) {
  const id = chimeKey(lead);
  if (notifications.some(n => n.id === id)) return;

  const others = all.filter(ev => ev !== lead).map(ev => ev.label);
  const extra = others.length > NOTIFICATION_DETAIL
    ? [...others.slice(0, NOTIFICATION_DETAIL), `+${others.length - NOTIFICATION_DETAIL} more`]
    : others;

  notifications.unshift({
    id,
    label: lead.label,
    sub: [lead.sub, ...extra].filter(Boolean).join(' \u00b7 ') || null,
    type: lead.type,
    time: lead.time,
  });
  if (notifications.length > MAX_NOTIFICATIONS) {
    notifications = notifications.slice(0, MAX_NOTIFICATIONS);
  }
}

export function dismissNotification(id) {
  notifications = notifications.filter(n => n.id !== id);
  renderNotifications();
}

export function clearNotifications() {
  notifications = [];
  renderNotifications();
}

export function renderNotifications() {
  const el = document.getElementById('notifications');
  if (!el) return;
  if (notifications.length === 0) {
    el.innerHTML = '';
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.innerHTML = notifications.map(n => `
    <div class="notification notification-${n.type}">
      <div class="notification-time">${formatTime(n.time)}</div>
      <div class="notification-content">
        <div class="notification-label">${escHtml(n.label)}</div>
        ${n.sub ? `<div class="notification-sub">${escHtml(n.sub)}</div>` : ''}
      </div>
      <button class="notification-dismiss" data-id="${escHtml(n.id)}"
        aria-label="Dismiss" title="Dismiss (shift-click to dismiss all)">✕</button>
    </div>
  `).join('');
}

export function getNextDayOffset() {
  return nextDayOffset;
}

export function setNextDayOffset(val) {
  nextDayOffset = val;
}

// Whether the plan belongs to tomorrow rather than today: if every event is
// more than an hour in the past, the cook must be the next day's. It lives
// here rather than in computeSchedule because the simulated clock can change
// the answer without the schedule itself changing at all -- scrubbing back to
// lunchtime makes a plan that was "tomorrow's" today's again.
export function syncDayOffset(events) {
  const last = events.reduce((m, ev) => Math.max(m, ev.endTime ?? ev.time), 0);
  nextDayOffset = nowMins() > last + 60 ? 1440 : 0;
}

function chimeKey(ev) {
  return `${ev.time}:${ev.type}:${ev.itemId || ''}`;
}

// Which event speaks for a moment, most significant first. The end of a cook
// is a dozen events on one minute -- every dish ready, several out of the oven,
// and serve -- and they are one moment, not a dozen. Only the leader is
// sounded, so SERVE wins over the things that merely finished with it.
const CHIME_PRIORITY = ['serve', 'cook_end', 'cook_start', 'prep', 'set', 'ready'];

function leadEvent(evs) {
  for (const type of CHIME_PRIORITY) {
    const match = evs.find(ev => ev.type === type);
    if (match) return match;
  }
  return evs[0];
}

// Pre-seed so past events (and events right now on first load) don't trigger
export function initChimes(events) {
  const nowM = nowMins() - nextDayOffset;
  chimesFired = new Set(events.filter(ev => ev.time <= nowM).map(chimeKey));
}

function playChime(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Bell: fundamental + a detuned partial for richness, quick attack, slow decay
    const freqMap = {
      prep:       392.00,  // G4 -- gentle reminder
      cook_start: 523.25,  // C5 -- things going in
      cook_end:   783.99,  // G5 -- higher/urgent: things coming out
      set:        440.00,  // A4 -- soft
      serve:      987.77,  // B5 -- bright fanfare note
    };
    const freq  = freqMap[type] ?? 523.25;
    const decay = type === 'serve' ? 2.5 : 1.8;

    const osc1  = ctx.createOscillator();
    const osc2  = ctx.createOscillator();  // bell overtone at ~2.76x fundamental
    const gain  = ctx.createGain();

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.value = freq;
    osc2.frequency.value = freq * 2.756;  // characteristic inharmonic bell partial

    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + decay);

    osc1.start(ctx.currentTime);
    osc2.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + decay);
    osc2.stop(ctx.currentTime + decay);

    // For serve, add a quick second note a fifth up
    if (type === 'serve') {
      const osc3 = ctx.createOscillator();
      const g3   = ctx.createGain();
      osc3.connect(g3);
      g3.connect(ctx.destination);
      osc3.type = 'sine';
      osc3.frequency.value = freq * 1.5;
      g3.gain.setValueAtTime(0, ctx.currentTime + 0.18);
      g3.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.19);
      g3.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.19 + decay);
      osc3.start(ctx.currentTime + 0.18);
      osc3.stop(ctx.currentTime + 0.18 + decay);
      osc3.onended = () => ctx.close();
    } else {
      osc1.onended = () => ctx.close();
    }
  } catch (_) {
    // AudioContext unavailable (e.g. test environments) -- fail silently
  }
}

export function startClock(events) {
  currentEvents = events;
  syncDayOffset(events);
  initChimes(events);
  lastStageKey = null;
  lastSyncMinute = null;
  updateClock(events);
  clockInterval = setInterval(() => updateClock(events), 1000);
}

export function stopClock() {
  if (clockInterval) { clearInterval(clockInterval); clockInterval = null; }
}

// The simulated clock has moved. Everything before the new now counts as done
// -- otherwise scrubbing back and forth would replay every chime on the way --
// but *strictly* before, so that landing on a moment still sounds it. Stepping
// a minute at a time through a cook to hear what it does is the whole point.
//
// Landing on the same minute twice does not, though: one gesture can set the
// time and then pause it, and two bells for one landing is the complaint this
// app has already had once.
export function resyncClock() {
  syncDayOffset(currentEvents);
  const nowM = nowMins() - nextDayOffset;
  const cutoff = nowM === lastSyncMinute ? nowM + 1 : nowM;
  lastSyncMinute = nowM;
  chimesFired = new Set(currentEvents.filter(ev => ev.time < cutoff).map(chimeKey));
  lastStageKey = null;
  if (document.getElementById('clock-time')) updateClock(currentEvents);
}

function updateClock(events) {
  const clockTimeEl = document.getElementById('clock-time');
  const clockDateEl = document.getElementById('clock-date');
  const clockNextEl = document.getElementById('clock-next');
  if (!clockTimeEl) { stopClock(); return; }

  const now = clockNow();
  const nowS = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const nowM = Math.floor(nowS / 60) - nextDayOffset;  // adjusted for next-day schedules

  // Fire a chime for events whose time has just been reached. Every one of them
  // is marked as fired, but they share a single bell: a bell per event meant a
  // dozen overlapping two-second tones at the end of a cook, each in its own
  // AudioContext and so each starting a few milliseconds apart -- which came
  // out as a ragged run of bongs rather than one chime.
  const due = [];
  for (const ev of events) {
    if (ev.time !== nowM) continue;
    const key = chimeKey(ev);
    if (chimesFired.has(key)) continue;
    chimesFired.add(key);
    due.push(ev);
  }
  if (due.length > 0) {
    const lead = leadEvent(due);
    playChime(lead.type);
    addNotification(lead, due);
    renderNotifications();
  }

  clockTimeEl.textContent = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  clockDateEl.textContent = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  // Find next event
  const upcoming = events.filter(ev => ev.time > nowM && ev.type !== 'ready');
  if (upcoming.length > 0) {
    const next = upcoming[0];
    const nextS = next.time * 60 + nextDayOffset * 60;  // account for next-day offset
    const diffS = nextS - nowS;
    clockNextEl.innerHTML = `
      <div class="clock-next-label">Next in</div>
      <div class="clock-next-countdown">${diffS > 0 ? formatCountdown(diffS) : 'NOW'}</div>
      <div class="clock-next-event">${escHtml(next.label)}</div>
    `;
  } else if (events.some(ev => ev.type === 'serve' && ev.time <= nowM)) {
    clockNextEl.innerHTML = `<div class="clock-next-event clock-next-event-large">\ud83c\udf7d Enjoy your meal!</div>`;
  } else {
    clockNextEl.innerHTML = '';
  }

  // Update past/active classes on grouped timeline rows
  // Each row may contain .tl-tracker elements that map back to original events
  const tlRows = [...document.querySelectorAll('.tl-event')];
  tlRows.forEach(row => {
    const trackers = row.querySelectorAll('.tl-tracker');
    const rowEvents = [...trackers].map(el =>
      events.find(ev => ev.type === el.dataset.type && (ev.itemId || '') === (el.dataset.item || ''))
    ).filter(Boolean);
    if (rowEvents.length === 0) return;
    const isPast   = rowEvents.every(ev => ev.endTime < nowM);
    const isActive = rowEvents.some(ev => ev.time <= nowM && ev.endTime >= nowM && ev.type !== 'serve');
    row.classList.toggle('tl-past',   isPast);
    row.classList.toggle('tl-active', isActive && !isPast);
  });

  markCurrentStage(tlRows, nowM);

  // Update appliance slots (re-render just slot bars would need full re-render; skip for perf)
}

// Which stop the cook has got to.
//
// "In progress" is no help on its own: a turkey is in progress for two hours,
// and so is everything that went in after it, which is how you end up with
// half the timeline lit at once. The stage you are *up to* is the last
// instruction whose time has come — that one gets the band, the one after it
// gets a quieter outline, and the rest are history or still to come. Before
// anything has started the first stop is both.
function markCurrentStage(rows, nowM) {
  let current = null;
  let next = null;
  for (const row of rows) {
    const time = Number(row.dataset.time);
    if (!Number.isFinite(time)) continue;
    if (time <= nowM) current = row;
    else if (!next) next = row;
  }
  if (!current) current = next;

  for (const row of rows) {
    row.classList.toggle('tl-current', row === current);
    row.classList.toggle('tl-next', row === next && row !== current);
  }

  revealStage(current);
}

// The timeline is long and the cook is somewhere in the middle of it, so the
// current stage is scrolled to rather than waited for. Only a *change* of stage
// moves the page — otherwise every tick would drag the view back and there
// would be no reading ahead.
function revealStage(row) {
  const key = row?.dataset.time ?? null;
  if (key === lastStageKey) return;
  const firstLook = lastStageKey === null;
  lastStageKey = key;
  if (!row) return;
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  row.scrollIntoView({
    block: 'center',
    behavior: (firstLook || still) ? 'auto' : 'smooth',
  });
}
