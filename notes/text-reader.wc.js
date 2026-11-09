// CONFIGURATION
const READING_LINE_POSITION = 1 / 3; // Position of reading line (0 = top, 0.5 = middle, 1 = bottom)

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
        }

        .text-content p {
          margin-bottom: 16px;
          padding-left: 16px;
          padding-right: 16px;
        }

        .hash-line {
          font-weight: 600;
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
    // requestAnimationFrame(() => this.updatePadding());
  }

  renderText() {
    const container = this.shadowRoot.getElementById('textContent');
    if (container) {
      // Clear existing content
      container.innerHTML = '';

      // Split text into paragraphs
      const paragraphs = this.content
        .split('\n\n')
        .map((p) => p.trim().replace(/[ ]+/g, ' '))
        .filter((p) => p.length > 0);

      // Create paragraph elements with text nodes
      paragraphs.forEach((paragraphText) => {
        const p = document.createElement('p');
        // Preserve single line breaks within a paragraph as <br> elements
        const parts = paragraphText.split('\n');
        parts.forEach((part, idx) => {
          if (part.startsWith('#')) {
            const boldLine = document.createElement('span');
            boldLine.classList.add('hash-line');
            boldLine.textContent = part;
            p.appendChild(boldLine);
          } else {
            p.appendChild(document.createTextNode(part));
          }
          if (idx < parts.length - 1) {
            p.appendChild(document.createElement('br'));
          }
        });
        container.appendChild(p);
      });
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
