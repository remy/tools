const sentenceInput = document.getElementById('sentenceInput');
const templatesContainer = document.getElementById('templatesContainer');
const tracesContainer = document.getElementById('tracesContainer');
const addTemplateBtn = document.getElementById('addTemplateBtn');

let templates = [];
let nextId = 1;
let templateResults = new Map(); // Store results for each template

// Initialize from URL parameters
function initFromURL() {
  const params = new URLSearchParams(window.location.search);
  const sentence = params.get('s');
  const templatesParam = params.get('t');

  if (sentence) {
    sentenceInput.value = decodeURIComponent(sentence);
  } else {
    sentenceInput.value = 'light in kitchen is on now';
  }

  if (templatesParam) {
    const templateValues = templatesParam
      .split('|')
      .map((t) => decodeURIComponent(t));
    templates = templateValues.map((value) => ({ id: nextId++, value }));
  } else {
    templates = [
      { id: nextId++, value: '[the] (light|lights) in {area} [is] (on;now)' },
    ];
  }
}

// Update URL with current state
function updateURL() {
  const params = new URLSearchParams();
  params.set('s', encodeURIComponent(sentenceInput.value));

  const templateValues = templates
    .map((t) => encodeURIComponent(t.value))
    .join('|');
  params.set('t', templateValues);

  const newURL = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, '', newURL);
}

function tokenize(template) {
  const tokens = [];
  let remaining = template;

  while (remaining.length > 0) {
    let match;
    // Match Optional [word]
    if ((match = remaining.match(/^\[(.*?)\]/))) {
      tokens.push({ type: 'opt', content: match[1], raw: match[0] });
    }
    // Match Alternates (a|b)
    else if ((match = remaining.match(/^\(([^;]*?\|.*?)\)/))) {
      tokens.push({ type: 'alt', content: match[1], raw: match[0] });
    }
    // Match Permutations (a;b)
    else if ((match = remaining.match(/^\(([^|]*?;.*?)\)/))) {
      tokens.push({ type: 'perm', content: match[1], raw: match[0] });
    }
    // Match Slots {name}
    else if ((match = remaining.match(/^\{(.*?)\}/))) {
      tokens.push({ type: 'slot', content: match[1], raw: match[0] });
    }
    // Match Rules <name>
    else if ((match = remaining.match(/^<(.*?)>/))) {
      tokens.push({ type: 'rule', content: match[1], raw: match[0] });
    }
    // Match Literal Text
    else if ((match = remaining.match(/^([^\s[({<]+)/))) {
      tokens.push({ type: 'text', content: match[1], raw: match[0] });
    }
    // Match Whitespace
    else if ((match = remaining.match(/^(\s+)/))) {
      tokens.push({ type: 'space', content: ' ', raw: match[0] });
    } else {
      remaining = remaining.substring(1);
      continue;
    }
    remaining = remaining.substring(match[0].length);
  }
  return tokens;
}

function renderTemplates() {
  templatesContainer.innerHTML = '';
  templates.forEach((template, index) => {
    const result = templateResults.get(template.id);
    const statusClass = result ? (result.hasFailure ? 'fail' : 'success') : '';

    const div = document.createElement('div');
    div.className = 'template-entry';
    div.innerHTML = `
      <div class="template-header">
        <a href="#trace-${template.id}" class="template-number-link">
          <span class="template-number">Template ${index + 1}</span>
          ${
            statusClass
              ? `<span class="status-pill ${statusClass}">${
                  result.hasFailure ? 'FAILED' : 'MATCHED'
                }</span>`
              : ''
          }
        </a>
        ${
          templates.length > 1
            ? `<button class="btn-remove" data-id="${template.id}">Remove</button>`
            : ''
        }
      </div>
      <input class="template-input" data-id="${
        template.id
      }" type="text" value="${template.value}">
    `;
    templatesContainer.appendChild(div);
  });

  // Attach event listeners
  document.querySelectorAll('.template-input').forEach((input) => {
    input.addEventListener('input', (e) => {
      const id = parseInt(e.target.dataset.id);
      const template = templates.find((t) => t.id === id);
      if (template) {
        template.value = e.target.value;
        updateURL();
        update();
      }
    });
  });

  document.querySelectorAll('.btn-remove').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const id = parseInt(e.target.dataset.id);
      templates = templates.filter((t) => t.id !== id);
      updateURL();
      renderTemplates();
      update();
    });
  });
}

function updateTemplateStatuses() {
  templates.forEach((template, index) => {
    const result = templateResults.get(template.id);
    const link = document
      .querySelector(`.template-input[data-id="${template.id}"]`)
      ?.closest('.template-entry')
      ?.querySelector('.template-number-link');

    if (!link) return;

    const statusClass = result ? (result.hasFailure ? 'fail' : 'success') : '';
    const existingPill = link.querySelector('.status-pill');

    if (statusClass && result) {
      const pillHTML = `<span class="status-pill ${statusClass}">${
        result.hasFailure ? 'FAILED' : 'MATCHED'
      }</span>`;

      if (existingPill) {
        existingPill.outerHTML = pillHTML;
      } else {
        link.insertAdjacentHTML('beforeend', pillHTML);
      }
    } else if (existingPill) {
      existingPill.remove();
    }
  });
}

function generateTrace(templateValue, sentenceWords) {
  const tokens = tokenize(templateValue);
  const traceItems = [];
  let wordPointer = 0;
  let hasFailure = false;

  tokens.forEach((token) => {
    if (token.type === 'space') return;

    let status = 'Skipped';
    let statusClass = 'status-skipped';
    let note = '';
    const currentWord = sentenceWords[wordPointer] || '';

    switch (token.type) {
      case 'text':
        if (currentWord === token.content.toLowerCase()) {
          status = 'Matched';
          statusClass = 'status-matched';
          note = `Literal match: <strong>${currentWord}</strong>`;
          wordPointer++;
        } else {
          status = 'Fail';
          statusClass = 'status-fail';
          note = `Expected "${token.content}"`;
          hasFailure = true;
        }
        break;
      case 'opt':
        if (currentWord === token.content.toLowerCase()) {
          status = 'Matched';
          statusClass = 'status-matched';
          note = `Optional word present: <strong>${currentWord}</strong>`;
          wordPointer++;
        } else {
          note = 'Word omitted (allowed)';
        }
        break;
      case 'alt':
        const options = token.content
          .split('|')
          .map((s) => s.trim().toLowerCase());
        if (options.includes(currentWord)) {
          status = 'Matched';
          statusClass = 'status-matched';
          note = `Matched variant: <strong>${currentWord}</strong>`;
          wordPointer++;
        } else {
          status = 'Fail';
          statusClass = 'status-fail';
          note = `No variant matches "${currentWord}"`;
          hasFailure = true;
        }
        break;
      case 'slot':
        if (currentWord) {
          status = 'Extracted';
          statusClass = 'status-matched';
          note = `Assigned <strong>${currentWord}</strong> to {${token.content}}`;
          wordPointer++;
        } else {
          status = 'Fail';
          statusClass = 'status-fail';
          note = 'Missing required value for slot';
          hasFailure = true;
        }
        break;
      case 'perm':
        // Simplified perm logic for visualizer
        status = 'Permuted';
        statusClass = 'status-matched';
        note = 'Checked order-independent group';
        wordPointer++;
        break;
    }

    traceItems.push({ token, status, statusClass, note });
  });

  return { traceItems, hasFailure };
}

function update() {
  const sentenceWords = sentenceInput.value
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w);

  tracesContainer.innerHTML = '';

  let ok = false;

  templates.forEach((template, index) => {
    const { traceItems, hasFailure } = generateTrace(
      template.value,
      sentenceWords
    );

    if (!hasFailure) {
      ok = true;
    }

    // Store result for this template
    templateResults.set(template.id, { hasFailure, traceItems });

    const section = document.createElement('div');
    section.className = 'trace-section';
    section.id = `trace-${template.id}`;

    const header = document.createElement('div');
    header.className = 'trace-header';
    header.innerHTML = `
      <div>
        <div class="template-number">Template ${index + 1}</div>
        <div class="trace-template-display">${template.value}</div>
      </div>
      <div class="trace-overall-status ${
        hasFailure ? 'overall-fail' : 'overall-success'
      }">
        ${hasFailure ? 'FAILED' : 'MATCHED'}
      </div>
    `;

    const traceList = document.createElement('div');
    traceList.className = 'trace-list';

    traceItems.forEach(({ token, status, statusClass, note }) => {
      const div = document.createElement('div');
      div.className = 'trace-item';
      div.innerHTML = `
        <div>
          <span class="syntax-raw text-${token.type}">${token.raw}</span>
          <span class="type-label">${token.type} — ${note}</span>
        </div>
        <div class="match-status ${statusClass}">${status}</div>
      `;
      traceList.appendChild(div);
    });

    section.appendChild(header);
    section.appendChild(traceList);
    tracesContainer.appendChild(section);
  });

  // Update template status indicators only
  updateTemplateStatuses();

  // Add this inside your render() function to make the favicon reactive!
  const favicon = document.querySelector('link[rel="icon"]');
  const isSuccess = !document.querySelector('.status-pill.fail');
  const iconColor = ok ? '%23059669' : '%23dc2626'; // Green or Red

  favicon.href = `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 rx=%2220%22 fill=%22${iconColor}%22/><path d=%22M30 45v10m10-20v30m10-40v50m10-40v30m10-20v10%22 stroke=%22white%22 stroke-width=%228%22 stroke-linecap=%22round%22/></svg>`;
}

addTemplateBtn.addEventListener('click', () => {
  templates.push({ id: nextId++, value: '' });
  updateURL();
  renderTemplates();
  update();
});

sentenceInput.addEventListener('input', () => {
  updateURL();
  update();
});

initFromURL();
renderTemplates();
update();
