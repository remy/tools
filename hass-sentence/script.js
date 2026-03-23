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
import { COMMON_EXPANSION_RULES, COMMON_LISTS } from './common-rules.js';

const sentenceInput = document.getElementById('sentenceInput');
const templatesContainer = document.getElementById('templatesContainer');
const tracesContainer = document.getElementById('tracesContainer');

let templates = [];
let nextId = 1;
let templateResults = new Map(); // Store results for each template
let textareaRawValue = ''; // Raw textarea content (preserves blank lines)

// Initialize from URL parameters
function initFromURL() {
  const params = new URLSearchParams(window.location.search);
  const sentence = params.get('s');
  const templatesParam = params.get('t');

  if (sentence) {
    // Decode twice to handle potential double-encoding from some sources
    sentenceInput.value = decodeURIComponent(decodeURIComponent(sentence));
  } else {
    sentenceInput.value = 'light in kitchen is on now';
  }

  if (templatesParam) {
    const templateValues = templatesParam
      .split('|')
      .map((t) => decodeURIComponent(decodeURIComponent(t))); // Decode twice
    templates = templateValues.map((value) => ({ id: nextId++, value }));
  } else {
    templates = [
      { id: nextId++, value: '[the] (light|lights) in {area} [is] (on;now)' },
    ];
  }
  textareaRawValue = templates.map((t) => t.value).join('\n');
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

  const textarea = document.createElement('textarea');
  textarea.className = 'templates-textarea';
  textarea.value = textareaRawValue;
  textarea.placeholder = 'Enter one template per line…';
  textarea.rows = Math.max(4, textareaRawValue.split('\n').length + 1);

  textarea.addEventListener('input', (e) => {
    textareaRawValue = e.target.value;
    const lines = textareaRawValue.split('\n');
    nextId = 1;
    templates = lines
      .filter((line) => line.trim())
      .map((value) => ({ id: nextId++, value: value.trim() }));
    updateURL();
    update();
  });

  templatesContainer.appendChild(textarea);
}

function updateTemplateStatuses() {
  // Status is shown in the trace section; no per-line pills needed.
}

const ruleCache = new Map();
const slotCache = new Map();

function getRuleExpression(ruleName) {
  if (ruleCache.has(ruleName)) {
    return ruleCache.get(ruleName);
  }

  const ruleDefinition = COMMON_EXPANSION_RULES[ruleName];
  if (!ruleDefinition) return null;

  try {
    const sentence = parseSentence(ruleDefinition);
    ruleCache.set(ruleName, sentence.expression);
    return sentence.expression;
  } catch (e) {
    console.error(`Error parsing rule <${ruleName}>:`, e);
    return null;
  }
}

function preprocessListValue(text) {
  // Handles cases like `word[s]` -> `(word|words)`
  return text.replace(/(\w+)\[(\w+)\]/g, '($1$2|$1)');
}

function getSlotMatcher(listName) {
  if (slotCache.has(listName)) {
    return slotCache.get(listName);
  }

  const listDef = COMMON_LISTS[listName];
  if (!listDef) return null;

  let matcher = null;

  if (listDef.wildcard) {
    matcher = { type: 'wildcard' };
  } else if (listDef.range) {
    matcher = { type: 'range', ...listDef.range };
  } else if (listDef.values) {
    matcher = {
      type: 'values',
      items: listDef.values
        .map((val) => {
          const text = typeof val === 'string' ? val : val.in;
          const out = typeof val === 'string' ? val : val.out;
          try {
            const processedText = preprocessListValue(text);
            return {
              expression: parseSentence(processedText).expression,
              out: out,
            };
          } catch (e) {
            console.error(
              `Error parsing list item "${text}" in {${listName}}:`,
              e
            );
            return null;
          }
        })
        .filter(Boolean),
    };
  }

  slotCache.set(listName, matcher);
  return matcher;
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
    // Recursive backtracking matcher for sequence items.
    // When a greedy slot (wildcard or unknown list) is followed by more items,
    // we try consuming 1…N words for the slot until the remainder matches —
    // this is how HASSIL handles multi-word slot values like {task} in
    // "(remind me) to {task} at {time}".
    const matchItems = (itemIndex, wordIdx, trace) => {
      if (itemIndex >= expr.items.length) {
        return { matched: true, wordsConsumed: 0 };
      }

      const item = expr.items[itemIndex];
      const hasMore = itemIndex < expr.items.length - 1;

      if (item instanceof ListReference && hasMore) {
        const matcher = getSlotMatcher(item.listName);
        const isGreedy = !matcher || matcher.type === 'wildcard';

        if (isGreedy) {
          const remaining = words.length - wordIdx;
          for (let n = 1; n <= remaining; n++) {
            const restTrace = [];
            const restResult = matchItems(itemIndex + 1, wordIdx + n, restTrace);
            if (restResult.matched) {
              const matchedWords = words.slice(wordIdx, wordIdx + n).join(' ');
              trace.push({
                raw: `{${item.listName}}`,
                type: 'slot',
                status: !matcher ? 'Extracted' : 'Extracted (Common)',
                statusClass: 'status-matched',
                note: `Assigned <strong>${matchedWords}</strong> to {${item.listName}}${!matcher ? ' (no list def)' : ' (wildcard)'}`,
              });
              trace.push(...restTrace);
              return { matched: true, wordsConsumed: n + restResult.wordsConsumed };
            }
          }
          trace.push({
            raw: `{${item.listName}}`,
            type: 'slot',
            status: 'Fail',
            statusClass: 'status-fail',
            note: `Could not match slot {${item.listName}} with the remaining pattern`,
          });
          return { matched: false, wordsConsumed: 0 };
        }
      }

      // Non-greedy item: match normally then recurse.
      const result = matchExpression(item, words, wordIdx, trace);
      if (!result.matched) return { matched: false, wordsConsumed: 0 };

      const restResult = matchItems(itemIndex + 1, wordIdx + result.wordsConsumed, trace);
      if (!restResult.matched) return { matched: false, wordsConsumed: 0 };

      return { matched: true, wordsConsumed: result.wordsConsumed + restResult.wordsConsumed };
    };

    return matchItems(0, wordIndex, traceItems);
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
    const matcher = getSlotMatcher(expr.listName);

    if (!matcher) {
      // Fallback: Just check if there is a word
      if (currentWord) {
        traceItems.push({
          raw: `{${expr.listName}}`,
          type: 'slot',
          status: 'Extracted',
          statusClass: 'status-matched',
          note: `Assigned <strong>${currentWord}</strong> to {${expr.listName}} (no list def)`,
        });
        return { matched: true, wordsConsumed: 1 };
      } else {
        traceItems.push({
          raw: `{${expr.listName}}`,
          type: 'slot',
          status: 'Fail',
          statusClass: 'status-fail',
          note: `Missing required value for slot {${expr.listName}}`,
        });
        return { matched: false, wordsConsumed: 0 };
      }
    }

    if (matcher.type === 'wildcard') {
      if (currentWord) {
        traceItems.push({
          raw: `{${expr.listName}}`,
          type: 'slot',
          status: 'Extracted (Common)',
          statusClass: 'status-matched',
          note: `Assigned <strong>${currentWord}</strong> to {${expr.listName}} (wildcard)`,
        });
        return { matched: true, wordsConsumed: 1 };
      }
    } else if (matcher.type === 'range') {
      const num = parseFloat(currentWord);
      const min = matcher.from;
      const max = matcher.to;

      if (!isNaN(num) && num >= min && num <= max) {
        traceItems.push({
          raw: `{${expr.listName}}`,
          type: 'slot',
          status: 'Extracted (Common)',
          statusClass: 'status-matched',
          note: `Assigned <strong>${currentWord}</strong> to {${expr.listName}} (range ${min}-${max})`,
        });
        return { matched: true, wordsConsumed: 1 };
      } else {
        traceItems.push({
          raw: `{${expr.listName}}`,
          type: 'slot',
          status: 'Fail',
          statusClass: 'status-fail',
          note: `Expected number ${min}-${max}, got "${currentWord}"`,
        });
        return { matched: false, wordsConsumed: 0 };
      }
    } else if (matcher.type === 'values') {
      // Try to match one of the values
      for (const item of matcher.items) {
        // We do a temporary trace for the slot item to not pollute the main trace unless matched
        const tempTrace = [];
        const result = matchExpression(
          item.expression,
          words,
          wordIndex,
          tempTrace
        );

        if (result.matched) {
          const matchedWords = words
            .slice(wordIndex, wordIndex + result.wordsConsumed)
            .join(' ');
          let note = `Matched list item: <strong>${matchedWords}</strong>`;
          if (item.out !== undefined && item.out !== matchedWords) {
            note += ` ➜ <code>${item.out}</code>`;
          }

          traceItems.push({
            raw: `{${expr.listName}}`,
            type: 'slot',
            status: 'Matched (Common)',
            statusClass: 'status-matched',
            note: note,
          });
          return { matched: true, wordsConsumed: result.wordsConsumed };
        }
      }

      traceItems.push({
        raw: `{${expr.listName}}`,
        type: 'slot',
        status: 'Fail',
        statusClass: 'status-fail',
        note: `No matching value found in list {${expr.listName}} starting at "${currentWord}"`,
      });
      return { matched: false, wordsConsumed: 0 };
    }

    // Fallback failure
    return { matched: false, wordsConsumed: 0 };
  }

  if (expr instanceof RuleReference) {
    const ruleExpr = getRuleExpression(expr.ruleName);

    if (ruleExpr) {
      traceItems.push({
        raw: `<${expr.ruleName}>`,
        type: 'rule',
        status: 'Expanded (Common)',
        statusClass: 'status-matched',
        note: `Expanding rule: ${COMMON_EXPANSION_RULES[expr.ruleName]}`,
      });
      // Recursively match the expanded rule
      return matchExpression(ruleExpr, words, wordIndex, traceItems);
    } else {
      traceItems.push({
        raw: `<${expr.ruleName}>`,
        type: 'rule',
        status: 'Skipped',
        statusClass: 'status-skipped',
        note: `Rule reference not found (checked ${
          Object.keys(COMMON_EXPANSION_RULES).length
        } rules)`,
      });
      return { matched: true, wordsConsumed: 0 };
    }
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

function escapeHTML(str) {
  return str.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function update() {
  const sentenceWords = sentenceInput.value
    .toLowerCase()
    .replace(/[.,?¿!;:]/g, '')
    .split(/\s+/)
    .filter((w) => w);

  console.log('Processed sentence words:', sentenceWords);

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
        <div class="trace-template-display">${escapeHTML(template.value)}</div>
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

  const favicon = document.querySelector('link[rel="icon"]');
  const iconColor = ok ? '%23059669' : '%23dc2626'; // Green or Red

  favicon.href = `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 rx=%2220%22 fill=%22${iconColor}%22/><path d=%22M30 45v10m10-20v30m10-40v50m10-40v30m10-20v10%22 stroke=%22white%22 stroke-width=%228%22 stroke-linecap=%22round%22/></svg>`;
}

sentenceInput.addEventListener('input', () => {
  updateURL();
  update();
});

initFromURL();
renderTemplates();
update();
