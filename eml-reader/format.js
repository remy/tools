/* Small presentation helpers shared across the reader's panes. */

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function safeFilename(name, fallback) {
  const cleaned = String(name || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
  return cleaned || fallback;
}

export function download(filename, data, type) {
  const blob = data instanceof Blob
    ? data
    : new Blob([data], { type: type || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function copyToClipboard(text, button) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    return;
  }
  if (!button) return;
  const original = button.textContent;
  button.textContent = 'Copied';
  button.classList.add('is-done');
  setTimeout(() => {
    button.textContent = original;
    button.classList.remove('is-done');
  }, 1400);
}

const URL_RE = /\b(https?:\/\/[^\s<>"')]+|www\.[^\s<>"')]+)/g;

/* Renders plain text with its links clickable, built as DOM nodes rather than
 * markup so nothing in the message can be injected. */
export function renderLinkedText(target, text) {
  target.textContent = '';
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    if (match.index > last) {
      target.appendChild(document.createTextNode(text.slice(last, match.index)));
    }
    const anchor = document.createElement('a');
    anchor.href = match[0].startsWith('www.') ? `https://${match[0]}` : match[0];
    anchor.textContent = match[0];
    anchor.target = '_blank';
    anchor.rel = 'noreferrer noopener';
    target.appendChild(anchor);
    last = match.index + match[0].length;
  }
  target.appendChild(document.createTextNode(text.slice(last)));
}
