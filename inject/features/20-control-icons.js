// Flat, theme-aware icons inside form controls.
//
// The site paints icons into <select> backgrounds as base64 SVG data URIs
// with a hard-coded dark fill (#333333), layered under a gloss gradient. CSS
// can't recolour a background image, so this rewrites it: the gloss layer is
// dropped and, in dark mode, the icon fill becomes the theme's text colour.
// Re-applies when the system theme flips while the app is open.

CCW.feature('control-icons', function () {
  var DARK_FILL = '#c9d0da';
  var dark = window.matchMedia('(prefers-color-scheme: dark)');
  var cache = {}; // original background-image per element, keyed by index

  function recolour(dataUri, fill) {
    var m = /^url\("data:image\/svg\+xml;base64,([^"]+)"\)$/.exec(dataUri.trim());
    if (!m) return dataUri;
    try {
      var svg = atob(m[1]).replace(/#333333|#333\b/gi, fill);
      return 'url("data:image/svg+xml;base64,' + btoa(svg) + '")';
    } catch (e) {
      return dataUri;
    }
  }

  // Split a background-image list on top-level commas only.
  function layers(value) {
    var out = [], depth = 0, start = 0;
    for (var i = 0; i < value.length; i++) {
      var ch = value[i];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (ch === ',' && depth === 0) {
        out.push(value.slice(start, i));
        start = i + 1;
      }
    }
    out.push(value.slice(start));
    return out;
  }

  function apply() {
    var selects = document.querySelectorAll('select');
    for (var i = 0; i < selects.length; i++) {
      var el = selects[i];
      if (!(i in cache)) {
        el.style.backgroundImage = '';
        cache[i] = getComputedStyle(el).backgroundImage;
      }
      var original = cache[i];
      if (!original || original === 'none') continue;

      var parts = layers(original);
      var kept = [], positions = [], sizes = [];
      var cs = getComputedStyle(el);
      var pos = layers(cs.backgroundPosition), size = layers(cs.backgroundSize);
      for (var j = 0; j < parts.length; j++) {
        if (/gradient\(/.test(parts[j])) continue; // drop the gloss
        kept.push(dark.matches ? recolour(parts[j], DARK_FILL) : parts[j].trim());
        positions.push((pos[j] || pos[0]).trim());
        sizes.push((size[j] || size[0]).trim());
      }
      if (!kept.length) continue;
      el.style.setProperty('background-image', kept.join(', '), 'important');
      el.style.setProperty('background-position', positions.join(', '), 'important');
      el.style.setProperty('background-size', sizes.join(', '), 'important');
      el.style.setProperty('background-repeat', 'no-repeat', 'important');
    }
  }

  apply();
  if (dark.addEventListener) dark.addEventListener('change', apply);
});
