// Keyboard, touch halves and gamepad, merged into one state per frame.
const KEYS = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'jump', KeyW: 'jump', Space: 'jump', KeyZ: 'jump', KeyX: 'jump',
};

export class Input {
  constructor({ canvas, touchRoot, onAny, onTouch }) {
    this.held = new Set();
    this.pointers = new Map(); // touch pointerId -> 'left' | 'right', oldest first
    this.zones = Object.fromEntries([...touchRoot.querySelectorAll('[data-zone]')].map((el) => [el.dataset.zone, el]));
    this.left = this.right = this.jump = false;
    this.jumpPressed = this.anyPressed = this.pausePressed = this.mutePressed = false;
    this.prevJump = false;
    this.prevPadAny = false;
    this.onAny = onAny;

    addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const a = KEYS[e.code];
      if (a) e.preventDefault();
      if (e.repeat) return;
      if (a) this.held.add(a);
      if (a === 'jump') this.jumpPressed = true;
      if (e.code === 'KeyP' || e.code === 'Escape') this.pausePressed = true;
      else if (e.code === 'KeyM') this.mutePressed = true;
      else this.anyPressed = true;
      this.onAny?.();
    });
    addEventListener('keyup', (e) => {
      const a = KEYS[e.code];
      if (a) this.held.delete(a);
    });
    addEventListener('blur', () => this.held.clear());

    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') { this.anyPressed = true; this.onAny?.(); }
    });

    // Touch: each half of the screen moves that way; touching both halves jumps,
    // still moving the way of the first finger down.
    const side = (e) => (e.clientX < innerWidth / 2 ? 'left' : 'right');

    addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || e.target.closest('button')) return;
      e.preventDefault();
      onTouch?.();
      const was = this.both();
      this.pointers.set(e.pointerId, side(e));
      if (!was && this.both()) this.jumpPressed = true;
      this.anyPressed = true;
      this.onAny?.();
      this.paint();
    }, { passive: false });

    addEventListener('pointermove', (e) => {
      const z = this.pointers.get(e.pointerId);
      if (!z || this.pointers.size > 1) return;
      const s = side(e); // a lone finger can slide between left and right
      if (s !== z) { this.pointers.set(e.pointerId, s); this.paint(); }
    });

    const up = (e) => {
      if (this.pointers.delete(e.pointerId)) this.paint();
    };
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
    addEventListener('contextmenu', (e) => e.preventDefault());
  }

  has(zone) {
    for (const z of this.pointers.values()) if (z === zone) return true;
    return false;
  }

  both() {
    return this.has('left') && this.has('right');
  }

  paint() {
    for (const [name, el] of Object.entries(this.zones)) el.classList.toggle('on', this.has(name));
  }

  poll() {
    let pl = false, pr = false, pj = false, any = false;
    const pad = navigator.getGamepads?.()[0];
    if (pad) {
      const b = (i) => pad.buttons[i]?.pressed;
      pl = pad.axes[0] < -0.4 || b(14);
      pr = pad.axes[0] > 0.4 || b(15);
      pj = b(0) || b(1) || b(12);
      if (b(9) && !this.prevPause) this.pausePressed = true;
      this.prevPause = b(9);
      any = pad.buttons.some((x) => x.pressed);
      if (any && !this.prevPadAny) { this.anyPressed = true; this.onAny?.(); }
      this.prevPadAny = any;
    }
    const dir = this.pointers.values().next().value; // first finger down steers
    this.left = this.held.has('left') || dir === 'left' || pl;
    this.right = this.held.has('right') || dir === 'right' || pr;
    this.jump = this.held.has('jump') || this.both() || pj;
    if (this.jump && !this.prevJump) this.jumpPressed = true;
    this.prevJump = this.jump;
  }

  consume() {
    this.jumpPressed = this.anyPressed = this.pausePressed = this.mutePressed = false;
  }
}
