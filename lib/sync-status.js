// Human-readable rendering of a PouchStore sync status.
//
// Lives outside the <sync-settings> component because tools need the same text
// in a second place: the badge on the header settings cog, which has to show a
// failing sync without the settings dialog being open.

// PouchDB errors are inconsistent about where the useful detail lives, so try
// message, then reason, then name, and append the HTTP status when present.
export function errorText(err) {
  const detail = err?.message || err?.reason || err?.name || 'Unknown error';
  const status = err?.status ? ` (HTTP ${err.status})` : '';
  return `Sync error: ${detail}${status}`;
}

export function statusText(s) {
  if (!s || s.state === 'disabled') return 'Sync disabled.';
  if (s.state === 'syncing') return 'Syncing…';
  if (s.state === 'error') return errorText(s.lastError);
  const last = s.lastSyncedAt
    ? ` · last synced ${new Date(s.lastSyncedAt).toLocaleTimeString()}`
    : '';
  return `Idle${last}`;
}
