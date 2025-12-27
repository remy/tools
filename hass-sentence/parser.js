// HASSIL parser implementation
// Based on: https://github.com/OHF-Voice/hassil/blob/main/hassil/parser.py

// Delimiter constants
const GROUP_START = '(';
const GROUP_END = ')';
const OPT_START = '[';
const OPT_END = ']';
const LIST_START = '{';
const LIST_END = '}';
const RULE_START = '<';
const RULE_END = '>';

const DELIM = {
  [GROUP_START]: GROUP_END,
  [OPT_START]: OPT_END,
  [LIST_START]: LIST_END,
  [RULE_START]: RULE_END,
};

const DELIM_START = Object.keys(DELIM);
const DELIM_END = Object.values(DELIM);

const WORD_SEP = ' ';
const ALT_SEP = '|';
const PERM_SEP = ';';
const ESCAPE_CHAR = '\\';

// Parse types
const ParseType = {
  WORD: 'WORD',
  GROUP: 'GROUP',
  OPT: 'OPT',
  LIST: 'LIST',
  RULE: 'RULE',
  ALT: 'ALT',
  PERM: 'PERM',
  END: 'END',
};

class ParseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ParseError';
  }
}

class ParseExpressionError extends ParseError {
  constructor(chunk, metadata = null) {
    super(`Error in chunk ${JSON.stringify(chunk)} at ${metadata}`);
    this.chunk = chunk;
    this.metadata = metadata;
    this.name = 'ParseExpressionError';
  }
}

// Expression classes (based on hassil/expression.py)
class Expression {
  constructor() {}
}

class TextChunk extends Expression {
  constructor(text, originalText = null, parent = null) {
    super();
    this.text = text;
    this.originalText = originalText || text;
    this.parent = parent;
  }
}

class Group extends Expression {
  constructor(items = []) {
    super();
    this.items = items;
  }
}

class Sequence extends Group {
  constructor(items = []) {
    super(items);
  }
}

class Alternative extends Group {
  constructor(items = [], isOptional = false) {
    super(items);
    this.isOptional = isOptional;
  }
}

class Permutation extends Group {
  constructor(items = []) {
    super(items);
  }
}

class ListReference extends Expression {
  constructor(listName, isEndOfWord = true) {
    super();
    this.listName = listName;
    this.isEndOfWord = isEndOfWord;
  }
}

class RuleReference extends Expression {
  constructor(ruleName) {
    super();
    this.ruleName = ruleName;
  }
}

class Sentence {
  constructor(expression, text = null) {
    this.expression = expression;
    this.text = text;
  }
}

/**
 * Finds the index of an ending delimiter.
 */
function _findEndDelimiter(text, startIndex, startChar, endChar) {
  let workingText = text;
  if (startIndex > 0) {
    workingText = text.substring(startIndex);
  }

  let stack = 1;
  let isEscaped = false;

  for (let i = 0; i < workingText.length; i++) {
    const c = workingText[i];

    if (isEscaped) {
      isEscaped = false;
      continue;
    }

    if (c === ESCAPE_CHAR) {
      isEscaped = true;
      continue;
    }

    if (c === endChar) {
      stack -= 1;
      if (stack < 0) {
        return null;
      }

      if (stack === 0) {
        return startIndex + i + 1;
      }
    }

    if (c === startChar) {
      stack += 1;
    }
  }

  return null;
}

/**
 * Finds the end index of a word.
 */
function _findEndWord(text, startIndex) {
  let workingText = text;
  if (startIndex > 0) {
    workingText = text.substring(startIndex);
  }

  let isEscaped = false;
  let separatorFound = false;

  for (let i = 0; i < workingText.length; i++) {
    const c = workingText[i];

    if (isEscaped) {
      isEscaped = false;
      continue;
    }

    if (c === ESCAPE_CHAR) {
      isEscaped = true;
      continue;
    }

    if (i > 0 && c === WORD_SEP) {
      separatorFound = true;
      continue;
    }

    if (separatorFound && c !== WORD_SEP) {
      // Start of next word
      return startIndex + i;
    }

    if (
      c === ALT_SEP ||
      c === PERM_SEP ||
      DELIM_START.includes(c) ||
      DELIM_END.includes(c)
    ) {
      return startIndex + i;
    }
  }

  if (workingText) {
    // Entire text is a word
    return startIndex + workingText.length;
  }

  return null;
}

/**
 * Gets the parse chunk type based on the next character.
 */
function _peekType(text, startIndex) {
  if (startIndex >= text.length) {
    return ParseType.END;
  }

  const c = text[startIndex];

  if (c === GROUP_START) {
    return ParseType.GROUP;
  }

  if (c === OPT_START) {
    return ParseType.OPT;
  }

  if (c === LIST_START) {
    return ParseType.LIST;
  }

  if (c === RULE_START) {
    return ParseType.RULE;
  }

  if (c === ALT_SEP) {
    return ParseType.ALT;
  }

  if (c === PERM_SEP) {
    return ParseType.PERM;
  }

  return ParseType.WORD;
}

/**
 * Gets the next parsable chunk from text.
 */
function nextChunk(text, startIndex = 0) {
  const nextType = _peekType(text, startIndex);

  if (nextType === ParseType.END) {
    return null;
  }

  let endIndex;

  if (nextType === ParseType.WORD) {
    // Single word
    endIndex = _findEndWord(text, startIndex);
    if (endIndex === null) {
      throw new ParseError(
        `Unable to find end of word from index ${startIndex} in: ${text}`
      );
    }
  } else if (
    [ParseType.GROUP, ParseType.OPT, ParseType.LIST, ParseType.RULE].includes(
      nextType
    )
  ) {
    let startChar, endChar, errorStr;

    if (nextType === ParseType.GROUP) {
      startChar = GROUP_START;
      endChar = GROUP_END;
      errorStr = "group ')'";
    } else if (nextType === ParseType.OPT) {
      startChar = OPT_START;
      endChar = OPT_END;
      errorStr = "optional ']'";
    } else if (nextType === ParseType.LIST) {
      startChar = LIST_START;
      endChar = LIST_END;
      errorStr = "list '}'";
    } else {
      // ParseType.RULE
      startChar = RULE_START;
      endChar = RULE_END;
      errorStr = "rule '>'";
    }

    endIndex = _findEndDelimiter(text, startIndex + 1, startChar, endChar);
    if (endIndex === null) {
      throw new ParseError(
        `Unable to find end of ${errorStr} from index ${startIndex} in: ${text}`
      );
    }
  } else {
    // ParseType.ALT or ParseType.PERM
    endIndex = startIndex + 1;
  }

  const chunkText = text.substring(startIndex, endIndex);

  return {
    text: chunkText,
    startIndex: startIndex,
    endIndex: endIndex,
    parseType: nextType,
  };
}

/**
 * Tokenizes a template string into an array of tokens.
 * This maintains compatibility with the existing script.js structure.
 */
export function tokenize(template) {
  const tokens = [];
  let index = 0;

  while (index < template.length) {
    const chunk = nextChunk(template, index);
    if (!chunk) break;

    const { text, parseType, endIndex } = chunk;

    // Map HASSIL parse types to our token types
    if (parseType === ParseType.WORD) {
      const trimmed = text.trim();
      if (trimmed) {
        tokens.push({ type: 'text', content: trimmed, raw: text });
      } else {
        tokens.push({ type: 'space', content: ' ', raw: text });
      }
    } else if (parseType === ParseType.OPT) {
      // Remove brackets and get content
      const content = text.substring(1, text.length - 1);
      tokens.push({ type: 'opt', content, raw: text });
    } else if (parseType === ParseType.GROUP) {
      // Check if it contains alternates or permutations
      const content = text.substring(1, text.length - 1);
      if (content.includes(ALT_SEP) && !content.includes(PERM_SEP)) {
        tokens.push({ type: 'alt', content, raw: text });
      } else if (content.includes(PERM_SEP)) {
        tokens.push({ type: 'perm', content, raw: text });
      } else {
        // Just a group, treat as text for now
        tokens.push({ type: 'text', content, raw: text });
      }
    } else if (parseType === ParseType.LIST) {
      // Slot/List
      const content = text.substring(1, text.length - 1);
      tokens.push({ type: 'slot', content, raw: text });
    } else if (parseType === ParseType.RULE) {
      // Rule reference
      const content = text.substring(1, text.length - 1);
      tokens.push({ type: 'rule', content, raw: text });
    } else if (parseType === ParseType.ALT) {
      // Separator, skip for now
      // tokens.push({ type: 'separator', content: text, raw: text });
    } else if (parseType === ParseType.PERM) {
      // Separator, skip for now
      // tokens.push({ type: 'separator', content: text, raw: text });
    }

    index = endIndex;
  }

  return tokens;
}

// Utility functions for parse_expression
function normalizeText(text) {
  // Simple normalization - lowercase and normalize whitespace
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function _removeDelimiters(text, startChar, endChar = null) {
  if (endChar === null) {
    if (text.length <= 1) throw new Error('Text is too short');
    if (text[0] !== startChar) throw new Error('Wrong start char');
    return text.substring(1);
  }

  if (text.length <= 2) throw new Error('Text is too short');
  if (text[0] !== startChar) throw new Error('Wrong start char');
  if (text[text.length - 1] !== endChar) throw new Error('Wrong end char');
  return text.substring(1, text.length - 1);
}

function _removeEscapes(text) {
  return text.replace(/\\(.)/g, '$1');
}

function _ensureAlternative(grp) {
  if (grp instanceof Alternative) {
    return grp;
  }
  return new Alternative([grp]);
}

function _ensurePermutation(grp) {
  if (grp instanceof Permutation) {
    return grp;
  }
  return new Permutation([grp]);
}

function _addSpacesBetweenItems(perm) {
  for (const seq of perm.items) {
    if (!(seq instanceof Sequence)) {
      throw new Error('Item is not a sequence');
    }
    seq.items.unshift(new TextChunk(' '));
    seq.items.push(new TextChunk(' '));
  }
}

function parseGroup(grpChunk, metadata = null) {
  let grp = new Sequence();
  let grpText;

  if (grpChunk.parseType === ParseType.GROUP) {
    grpText = _removeDelimiters(grpChunk.text, GROUP_START, GROUP_END);
  } else if (grpChunk.parseType === ParseType.OPT) {
    grpText = _removeDelimiters(grpChunk.text, OPT_START, OPT_END);
  } else {
    throw new ParseExpressionError(grpChunk, metadata);
  }

  let itemChunk = nextChunk(grpText);
  let lastGrpText = grpText;

  while (itemChunk !== null) {
    if (
      [
        ParseType.WORD,
        ParseType.GROUP,
        ParseType.OPT,
        ParseType.LIST,
        ParseType.RULE,
      ].includes(itemChunk.parseType)
    ) {
      // Chunk text ends with explicit whitespace
      const isEndOfWord =
        itemChunk.endIndex < grpText.length &&
        grpText[itemChunk.endIndex] === ' ';

      const item = parseExpression(itemChunk, metadata, isEndOfWord);

      if (grp instanceof Alternative || grp instanceof Permutation) {
        // Add to the most recent sequence
        const lastItem = grp.items[grp.items.length - 1];

        if (!(lastItem instanceof Sequence)) {
          throw new ParseExpressionError(grpChunk, metadata);
        }

        lastItem.items.push(item);
      } else {
        // Add to parent group
        grp.items.push(item);

        if (item instanceof TextChunk) {
          item.parent = grp;
        }
      }
    } else if (itemChunk.parseType === ParseType.ALT) {
      grp = _ensureAlternative(grp);
      // Begin new sequence
      grp.items.push(new Sequence());
    } else if (itemChunk.parseType === ParseType.PERM) {
      grp = _ensurePermutation(grp);
      // Begin new sequence
      grp.items.push(new Sequence());
    } else {
      throw new ParseExpressionError(grpChunk, metadata);
    }

    // Next chunk
    grpText = grpText.substring(itemChunk.endIndex);

    if (grpText === lastGrpText) {
      // No change, unable to proceed
      throw new ParseExpressionError(grpChunk, metadata);
    }

    itemChunk = nextChunk(grpText);
    lastGrpText = grpText;
  }

  if (grp instanceof Permutation) {
    _addSpacesBetweenItems(grp);
  }

  return grp;
}

export function parseExpression(chunk, metadata = null, isEndOfWord = true) {
  if (chunk.parseType === ParseType.WORD) {
    const originalText = _removeEscapes(chunk.text);
    const text = normalizeText(originalText);
    return new TextChunk(text, originalText);
  }

  if (chunk.parseType === ParseType.GROUP) {
    return parseGroup(chunk, metadata);
  }

  if (chunk.parseType === ParseType.OPT) {
    let grp = parseGroup(chunk, metadata);
    const alt = _ensureAlternative(grp);
    alt.isOptional = true;
    alt.items.push(new TextChunk('', '', grp));
    return alt;
  }

  if (chunk.parseType === ParseType.LIST) {
    const text = _removeEscapes(chunk.text);
    const listName = _removeDelimiters(text, LIST_START, LIST_END);
    return new ListReference(listName, isEndOfWord);
  }

  if (chunk.parseType === ParseType.RULE) {
    const text = _removeEscapes(chunk.text);
    const ruleName = _removeDelimiters(text, RULE_START, RULE_END);
    return new RuleReference(ruleName);
  }

  throw new ParseExpressionError(chunk, metadata);
}

export function parseSentence(text, keepText = false, metadata = null) {
  const originalText = text;
  text = text.trim();

  // Wrap in a group because sentences need to always be groups
  text = `(${text})`;

  const chunk = nextChunk(text);
  if (!chunk) {
    throw new ParseError(`Unexpected empty chunk in: ${text}`);
  }

  if (chunk.parseType !== ParseType.GROUP) {
    throw new ParseError(`Expected (group) in: ${text}`);
  }

  if (chunk.startIndex !== 0) {
    throw new ParseError(`Expected (group) to start at index 0 in: ${text}`);
  }

  if (chunk.endIndex !== text.length) {
    throw new ParseError(
      `Expected chunk to end at index ${chunk.endIndex} in: ${text}`
    );
  }

  let grp = parseExpression(chunk, metadata);
  if (!(grp instanceof Group)) {
    throw new ParseError(`Expected Group, got: ${grp}`);
  }

  // Unpack redundant group
  if (grp.items.length === 1) {
    const firstItem = grp.items[0];
    if (firstItem instanceof Group) {
      grp = firstItem;
    }
  }

  return new Sentence(grp, keepText ? originalText : null);
}

// Export for testing/debugging
export {
  ParseType,
  ParseError,
  ParseExpressionError,
  nextChunk,
  Expression,
  TextChunk,
  Sequence,
  Group,
  Alternative,
  Permutation,
  ListReference,
  RuleReference,
  Sentence,
};
