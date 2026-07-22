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
    app.style.height = `${vv.height}px`;
    app.style.transform = `translateY(${vv.offsetTop}px)`;
  };

  vv.addEventListener('resize', apply);
  vv.addEventListener('scroll', apply);
  apply();
}
