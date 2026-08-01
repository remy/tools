"use strict";

/* ==========================================================================
   E. input -- work out which kind of board was dropped
   ========================================================================== */

function showError(msg, ex) {
  if (ex) console.error(ex);
  errBox.textContent = msg;
  if (BE) { hud.className = 'empty'; hud.textContent = msg.split('\n')[0]; }
  else drop.classList.remove('hide');
}

/** A .kicad_pcb anywhere in the drop wins: it states its own connectivity, so
    it is strictly better than recovering nets from Gerber pixels. */
function detect(entries) {
  const kicad = entries.find(e => /\.kicad_pcb$/i.test(e.name) ||
                                  /^\s*\(kicad_pcb/.test(e.text.slice(0, 200)));
  if (kicad) {
    if (entries.some(e => classify(e.name, e.text)))
      warn('the drop also had Gerbers in it; used the .kicad_pcb, which carries real net names');
    return {kind: 'kicad', entry: kicad};
  }
  return {kind: 'gerber'};
}

/** `files` are Files whether they came off the disk or off the network, so
    there is one parse path. `urls` is what to leave in the address bar: the
    URLs a remote board came from, or nothing at all for a local one. */
async function openFiles(files, urls) {
  warnings.length = 0;
  errBox.textContent = '';
  busy.textContent = 'Reading board…';
  document.body.classList.add('busy');
  await new Promise(r => setTimeout(r, 16));        // let the spinner paint
  try {
    const entries = [];
    for (const file of files) {
      const buf = await file.arrayBuffer();
      if (/\.zip$/i.test(file.name) || looksLikeZip(buf))
        entries.push(...await readZip(buf));
      else entries.push({name: file.name, text: new TextDecoder().decode(buf)});
    }
    if (!entries.length) throw new Error('nothing readable in that drop');

    const what = detect(entries);
    if (what.kind === 'kicad') {
      const name = what.entry.name.replace(/\.kicad_pcb$/i, '');
      activate(kicadBackend(what.entry.text, name), name);
    } else {
      const zip = files.find(f => /\.zip$/i.test(f.name));
      const name = zip ? zip.name.replace(/\.zip$/i, '')
                       : (files.length === 1 ? files[0].name : files.length + ' Gerber files');
      activate(gerberBackend(entries), name);
    }
    rememberUrls(urls);
  } catch (ex) {
    showError(ex.message, ex);
  } finally {
    document.body.classList.remove('busy');
  }
}

/** Same, but the files are fetched first. */
async function openUrls(urls) {
  errBox.textContent = '';
  busy.textContent = urls.length > 1 ? 'Downloading ' + urls.length + ' files…'
                                     : 'Downloading board…';
  document.body.classList.add('busy');
  let files;
  try {
    files = await Promise.all(urls.map(fetchBoard));
  } catch (ex) {
    document.body.classList.remove('busy');
    showError(ex.message, ex);
    return;
  }
  await openFiles(files, urls);
}

const busy = $('busy');
const fileInput = $('file');
// iOS greys out anything whose extension it has no registered type for, and
// .kicad_pcb has none, so on a touch device filter nothing.
if (matchMedia('(hover:none)').matches) fileInput.removeAttribute('accept');
for (const el of [$('pick'), $('load')]) el.onclick = () => fileInput.click();
fileInput.onchange = () => {
  if (fileInput.files.length) openFiles([...fileInput.files]);
  fileInput.value = '';
};

let dragDepth = 0;
addEventListener('dragenter', e => {
  e.preventDefault();
  if (++dragDepth === 1) document.body.classList.add('dragging');
});
addEventListener('dragover', e => e.preventDefault());
addEventListener('dragleave', e => {
  e.preventDefault();
  if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); }
});
addEventListener('drop', e => {
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('dragging');
  const files = e.dataTransfer.files ? [...e.dataTransfer.files] : [];
  if (files.length) openFiles(files);
  else showError('That drop had no files in it.');
});

/* ---- loading over the network ---- */

// Several URLs at once is how a loose Gerber set arrives, matching a multi-file
// drop; whitespace and commas both separate them.
$('url-form').onsubmit = e => {
  e.preventDefault();
  const urls = $('url').value.split(/[\s,]+/).filter(Boolean);
  if (urls.length) openUrls(urls);
};

// A board named on the query string opens straight away, so a link to a board
// is a link to it already traced.
{
  const urls = boardUrlsFromQuery();
  if (urls.length) {
    $('url').value = urls.join(' ');
    drop.classList.add('hide');       // don't flash the drop screen first
    openUrls(urls);
  }
}
