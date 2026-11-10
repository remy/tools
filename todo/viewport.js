// Keep the fixed app shell locked to the *visual* viewport so the add-bar
// footer stays above the on-screen keyboard on mobile instead of being pushed
// off-screen behind it.
//
// .app is `position: fixed; inset: 0`, which anchors it to the *layout*
// viewport. When the soft keyboard opens the layout viewport keeps its full
// height, so the flex-column footer ends up below the fold, hidden behind the
// keyboard. By pinning the shell's height to `visualViewport.height` — and
// translating it by `offsetTop` for when the browser scrolls the page up under
// the keyboard — the whole UI squeezes into the visible area: the header stays
// visible at the top, the scrollable list shrinks in the middle, and the footer
// sits right above the keyboard.
//
// Setting an explicit inline height wins over the CSS `bottom: 0` from inset
// (top + height over-constrains the box, so bottom is ignored), which is why
// the shell shrinks from the bottom rather than staying full height.
export function initViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const app = document.querySelector('.app');
  if (!app) return;

  const apply = () => {
    // window.innerHeight tracks the *layout* viewport, which doesn't shrink for
    // the soft keyboard; visualViewport.height does. A large gap between them
    // means the keyboard is up. Only squeeze the shell then — otherwise clear
    // the inline styles so the resting layout defers to CSS (inset:0 / 100svh),
    // which parks the footer flush at the bottom with just the safe-area inset.
    // (The threshold ignores small differences from browser UI like the URL bar.)
    const keyboardOpen = window.innerHeight - vv.height > 150;
    if (keyboardOpen) {
      app.style.height = `${vv.height}px`;
      app.style.transform = `translateY(${vv.offsetTop}px)`;
    } else {
      app.style.height = '';
      app.style.transform = '';
    }
  };

  vv.addEventListener('resize', apply);
  vv.addEventListener('scroll', apply);
  apply();
}
