const frame = document.querySelector('.reader-frame');
const input = document.getElementById('custom-text');

// The reader listens for clicks on the whole document; keep clicks on the
// demo's own controls from also stepping the reader.
for (const el of document.querySelectorAll('.field, .demo-row')) {
  el.addEventListener('click', (e) => e.stopPropagation());
}

document.getElementById('btn-load').addEventListener('click', () => {
  const text = input.value.trim();
  if (!text) return;
  // The reader reads its text once on connect, so swap in a new element.
  const reader = document.createElement('text-reader');
  reader.id = 'reader';
  reader.textContent = text;
  frame.replaceChildren(reader);
});
