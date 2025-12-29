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
      showSettings: false,
      showCollection: false, // New state for the collection list
      settings: JSON.parse(localStorage.getItem('quoteSettings')) || {
        minYear: 1920,
        maxYear: 2025,
      },
    };
  }

  async connectedCallback() {
    try {
      const response = await fetch('movies.json');
      this.movieData = await response.json();

      const urlParams = new URLSearchParams(window.location.search);
      const quoteNum = parseInt(urlParams.get('q'));

      if (quoteNum && quoteNum >= 1 && quoteNum <= this.movieData.length) {
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

  getFilteredPool() {
    return this.movieData.filter(
      (m) =>
        m.year >= this.state.settings.minYear &&
        m.year <= this.state.settings.maxYear
    );
  }

  pickNewQuote() {
    const pool = this.getFilteredPool();
    let unseen = pool.filter(
      (m) => !this.state.seenQuotes.includes(m.position)
    );

    if (unseen.length === 0) unseen = pool;

    const randomMovie = unseen[Math.floor(Math.random() * unseen.length)];
    this.state.currentIndex = this.movieData.indexOf(randomMovie);
    this.updateURL(randomMovie.position);
  }

  nextQuote() {
    this.state.feedback = null;
    this.state.hintsUnlocked = 0;
    this.pickNewQuote();
    this.render();
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
    this.markAsSeen(this.movieData[this.state.currentIndex].position);
    this.state.feedback = 'gaveUp';
    this.render();
  }

  markAsSeen(position) {
    if (!this.state.seenQuotes.includes(position)) {
      this.state.seenQuotes.push(position);
      localStorage.setItem('seenQuotes', JSON.stringify(this.state.seenQuotes));
    }
  }

  saveSettings() {
    const minV = parseInt(this.querySelector('#min-year').value);
    const maxV = parseInt(this.querySelector('#max-year').value);
    this.state.settings = { minYear: minV, maxYear: maxV };
    localStorage.setItem('quoteSettings', JSON.stringify(this.state.settings));
    this.state.showSettings = false;
    this.nextQuote();
  }

  renderSettings() {
    return `
            <div class="overlay">
                <div class="modal">
                    <h3 style="margin-top:0">Filter by Year</h3>
                    <div style="display:flex; flex-direction:column; gap:15px; margin: 20px 0;">
                        <label style="display:flex; justify-content:space-between; align-items:center;">
                            From: <input type="number" id="min-year" value="${this.state.settings.minYear}" style="width:80px; padding:5px; background:#000; color:#fff; border:1px solid #444;">
                        </label>
                        <label style="display:flex; justify-content:space-between; align-items:center;">
                            To: <input type="number" id="max-year" value="${this.state.settings.maxYear}" style="width:80px; padding:5px; background:#000; color:#fff; border:1px solid #444;">
                        </label>
                    </div>
                    <button id="save-settings" style="width:100%">Apply & New Quote</button>
                    <button id="close-settings" class="secondary" style="width:100%; margin-top:10px">Cancel</button>
                </div>
            </div>
        `;
  }

  renderFeedbackModal(current) {
    const status = this.state.feedback;
    const isWrong = status === 'wrong';
    const isGaveUp = status === 'gaveUp';

    return `
            <div class="overlay">
                <div class="modal">
                    ${
                      isWrong
                        ? `
                        <div class="error-icon">✕</div>
                        <h2 style="margin-top:0">Not Quite...</h2>
                        <button id="retry-btn" style="width: 100%">Try Again</button>
                    `
                        : `
                        <div class="${
                          isGaveUp ? 'error-icon' : 'success-icon'
                        }" style="${isGaveUp ? 'color:#666' : ''}">
                            ${isGaveUp ? '⚐' : '✓'}
                        </div>
                        <div class="movie-reveal-title">${current.title} (${
                            current.year
                          })</div>
                        <div style="color: var(--text-dim); margin-bottom: 1rem;">Starring: ${
                          current.stars
                        }</div>
                        <a href="${
                          current.url
                        }" target="_blank" class="afi-link">View Details ↗</a>
                        <button id="next-btn" style="width: 100%; margin-top:15px;">Next Quote</button>
                    `
                    }
                </div>
            </div>
        `;
  }

  render() {
    if (this.state.isLoading) return;

    const current = this.movieData[this.state.currentIndex];
    const filteredPool = this.getFilteredPool();
    const completedInRange = filteredPool.filter((m) =>
      this.state.seenQuotes.includes(m.position)
    ).length;

    this.innerHTML = `
            <header>
                <div style="display:flex; align-items:center; gap:10px">
                    <button id="settings-btn" style="background:none; border:none; padding:5px; font-size:1.2rem; cursor:pointer">⚙️</button>
                    <h2>AFI Quotes</h2>
                </div>
                <button id="progress-btn" class="progress-pill" style="border:none; cursor:pointer">
                    ${completedInRange}/${filteredPool.length}
                </button>
            </header>

            <main>
                <div class="card">
                    <div class="hint-box">
                        ${
                          this.state.hintsUnlocked >= 1
                            ? `<div class="hint-item">📅 ${current.year}</div>`
                            : ''
                        }
                        ${
                          this.state.hintsUnlocked >= 2
                            ? `<div class="hint-item">🌟 ${current.stars}</div>`
                            : ''
                        }
                    </div>
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
                            ? `<button id="hint-btn" class="secondary">Hint</button>`
                            : `<button id="give-up-btn" class="secondary" style="background:#2a2a2a; color:#888;">Give Up</button>`
                        }
                    </div>
                </div>
            </main>

            ${this.state.showSettings ? this.renderSettings() : ''}
            ${this.state.showCollection ? this.renderCollection() : ''}
            ${this.state.feedback ? this.renderFeedbackModal(current) : ''}
        `;

    this.setupEventListeners();
  }

  renderCollection() {
    // Filter movieData to only those found in seenQuotes
    const seenMovies = this.movieData
      .filter((m) => this.state.seenQuotes.includes(m.position))
      .sort((a, b) => a.position - b.position);

    return `
            <div class="overlay">
                <div class="modal collection-modal">
                    <h3 style="margin-top:0">Your Collection</h3>
                    <div class="collection-list">
                        ${
                          seenMovies.length > 0
                            ? seenMovies
                                .map(
                                  (m) => `
                            <div class="collection-item">
                                <div class="collection-info">
                                    <strong>#${m.position}</strong> ${m.title} (${m.year})
                                </div>
                                <a href="?q=${m.position}" class="replay-link">Replay</a>
                            </div>
                        `
                                )
                                .join('')
                            : '<p style="color:var(--text-dim)">No quotes answered yet!</p>'
                        }
                    </div>
                    <button id="close-collection" style="width:100%; margin-top:15px;">Close</button>
                </div>
            </div>
        `;
  }

  setupEventListeners() {
    const settingsBtn = this.querySelector('#settings-btn');
    if (settingsBtn)
      settingsBtn.onclick = () => {
        this.state.showSettings = true;
        this.render();
      };

    if (this.state.showSettings) {
      this.querySelector('#save-settings').onclick = () => this.saveSettings();
      this.querySelector('#close-settings').onclick = () => {
        this.state.showSettings = false;
        this.render();
      };
      return;
    }

    // Progress / Collection trigger
    const progressBtn = this.querySelector('#progress-btn');
    if (progressBtn)
      progressBtn.onclick = () => {
        this.state.showCollection = true;
        this.render();
      };

    if (this.state.showCollection) {
      this.querySelector('#close-collection').onclick = () => {
        this.state.showCollection = false;
        this.render();
      };
      return;
    }

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
      const nextBtn = this.querySelector('#next-btn');
      if (nextBtn) nextBtn.onclick = () => this.nextQuote();
      const retryBtn = this.querySelector('#retry-btn');
      if (retryBtn)
        retryBtn.onclick = () => {
          this.state.feedback = null;
          this.render();
        };
    }
  }
}

customElements.define('movie-game', MovieGame);
