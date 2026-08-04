// Small shared building blocks used by every view: DOM helpers, the player
// avatar, and the date / position formatting the app leans on constantly.

export const $ = (id) => document.getElementById(id);

export function svg(paths, size = 18) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('width', size);
  s.setAttribute('height', size);
  s.setAttribute('viewBox', '0 0 18 18');
  s.setAttribute('fill', 'none');
  s.innerHTML = paths;
  return s;
}

export const EDIT_PATHS = '<path d="M11.5 3.5L14.5 6.5M3 15H6L13.5 7.5L10.5 4.5L3 12V15Z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>';
export const DELETE_PATHS = '<path d="M4 5H14M7 5V3.5H11V5M6 5V14H12V5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>';

export function iconBtn(action, label, paths, extraClass = '') {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `icon-btn${extraClass ? ' ' + extraClass : ''}`;
  btn.dataset.action = action;
  btn.setAttribute('aria-label', label);
  btn.appendChild(svg(paths, 16));
  return btn;
}

// ── Player identity ──
// An avatar is an emoji when one is set, otherwise the player's initials, on a
// coloured disc. Emoji and colours both sync as plain strings, so nothing here
// needs image attachments or network access.
export const AVATAR_EMOJI = [
  '🦊', '🐼', '🐙', '🦁', '🐸', '🐳', '🦄', '🐝',
  '🐰', '🐨', '🦉', '🐢', '🎮', '🎲', '⭐', '🚀',
];

export const AVATAR_COLOURS = [
  '#6c5ce7', '#0984e3', '#00b894', '#fdcb6e',
  '#e17055', '#e84393', '#00cec9', '#636e72',
];

// Deterministic pick so a quick-added player still gets a distinct look
// without anyone choosing one.
export function autoAvatar(index) {
  return {
    emoji: AVATAR_EMOJI[index % AVATAR_EMOJI.length],
    colour: AVATAR_COLOURS[index % AVATAR_COLOURS.length],
  };
}

export function initials(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return words.slice(0, 2).map((w) => [...w][0].toUpperCase()).join('');
}

export function avatarEl(player, extraClass = '') {
  const span = document.createElement('span');
  span.className = `avatar${extraClass ? ' ' + extraClass : ''}`;
  span.style.setProperty('--avatar-colour', player?.colour || AVATAR_COLOURS[0]);
  // A photo wins over the emoji, which wins over initials.
  if (player?.photo) {
    span.classList.add('avatar-photo');
    span.style.backgroundImage = `url("${player.photo}")`;
  } else if (player?.emoji) {
    span.textContent = player.emoji;
  } else {
    span.classList.add('avatar-initials');
    span.textContent = initials(player?.name);
  }
  span.setAttribute('aria-hidden', 'true');
  return span;
}

export function playerName(player) {
  return player ? player.name : 'Removed player';
}

// ── Dates ──
// Dates are stored as local YYYY-MM-DD strings, so they're split by hand
// rather than fed to Date.parse (which reads a bare date as UTC and can slide
// the day by one either side of midnight).
export function parseDate(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fmtDate(iso) {
  const d = parseDate(iso);
  if (!d) return '';
  return d.toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

// "today" / "yesterday" / "5 days ago" — or '' for anything further out, so
// callers that already show the full date don't print it twice.
export function recentDay(iso) {
  const d = parseDate(iso);
  if (!d) return '';
  const today = parseDate(todayISO());
  const days = Math.round((today - d) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days === -1) return 'tomorrow';
  if (days > 1 && days < 7) return `${days} days ago`;
  return '';
}

// The same, falling back to an absolute date where there's no other date on
// show — used for the "last played …" line on the landing page.
export function relativeDay(iso) {
  const recent = recentDay(iso);
  if (recent) return recent;
  const d = parseDate(iso);
  if (!d) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function ordinal(n) {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th';
  return `${n}${suffix}`;
}

export function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
