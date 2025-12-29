class MovieGame extends HTMLElement {
  constructor() {
    super();
    this.movieData = [];
    this.state = {
      currentIndex: 0,
      hintsUnlocked: 0,
      seenQuotes: JSON.parse(localStorage.getItem('seenQuotes') || '[]'),
      feedback: null,
      isLoading: true,
    };
  }

  async connectedCallback() {
    try {
      this.movieData = await fetch('movies.json').then((res) => res.json());

      // 1. Check URL for specific quote number
      const urlParams = new URLSearchParams(window.location.search);
      const quoteNum = parseInt(urlParams.get('q'));

      if (quoteNum && quoteNum >= 1 && quoteNum <= this.movieData.length) {
        // Find index based on position (e.g., Position 1 is usually index 0)
        this.state.currentIndex = this.movieData.findIndex(
          (m) => m.position === quoteNum
        );
      } else {
        this.pickNewQuote();
      }

      this.state.isLoading = false;
    } catch (error) {
      this.innerHTML = `<div class="card" style="margin-top:50px">Error loading movies.json.</div>`;
      return;
    }
    this.render();
  }

  pickNewQuote() {
    const unseen = this.movieData.filter(
      (m) => !this.state.seenQuotes.includes(m.position)
    );
    const pool = unseen.length > 0 ? unseen : this.movieData;
    const randomMovie = pool[Math.floor(Math.random() * pool.length)];
    this.state.currentIndex = this.movieData.indexOf(randomMovie);

    // Update URL to match current quote without reloading
    this.updateURL(randomMovie.position);
  }

  updateURL(position) {
    const newUrl = `${window.location.pathname}?q=${position}`;
    window.history.replaceState({ path: newUrl }, '', newUrl);
  }

  handleGuess() {
    const input = this.querySelector('#guess-input');
    const guess = input.value.trim();
    if (!guess) return;

    const currentMovie = this.movieData[this.state.currentIndex];
    const fuse = new Fuse([currentMovie], { keys: ['title'], threshold: 0.35 });

    if (fuse.search(guess).length > 0) {
      this.markAsSeen(currentMovie.position);
      this.state.feedback = 'correct';
    } else {
      this.state.feedback = 'wrong';
    }
    this.render();
  }

  handleGiveUp() {
    const currentMovie = this.movieData[this.state.currentIndex];
    this.markAsSeen(currentMovie.position);
    this.state.feedback = 'correct';
    this.render();
  }

  markAsSeen(position) {
    if (!this.state.seenQuotes.includes(position)) {
      this.state.seenQuotes.push(position);
      localStorage.setItem('seenQuotes', JSON.stringify(this.state.seenQuotes));
    }
  }

  nextQuote() {
    this.pickNewQuote();
    this.state.hintsUnlocked = 0;
    this.state.feedback = null;
    this.render();
  }

  render() {
    if (this.state.isLoading) {
      this.innerHTML = `<div class="card" style="margin-top:50px">Loading Quotes...</div>`;
      return;
    }

    const current = this.movieData[this.state.currentIndex];
    const progress = this.state.seenQuotes.length;

    this.innerHTML = `
            <header>
                <h2>AFI Quotes</h2>
                <div class="progress-pill">Completed: ${progress}/${
      this.movieData.length
    }</div>
            </header>

            <main id="content">
                <div class="card">
                    <div class="hint-box">${
                      this.state.hintsUnlocked >= 1
                        ? `<div class="hint-item">📅 ${current.year}</div>`
                        : ''
                    }${
      this.state.hintsUnlocked >= 2
        ? `<div class="hint-item">🌟 ${current.stars}</div>`
        : ''
    }</div>

                    <div class="quote-container">
                        <div class="quote-number">Quote #${
                          current.position
                        }</div>
                        <blockquote id="quote-text">"${
                          current.quote
                        }"</blockquote>
                    </div>

                    <input type="text" id="guess-input" placeholder="Movie title..." autofocus autocomplete="off">

                    <div class="action-buttons">
                        <button id="submit-btn">Guess</button>
                        ${
                          this.state.hintsUnlocked < 2
                            ? `
                            <button id="hint-btn" class="secondary">Hint</button>
                        `
                            : `
                            <button id="give-up-btn" class="secondary" style="background: #2a2a2a; color: #888;">Give Up</button>
                        `
                        }
                    </div>
                </div>
            </main>

            ${this.state.feedback ? this.renderFeedbackModal(current) : ''}
        `;

    this.setupEventListeners();
  }

  renderFeedbackModal(current) {
    const isCorrect = this.state.feedback === 'correct';
    return `
            <div class="overlay">
                <div class="modal">
                    ${
                      isCorrect
                        ? `
                        <div class="success-icon">✓</div>
                        <h2>The Reveal</h2>
                        <div class="movie-reveal-title">${current.title} (${current.year})</div>
                        <div style="color: var(--text-dim); margin-bottom: 1rem;">Starring: ${current.stars}</div>

                        <a href="${current.url}" target="_blank" class="afi-link">View on AFI Catalog ↗</a>
                        <button id="next-btn" style="width: 100%">Next Quote</button>
                    `
                        : `
                        <div class="error-icon">✕</div>
                        <h2>Not Quite...</h2>
                        <p>Keep trying! Maybe unlock a tip?</p>
                        <button id="retry-btn" style="width: 100%">Try Again</button>
                    `
                    }
                </div>
            </div>
        `;
  }

  setupEventListeners() {
    if (!this.state.feedback) {
      const input = this.querySelector('#guess-input');
      this.querySelector('#submit-btn').onclick = () => this.handleGuess();

      const hintBtn = this.querySelector('#hint-btn');
      if (hintBtn)
        hintBtn.onclick = () => {
          this.state.hintsUnlocked++;
          this.render();
        };

      const giveUpBtn = this.querySelector('#give-up-btn');
      if (giveUpBtn) giveUpBtn.onclick = () => this.handleGiveUp();

      input.onkeyup = (e) => {
        if (e.key === 'Enter') this.handleGuess();
      };
      input.focus();
    } else {
      if (this.querySelector('#next-btn'))
        this.querySelector('#next-btn').onclick = () => this.nextQuote();
      if (this.querySelector('#retry-btn'))
        this.querySelector('#retry-btn').onclick = () => {
          this.state.feedback = null;
          this.render();
        };
    }
  }
}

customElements.define('movie-game', MovieGame);
