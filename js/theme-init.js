/**
 * theme-init.js
 * ---------------------------------------------------------------------------
 * Sets the colour theme BEFORE the page paints, so visitors never see a flash
 * of the wrong theme. Keep this file small and load it in <head> WITHOUT
 * `defer` (see index.html).
 *
 * The toggle button in js/main.js saves the visitor's choice to localStorage
 * under the key "theme", and this file reads it back on the next visit.
 */
(function () {
  // What visitors see on their very first visit:
  //   'system' -> follow the device setting (light or dark)
  //   'light'  -> always start in light mode
  //   'dark'   -> always start in dark mode
  var DEFAULT_THEME = 'system';

  var theme;
  try {
    theme = localStorage.getItem('theme'); // a previously saved choice wins
  } catch (e) {
    theme = null; // storage can be blocked (private mode), so fail quietly
  }

  if (!theme) {
    if (DEFAULT_THEME === 'system') {
      theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } else {
      theme = DEFAULT_THEME;
    }
  }

  // styles.css reads this attribute: :root[data-theme="dark"] { ... }
  document.documentElement.dataset.theme = theme;
})();
