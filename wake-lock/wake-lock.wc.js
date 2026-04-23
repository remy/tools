class WakeLock extends HTMLElement {
  constructor() {
    super();
    this.lock = null;
    this.handleRelease = this.handleRelease.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
  }

  connectedCallback() {
    this.addEventListener('click', this.handleClick);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.handleClick);
    document.removeEventListener(
      'visibilitychange',
      this.handleVisibilityChange
    );
    this.release();
  }

  get active() {
    return this.lock !== null;
  }

  get supported() {
    return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  }

  async handleClick() {
    if (!this.supported) {
      this.dispatchEvent(new CustomEvent('unsupported', { bubbles: true }));
      return;
    }

    if (this.active) {
      this.release();
    } else {
      await this.request();
    }
  }

  handleVisibilityChange() {
    if (this.active && document.visibilityState === 'visible') {
      this.request();
    }
  }

  handleRelease() {
    if (this.lock) {
      this.lock.removeEventListener('release', this.handleRelease);
      this.lock = null;
    }
    this.removeAttribute('active');
    this.dispatchEvent(new CustomEvent('released', { bubbles: true }));
  }

  async request() {
    if (!this.supported || this.lock) return;

    try {
      this.lock = await navigator.wakeLock.request('screen');
      this.setAttribute('active', true);
      this.lock.addEventListener('release', this.handleRelease);
      this.dispatchEvent(new CustomEvent('locked', { bubbles: true }));
    } catch (error) {
      this.dispatchEvent(
        new CustomEvent('error', { bubbles: true, detail: error })
      );
    }
  }

  release() {
    if (!this.lock) return;
    this.removeAttribute('active');
    this.lock.removeEventListener('release', this.handleRelease);
    this.lock.release().catch(() => {});
    this.lock = null;
    this.dispatchEvent(new CustomEvent('released', { bubbles: true }));
  }
}

customElements.define('wake-lock', WakeLock);
