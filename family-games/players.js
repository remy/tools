import { state, playerById } from './state.js';
import { db } from './db.js';
import { render } from './render.js';
import {
  $, avatarEl, iconBtn, initials, autoAvatar, plural,
  AVATAR_EMOJI, AVATAR_COLOURS, EDIT_PATHS, DELETE_PATHS,
} from './ui.js';

async function reloadPlayers() {
  state.players = await db.getPlayers();
}

// ── Players list in Settings ──
export function renderPlayers() {
  const ul = $('players-list');
  ul.replaceChildren();
  if (!state.players.length) {
    const li = document.createElement('li');
    li.className = 'muted-row';
    li.textContent = 'No players yet. Add everyone who plays and they’ll be ready to rank.';
    ul.appendChild(li);
    return;
  }

  for (const player of state.players) {
    const li = document.createElement('li');
    li.className = 'pick-row';
    if (player.archived) li.classList.add('archived');

    const info = document.createElement('div');
    info.className = 'player-info';
    const name = document.createElement('span');
    name.className = 'player-name';
    name.textContent = player.name;
    info.append(avatarEl(player), name);

    if (player.archived) {
      const tag = document.createElement('span');
      tag.className = 'player-tag';
      tag.textContent = 'hidden';
      info.appendChild(tag);
    }

    li.appendChild(info);

    if (player.archived) {
      const restore = document.createElement('button');
      restore.type = 'button';
      restore.className = 'btn btn-ghost btn-sm';
      restore.dataset.action = 'restore-player';
      restore.dataset.id = player.id;
      restore.textContent = 'Restore';
      li.appendChild(restore);
    } else {
      const edit = iconBtn('edit-player', `Edit ${player.name}`, EDIT_PATHS);
      edit.dataset.id = player.id;
      li.appendChild(edit);
    }

    const del = iconBtn('delete-player', `Remove ${player.name}`, DELETE_PATHS, 'icon-danger');
    del.dataset.id = player.id;
    li.appendChild(del);

    ul.appendChild(li);
  }
}

// ── Player editor dialog ──
// The draft is held here rather than read back off the inputs so the live
// preview, the emoji quick-picks and the swatches all agree on one source.
let draft = null;

export function openPlayerEditor(id) {
  const player = id ? playerById(id) : null;
  const fallback = autoAvatar(state.players.length);
  draft = player
    ? { ...player }
    : {
      id: crypto.randomUUID(),
      name: '',
      emoji: fallback.emoji,
      colour: fallback.colour,
      archived: false,
      order: state.players.length,
      createdAt: Date.now(),
    };

  $('player-title').textContent = player ? 'Edit player' : 'New player';
  $('player-edit-id').value = draft.id;
  $('player-name').value = draft.name;
  $('player-emoji').value = draft.emoji;
  renderEmojiPicks();
  renderColourPicks();
  updatePreview();
  $('player-dialog').showModal();
  setTimeout(() => $('player-name').focus(), 50);
}

function updatePreview() {
  const avatar = $('player-preview-avatar');
  avatar.style.setProperty('--avatar-colour', draft.colour);
  avatar.classList.toggle('avatar-initials', !draft.emoji);
  avatar.textContent = draft.emoji || initials(draft.name);
  $('player-preview-name').textContent = draft.name.trim() || 'New player';
  for (const btn of $('colour-picks').children) {
    btn.setAttribute('aria-pressed', String(btn.dataset.colour === draft.colour));
  }
  for (const btn of $('emoji-picks').children) {
    btn.setAttribute('aria-pressed', String(btn.dataset.emoji === draft.emoji));
  }
}

function renderEmojiPicks() {
  const wrap = $('emoji-picks');
  wrap.replaceChildren();
  for (const emoji of AVATAR_EMOJI) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'emoji-pick';
    btn.dataset.emoji = emoji;
    btn.textContent = emoji;
    btn.setAttribute('aria-label', `Use ${emoji}`);
    btn.addEventListener('click', () => {
      // Tapping the current emoji clears it, falling back to initials.
      draft.emoji = draft.emoji === emoji ? '' : emoji;
      $('player-emoji').value = draft.emoji;
      updatePreview();
    });
    wrap.appendChild(btn);
  }
}

function renderColourPicks() {
  const wrap = $('colour-picks');
  wrap.replaceChildren();
  for (const colour of AVATAR_COLOURS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'swatch';
    btn.dataset.colour = colour;
    btn.style.setProperty('--swatch', colour);
    btn.setAttribute('aria-label', `Colour ${colour}`);
    btn.addEventListener('click', () => {
      draft.colour = colour;
      updatePreview();
    });
    wrap.appendChild(btn);
  }
}

export function onPlayerFieldInput() {
  if (!draft) return;
  draft.name = $('player-name').value;
  // Only the first character counts — an emoji can be several code units, so
  // the spread is what splits it correctly.
  draft.emoji = [...$('player-emoji').value.trim()][0] || '';
  updatePreview();
}

export async function savePlayer() {
  if (!draft) return;
  const name = $('player-name').value.trim();
  if (!name) { $('player-name').focus(); return; }
  await db.putPlayer({ ...draft, name, emoji: draft.emoji });
  await reloadPlayers();
  $('player-dialog').close();
  renderPlayers();
  render();
}

// Add a player from the record dialog without leaving it: name only, with a
// distinct emoji and colour chosen for them. They can be polished later in
// Settings.
export async function quickAddPlayer(name) {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const id = crypto.randomUUID();
  const look = autoAvatar(state.players.length);
  await db.putPlayer({
    id,
    name: trimmed,
    emoji: look.emoji,
    colour: look.colour,
    archived: false,
    order: state.players.length,
    createdAt: Date.now(),
  });
  await reloadPlayers();
  return id;
}

// Removing someone who has already played would tear holes in the history, so
// they're archived instead: results keep their name, but they drop out of the
// picker. Players with no results are deleted outright.
export async function removePlayer(id) {
  const player = playerById(id);
  if (!player) return;
  const plays = state.sessions.reduce(
    (n, s) => n + (s.results.some((r) => r.playerId === id) ? 1 : 0),
    0,
  );

  if (plays) {
    const ok = confirm(
      `${player.name} has ${plural(plays, 'result')} recorded.\n\n`
      + 'Hiding keeps that history intact and just leaves them out of new games. Hide them?',
    );
    if (!ok) return;
    await db.putPlayer({ ...player, archived: true });
  } else {
    if (!confirm(`Remove ${player.name}?`)) return;
    await db.deletePlayer(id);
  }
  await reloadPlayers();
  renderPlayers();
  render();
}

export async function restorePlayer(id) {
  const player = playerById(id);
  if (!player) return;
  await db.putPlayer({ ...player, archived: false });
  await reloadPlayers();
  renderPlayers();
  render();
}
