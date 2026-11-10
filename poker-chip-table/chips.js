import { denom } from './state.js';

const layer = document.getElementById('fly-layer');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

export function chipEl(key, { label = true } = {}) {
  const el = document.createElement('span');
  el.className = `chip chip-${key}`;
  if (label) el.textContent = denom(key)?.value ?? '';
  return el;
}

const MAX_STACKS = 8;

/** Renders a pile of chips grouped into stacks of up to eight. */
export function renderPile(container, counts) {
  container.textContent = '';
  let stacks = 0;
  Object.entries(counts)
    .filter(([, n]) => n > 0)
    .forEach(([key, n]) => {
      let left = n;
      while (left > 0 && stacks < MAX_STACKS) {
        const height = Math.min(left, 8);
        const stack = document.createElement('span');
        stack.className = 'chip-stack';
        for (let i = 0; i < height; i++) {
          const chip = chipEl(key, { label: false });
          chip.style.setProperty('--i', String(i));
          stack.append(chip);
        }
        container.append(stack);
        stacks += 1;
        left -= height;
      }
    });
}

function centre(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/**
 * Throws chips from one element to another. Resolves once they land, so the
 * caller can update the pot only when the chips arrive.
 */
export function fly(fromEl, toEl, keys, { spread = 26 } = {}) {
  if (!fromEl || !toEl || !keys.length) return Promise.resolve();
  const from = centre(fromEl);
  const to = centre(toEl);
  if (reduced.matches) return Promise.resolve();

  const flights = keys.slice(0, 14).map((key, i) => {
    const chip = chipEl(key);
    chip.classList.add('flying');
    chip.style.left = `${from.x}px`;
    chip.style.top = `${from.y}px`;
    layer.append(chip);

    const jitter = () => (Math.random() - 0.5) * spread;
    const dx = to.x - from.x + jitter();
    const dy = to.y - from.y + jitter();
    const lift = Math.min(120, Math.abs(dy) * 0.45 + 40);

    const anim = chip.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.7)', opacity: 0.4 },
        {
          transform: `translate(calc(-50% + ${dx / 2}px), calc(-50% + ${dy / 2 - lift}px)) scale(1.15) rotate(${jitter() * 8}deg)`,
          opacity: 1,
          offset: 0.55,
        },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1)`, opacity: 1 },
      ],
      { duration: 420 + i * 45, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' }
    );

    return anim.finished.then(() => chip.remove());
  });

  return Promise.all(flights);
}

export function pulse(el) {
  if (!el || reduced.matches) return;
  el.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }],
    { duration: 320, easing: 'ease-out' }
  );
}
