import {
  parseSentence,
  TextChunk,
  Sequence,
  Group,
  Alternative,
  Permutation,
  ListReference,
  RuleReference,
} from './parser.js';

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

function matchExpression(expr, words, wordIndex, traceItems) {
  // Returns { matched: boolean, wordsConsumed: number, traceItems: [] }

  if (expr instanceof TextChunk) {
    const expectedWord = expr.text.trim();
    if (!expectedWord) {
      // Empty text chunk (e.g., from optional)
      return { matched: true, wordsConsumed: 0 };
    }

    const currentWord = words[wordIndex] || '';

    if (currentWord === expectedWord) {
      traceItems.push({
        raw: expr.originalText,
        type: 'text',
        status: 'Matched',
        statusClass: 'status-matched',
        note: `Literal match: <strong>${currentWord}</strong>`,
      });
      return { matched: true, wordsConsumed: 1 };
    } else {
      traceItems.push({
        raw: expr.originalText,
        type: 'text',
        status: 'Fail',
        statusClass: 'status-fail',
        note: `Expected "${expectedWord}", got "${currentWord}"`,
      });
      return { matched: false, wordsConsumed: 0 };
    }
  }

  if (expr instanceof Sequence) {
    let totalConsumed = 0;
    let allMatched = true;

    for (const item of expr.items) {
      const result = matchExpression(
        item,
        words,
        wordIndex + totalConsumed,
        traceItems
      );
      if (!result.matched) {
        allMatched = false;
        break;
      }
      totalConsumed += result.wordsConsumed;
    }

    return { matched: allMatched, wordsConsumed: totalConsumed };
  }

  if (expr instanceof Alternative) {
    // Build a display representation of the alternative
    const alternatives = expr.items
      .filter((item) => {
        // Filter out empty alternatives (the empty optional choice)
        if (item instanceof TextChunk && !item.text.trim()) return false;
        return true;
      })
      .map((item) => {
        if (item instanceof Sequence) {
          return item.items
            .map((i) => i.originalText || i.text || '?')
            .join('')
            .trim();
        }
        return (item.originalText || item.text || '?').trim();
      })
      .filter((s) => s); // Remove empty strings

    const displayText = expr.isOptional
      ? `[${alternatives.join('|')}]`
      : `(${alternatives.join('|')})`;

    // Try each sequence in the alternative
    for (const seq of expr.items) {
      const itemTrace = [];
      const result = matchExpression(seq, words, wordIndex, itemTrace);

      if (result.matched) {
        // Found a match
        const isEmptySequence =
          seq instanceof Sequence && seq.items.length === 0;
        const isEmpty =
          isEmptySequence || (seq instanceof TextChunk && !seq.text.trim());

        if (expr.isOptional && isEmpty) {
          // Optional was skipped
          traceItems.push({
            raw: displayText,
            type: 'opt',
            status: 'Skipped',
            statusClass: 'status-skipped',
            note: 'Optional omitted (allowed)',
          });
        } else {
          // Show which alternative/optional matched, then its contents
          const matchedText = itemTrace
            .map((t) => t.raw)
            .join('')
            .trim();
          traceItems.push({
            raw: displayText,
            type: expr.isOptional ? 'opt' : 'alt',
            status: 'Matched',
            statusClass: 'status-matched',
            note: expr.isOptional
              ? `Optional present: matched "${matchedText}"`
              : `Matched alternative: "${matchedText}"`,
          });
          // Don't add child items - the parent shows what matched
        }

        return { matched: true, wordsConsumed: result.wordsConsumed };
      }
    }

    // No alternative matched
    if (expr.isOptional) {
      // Optional, so it's okay if nothing matched
      traceItems.push({
        raw: `[optional]`,
        type: 'opt',
        status: 'Skipped',
        statusClass: 'status-skipped',
        note: 'Optional omitted (allowed)',
      });
      return { matched: true, wordsConsumed: 0 };
    } else {
      // Required alternative that didn't match
      traceItems.push({
        raw: `(alternatives)`,
        type: 'alt',
        status: 'Fail',
        statusClass: 'status-fail',
        note: `No alternative matched`,
      });
      return { matched: false, wordsConsumed: 0 };
    }
  }

  if (expr instanceof Permutation) {
    // For visualization, we'll treat permutations simply
    // In reality, HASSIL tries all permutations
    traceItems.push({
      raw: `(permutation)`,
      type: 'perm',
      status: 'Matched',
      statusClass: 'status-matched',
      note: 'Permutation group (simplified)',
    });

    // Just match items in order for now
    let totalConsumed = 0;
    for (const seq of expr.items) {
      const result = matchExpression(
        seq,
        words,
        wordIndex + totalConsumed,
        traceItems
      );
      if (result.matched) {
        totalConsumed += result.wordsConsumed;
      }
    }

    return { matched: true, wordsConsumed: totalConsumed };
  }

  if (expr instanceof ListReference) {
    const currentWord = words[wordIndex] || '';

    if (currentWord) {
      traceItems.push({
        raw: `{${expr.listName}}`,
        type: 'slot',
        status: 'Extracted',
        statusClass: 'status-matched',
        note: `Assigned <strong>${currentWord}</strong> to {${expr.listName}}`,
      });
      return { matched: true, wordsConsumed: 1 };
    } else {
      traceItems.push({
        raw: `{${expr.listName}}`,
        type: 'slot',
        status: 'Fail',
        statusClass: 'status-fail',
        note: 'Missing required value for slot',
      });
      return { matched: false, wordsConsumed: 0 };
    }
  }

  if (expr instanceof RuleReference) {
    traceItems.push({
      raw: `<${expr.ruleName}>`,
      type: 'rule',
      status: 'Skipped',
      statusClass: 'status-skipped',
      note: 'Rule reference (not expanded)',
    });
    return { matched: true, wordsConsumed: 0 };
  }

  // Unknown expression type
  return { matched: false, wordsConsumed: 0 };
}

// Debug helper to serialize expressions
function serializeExpression(expr, depth = 0) {
  if (!expr) return null;

  const base = {
    type: expr.constructor.name,
  };

  if (expr instanceof TextChunk) {
    return { ...base, text: expr.text, originalText: expr.originalText };
  }

  if (expr instanceof ListReference) {
    return { ...base, listName: expr.listName, isEndOfWord: expr.isEndOfWord };
  }

  if (expr instanceof RuleReference) {
    return { ...base, ruleName: expr.ruleName };
  }

  if (expr instanceof Alternative) {
    return {
      ...base,
      isOptional: expr.isOptional,
      items: expr.items.map((item) => serializeExpression(item, depth + 1)),
    };
  }

  if (
    expr instanceof Group ||
    expr instanceof Sequence ||
    expr instanceof Permutation
  ) {
    return {
      ...base,
      items: expr.items.map((item) => serializeExpression(item, depth + 1)),
    };
  }

  return base;
}

function generateTrace(templateValue, sentenceWords) {
  const traceItems = [];
  let hasFailure = false;
  let debugInfo = null;

  try {
    const sentence = parseSentence(templateValue);

    // Create debug info
    debugInfo = {
      template: templateValue,
      sentence: sentenceWords.join(' '),
      sentenceWords: sentenceWords,
      parsedAST: serializeExpression(sentence.expression),
    };

    const result = matchExpression(
      sentence.expression,
      sentenceWords,
      0,
      traceItems
    );

    debugInfo.matchResult = {
      matched: result.matched,
      wordsConsumed: result.wordsConsumed,
      totalWords: sentenceWords.length,
    };

    hasFailure = !result.matched;

    // Check if all words were consumed
    if (result.matched && result.wordsConsumed < sentenceWords.length) {
      hasFailure = true;
      traceItems.push({
        raw: '(extra words)',
        type: 'error',
        status: 'Fail',
        statusClass: 'status-fail',
        note: `Extra words not matched: ${sentenceWords
          .slice(result.wordsConsumed)
          .join(' ')}`,
      });
    } else if (result.matched && result.wordsConsumed > sentenceWords.length) {
      hasFailure = true;
      traceItems.push({
        raw: '(missing words)',
        type: 'error',
        status: 'Fail',
        statusClass: 'status-fail',
        note: `Template expects more words`,
      });
    }
  } catch (error) {
    hasFailure = true;
    debugInfo = {
      template: templateValue,
      sentence: sentenceWords.join(' '),
      error: error.message,
      stack: error.stack,
    };
    traceItems.push({
      raw: templateValue,
      type: 'error',
      status: 'Error',
      statusClass: 'status-fail',
      note: `Parse error: ${error.message}`,
    });
  }

  // Log debug info to console
  if (debugInfo) {
    console.log('🔍 Debug Info:', debugInfo);
    console.log('📋 Trace Items:', traceItems);
  }

  return { traceItems, hasFailure, debugInfo };
}

function update() {
  const sentenceWords = sentenceInput.value
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w);

  tracesContainer.innerHTML = '';

  let ok = false;

  templates.forEach((template, index) => {
    const { traceItems, hasFailure, debugInfo } = generateTrace(
      template.value,
      sentenceWords
    );

    if (!hasFailure) {
      ok = true;
    }

    // Store result for this template
    templateResults.set(template.id, { hasFailure, traceItems, debugInfo });

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

    traceItems.forEach(({ raw, type, status, statusClass, note }) => {
      const div = document.createElement('div');
      div.className = 'trace-item';
      div.innerHTML = `
        <div>
          <span class="syntax-raw text-${type}">${raw}</span>
          <span class="type-label">${type} — ${note}</span>
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
