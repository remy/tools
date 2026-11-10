// CONFIGURATION
const READING_LINE_POSITION = 1 / 3; // Position of reading line (0 = top, 0.5 = middle, 1 = bottom)

// Markdown rendering that keeps the syntax visible: markers are wrapped in
// .md spans so `**strong**` reads bold with its asterisks still shown.

function marker(text) {
  const span = document.createElement('span');
  span.className = 'md';
  span.textContent = text;
  return span;
}

const LIST_ITEM = /^(\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)(.*)$/;

function renderLine(line, parent) {
  let m;
  if ((m = line.match(/^(#{1,6})(\s+)(.*)$/))) {
    const level = m[1].length;
    const h = document.createElement('span');
    h.className = `h h${level}`;
    h.setAttribute('role', 'heading');
    h.setAttribute('aria-level', level);
    h.append(marker(m[1] + m[2]));
    renderInline(m[3], h);
    parent.append(h);
  } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
    parent.append(marker(line));
  } else if ((m = line.match(/^(\s*>\s?)(.*)$/))) {
    const q = document.createElement('span');
    q.className = 'quote';
    parent.append(marker(m[1]), q);
    renderInline(m[2], q);
  } else if ((m = line.match(LIST_ITEM))) {
    // Marker (with any nesting indent) in one column, text in the next, so
    // wrapped lines hang under the text rather than the marker.
    const li = document.createElement('span');
    li.className = 'li';
    li.setAttribute('role', 'listitem');
    const body = document.createElement('span');
    li.append(marker(m[1]), body);
    renderInline(m[2], body);
    parent.append(li);
    return true;
  } else {
    renderInline(line, parent);
  }
}

const INLINE = new RegExp(
  [
    /(`+)([^`]+?)\1/, // 1,2 code
    /\[([^\]\n]+)\]\(([^)\s]+)\)/, // 3,4 link
    /(\*\*|__)(?=\S)(.+?)(?<=\S)\5/, // 5,6 strong
    /(~~)(?=\S)(.+?)(?<=\S)\7/, // 7,8 strike
    /(\*|(?<!\w)_)(?=\S)(.+?)(?<=\S)\9(?!\w)/, // 9,10 em
    /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/, // 11 bare url
  ]
    .map((r) => r.source)
    .join('|')
);

function safeHref(url) {
  return /^(https?:|mailto:)/i.test(url) ? url : null;
}

function link(href, parent) {
  if (!safeHref(href)) return parent;
  const a = document.createElement('a');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  parent.append(a);
  return a;
}

function wrap(tag, parent) {
  const el = document.createElement(tag);
  parent.append(el);
  return el;
}

function renderInline(text, parent) {
  while (text) {
    const m = text.match(INLINE);
    if (!m) {
      parent.append(text);
      return;
    }
    if (m.index) parent.append(text.slice(0, m.index));
    if (m[1]) {
      const code = wrap('code', parent);
      code.append(marker(m[1]), m[2], marker(m[1]));
    } else if (m[3]) {
      const a = link(m[4], parent);
      a.append(marker('['));
      renderInline(m[3], a);
      a.append(marker(`](${m[4]})`));
    } else if (m[5]) {
      const el = wrap('strong', parent);
      el.append(marker(m[5]));
      renderInline(m[6], el);
      el.append(marker(m[5]));
    } else if (m[7]) {
      const el = wrap('del', parent);
      el.append(marker(m[7]));
      renderInline(m[8], el);
      el.append(marker(m[7]));
    } else if (m[9]) {
      const el = wrap('em', parent);
      el.append(marker(m[9]));
      renderInline(m[10], el);
      el.append(marker(m[9]));
    } else if (m[11]) {
      link(m[11], parent).append(m[11]);
    }
    text = text.slice(m.index + m[0].length);
  }
}

class TextReader extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.readingLinePosition = READING_LINE_POSITION;
  }

  connectedCallback() {
    // Get text content from the element
    this.content = this.textContent || '';
    this.render();
    // The app re-renders by replacing its markup, so readers come and go
    // often; listeners on window/document are kept so they can be removed
    // again rather than piling up one per note ever opened.
    this.onResize = () => this.updatePadding();
    window.addEventListener('resize', this.onResize);
    this.scrollToNextBlock('instant');
    this.listenTimer = setTimeout(() => this.setupEventListeners(), 10);
  }

  disconnectedCallback() {
    clearTimeout(this.listenTimer);
    window.removeEventListener('resize', this.onResize);
    if (this.onDocumentClick) {
      document.removeEventListener('click', this.onDocumentClick);
      this.onDocumentClick = null;
    }
  }

  render() {
    this.shadowRoot.innerHTML = /* HTML */ `
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
          user-select: none;
          -webkit-user-select: none;
          -moz-user-select: none;
          -ms-user-select: none;
        }

        :host {
          display: block;
          height: 100%;
          width: 100%;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
            Oxygen, Ubuntu, sans-serif;
          -webkit-tap-highlight-color: transparent;
        }

        .highlight {
          background-color: rgba(59, 130, 246, 0.2);
          transition: background-color 0.3s ease;
        }

        .container {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #fafafa;
        }

        .content-wrapper {
          flex: 1;
          position: relative;
          overflow: hidden;
        }

        .reading-line {
          position: absolute;
          left: 0;
          right: 0;
          top: ${this.readingLinePosition * 100}%;
          height: 2px;
          background: #3b82f6;
          opacity: 0.3;
          pointer-events: none;
          z-index: 10;
        }

        .scroll-container {
          height: 100%;
          overflow-y: auto;
          overflow-x: hidden;
          cursor: pointer;
        }

        .content {
          max-width: 680px;
          margin: 0 auto;
          /* padding-left: 24px;
              padding-right: 24px; */
        }

        .text-content {
          font-size: 18px;
          line-height: 1.7;
          color: #404040;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }

        .text-content p {
          margin-bottom: 16px;
          padding-left: 16px;
          padding-right: 16px;
        }

        .md {
          color: #a3a3a3;
          font-weight: 400;
          font-style: normal;
        }

        .h {
          font-weight: 700;
          line-height: 1.4;
          color: #171717;
        }
        .h1 { font-size: 1.2em; }
        .h2 { font-size: 1.12em; }
        .h3 { font-size: 1.06em; }

        strong { font-weight: 700; }

        .li {
          display: grid;
          grid-template-columns: auto 1fr;
        }

        a {
          color: #2563eb;
          text-decoration: underline;
          -webkit-touch-callout: default;
        }

        code,
        .code-block {
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 0.88em;
        }

        code {
          background: rgba(0, 0, 0, 0.05);
          border-radius: 3px;
        }

        .quote {
          font-style: italic;
        }

        @media (max-width: 640px) {
          .text-content {
            font-size: 17px;
          }
        }

        @media (prefers-color-scheme: dark) {
          .container {
            background: #020617;
          }

          .text-content {
            color: #e2e8f0;
          }

          .md {
            color: #64748b;
          }

          .h {
            color: #f8fafc;
          }

          a {
            color: #60a5fa;
          }

          code {
            background: rgba(255, 255, 255, 0.08);
          }

          .reading-line {
            background: #60a5fa;
            opacity: 0.5;
          }

          .highlight {
            background-color: rgba(96, 165, 250, 0.35);
          }
        }
      </style>

      <div class="container">
        <div class="content-wrapper">
          <div class="reading-line"></div>
          <div class="scroll-container">
            <div class="content" id="contentContainer">
              <div class="text-content" id="textContent"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.renderText();
    this.updatePadding();
    // Links only open via the context menu (right click / long press).
    this.shadowRoot.getElementById('textContent').addEventListener('click', (e) => {
      if (e.target.closest('a')) e.preventDefault();
    });
    // requestAnimationFrame(() => this.updatePadding());
  }

  renderText() {
    const container = this.shadowRoot.getElementById('textContent');
    if (!container) return;
    container.innerHTML = '';

    const paragraphs = this.content
      .split('\n\n')
      .map((p) => p.replace(/^\n+|\s+$/g, ''))
      .filter((p) => p.trim().length > 0);

    for (const text of paragraphs) {
      const p = document.createElement('p');
      if (/^\s*```/.test(text)) {
        p.classList.add('code-block');
        p.textContent = text;
      } else {
        // List items are block-level, so they need no <br> either side.
        let prevBlock = true;
        for (const line of text.split('\n')) {
          const br = document.createElement('br');
          p.append(br);
          const isBlock = renderLine(line, p);
          if (prevBlock || isBlock) br.remove();
          prevBlock = isBlock;
        }
      }
      container.appendChild(p);
    }
  }

  updatePadding() {
    const wrapper = this.shadowRoot.querySelector('.content-wrapper');
    const container = this.shadowRoot.querySelector('.content');

    if (wrapper && container) {
      const wrapperHeight = wrapper.clientHeight;
      const topPadding = wrapperHeight * this.readingLinePosition;
      const bottomPadding = wrapperHeight * (1 - this.readingLinePosition);

      container.style.paddingTop = `${topPadding}px`;
      container.style.paddingBottom = `${bottomPadding}px`;
    }
  }

  setupEventListeners() {
    const scrollContainer = this.shadowRoot.querySelector('.scroll-container');
    const textContent = this.shadowRoot.getElementById('textContent');

    if (scrollContainer && textContent) {
      this.onDocumentClick = (e) => {
        const containerRect = scrollContainer.getBoundingClientRect();
        const clickY = e.clientY;
        const readingLineY =
          containerRect.top + containerRect.height * this.readingLinePosition;

        if (clickY < readingLineY) {
          this.scrollToPreviousBlock();
        } else {
          this.scrollToNextBlock();
        }
      };
      document.addEventListener('click', this.onDocumentClick);
    }
  }

  clearHighlights() {
    const textContent = this.shadowRoot.getElementById('textContent');
    if (textContent) {
      const highlighted = textContent.querySelectorAll('.highlight');
      highlighted.forEach((el) => el.classList.remove('highlight'));
    }
  }

  scrollToNextBlock(behavior = 'smooth') {
    const scrollContainer = this.shadowRoot.querySelector('.scroll-container');
    const textContent = this.shadowRoot.getElementById('textContent');

    if (!scrollContainer || !textContent) return;

    const blocks = textContent.querySelectorAll('p');
    const containerHeight = scrollContainer.clientHeight;
    const scrollTop = scrollContainer.scrollTop;
    const readingLinePosition = containerHeight * this.readingLinePosition;

    let nextBlock = null;

    for (const block of blocks) {
      const rect = block.getBoundingClientRect();
      const containerRect = scrollContainer.getBoundingClientRect();

      const blockTopRelativeToContainer =
        rect.top - containerRect.top + scrollTop;
      const blockBottomRelativeToContainer =
        blockTopRelativeToContainer + rect.height;

      const blockBottomRelativeToViewport =
        blockBottomRelativeToContainer - scrollTop;

      if (blockBottomRelativeToViewport > readingLinePosition + 10) {
        nextBlock = block;
        break;
      }
    }

    if (nextBlock) {
      this.clearHighlights();
      nextBlock.classList.add('highlight');
      const rect = nextBlock.getBoundingClientRect();
      const containerRect = scrollContainer.getBoundingClientRect();

      const blockTopRelativeToContainer =
        rect.top - containerRect.top + scrollTop;
      const blockHeight = rect.height;

      const targetScroll =
        blockTopRelativeToContainer + blockHeight - readingLinePosition;

      scrollContainer.scrollTo({
        top: targetScroll,
        behavior,
      });
    }
  }

  scrollToPreviousBlock() {
    const scrollContainer = this.shadowRoot.querySelector('.scroll-container');
    const textContent = this.shadowRoot.getElementById('textContent');

    if (!scrollContainer || !textContent) return;

    const blocks = Array.from(textContent.querySelectorAll('p'));
    const containerHeight = scrollContainer.clientHeight;
    const scrollTop = scrollContainer.scrollTop;
    const readingLinePosition = containerHeight * this.readingLinePosition;

    let previousBlock = null;

    for (let i = blocks.length - 1; i >= 0; i--) {
      const block = blocks[i];
      const rect = block.getBoundingClientRect();
      const containerRect = scrollContainer.getBoundingClientRect();

      const blockTopRelativeToContainer =
        rect.top - containerRect.top + scrollTop;
      const blockBottomRelativeToContainer =
        blockTopRelativeToContainer + rect.height;

      const blockBottomRelativeToViewport =
        blockBottomRelativeToContainer - scrollTop;

      if (blockBottomRelativeToViewport < readingLinePosition - 10) {
        previousBlock = block;
        break;
      }
    }

    if (previousBlock) {
      this.clearHighlights();
      previousBlock.classList.add('highlight');
      const rect = previousBlock.getBoundingClientRect();
      const containerRect = scrollContainer.getBoundingClientRect();

      const blockTopRelativeToContainer =
        rect.top - containerRect.top + scrollTop;
      const blockHeight = rect.height;

      const targetScroll =
        blockTopRelativeToContainer + blockHeight - readingLinePosition;

      scrollContainer.scrollTo({
        top: targetScroll,
        behavior: 'smooth',
      });
    }
  }
}

if (!customElements.get('text-reader')) {
  customElements.define('text-reader', TextReader);
}
