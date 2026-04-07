// =============================================
// Cook Planner — clock.js
// =============================================

import { escHtml, formatCountdown, nowMins } from './utils.js';

// Module-private state
let clockInterval = null;
let chimesFired = new Set();
let nextDayOffset = 0;  // 1440 if the schedule is for the next calendar day

export function getNextDayOffset() {
  return nextDayOffset;
}

export function setNextDayOffset(val) {
  nextDayOffset = val;
}

function chimeKey(ev) {
  return `${ev.time}:${ev.type}:${ev.itemId || ''}`;
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
  initChimes(events);
  updateClock(events);
  clockInterval = setInterval(() => updateClock(events), 1000);
}

export function stopClock() {
  if (clockInterval) { clearInterval(clockInterval); clockInterval = null; }
}

function updateClock(events) {
  const clockTimeEl = document.getElementById('clock-time');
  const clockDateEl = document.getElementById('clock-date');
  const clockNextEl = document.getElementById('clock-next');
  if (!clockTimeEl) { stopClock(); return; }

  const now = new Date();
  const nowS = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const nowM = Math.floor(nowS / 60) - nextDayOffset;  // adjusted for next-day schedules

  // Fire chimes for events whose time has just been reached
  for (const ev of events) {
    if (ev.time === nowM) {
      const key = chimeKey(ev);
      if (!chimesFired.has(key)) {
        chimesFired.add(key);
        playChime(ev.type);
      }
    }
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
      <div class="clock-next-label">Next:</div>
      <div class="clock-next-event">${escHtml(next.label)}</div>
      <div class="clock-next-countdown">${diffS > 0 ? formatCountdown(diffS) : 'NOW'}</div>
    `;
  } else if (events.some(ev => ev.type === 'serve' && ev.time <= nowM)) {
    clockNextEl.innerHTML = `<div class="clock-next-event" style="font-size:1.25rem">\ud83c\udf7d Enjoy your meal!</div>`;
  } else {
    clockNextEl.innerHTML = '';
  }

  // Update past/active classes on grouped timeline rows
  // Each row may contain .tl-tracker elements that map back to original events
  const tlRows = document.querySelectorAll('.tl-event');
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

  // Update appliance slots (re-render just slot bars would need full re-render; skip for perf)
}
