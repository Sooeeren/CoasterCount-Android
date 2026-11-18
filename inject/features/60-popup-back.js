// Android back closes the site's popups.
//
// The site opens login, coaster info, RCDB, pictures … in #popup without
// touching history, so the system back button would leave the page instead
// of closing the popup. While a popup is open it gets its own history entry:
// back pops that entry and closes the popup; closing it with ✕ removes the
// entry again so the next back works as usual.

CCW.feature('popup-back', function () {
  var popup = document.getElementById('popup');
  if (!popup) return;

  var open = false;
  var closingFromBack = false;

  // The site's own flag; closing empties #popup but can leave it display:block.
  function isOpen() {
    if (window.popup && typeof window.popup.is_open === 'boolean') return window.popup.is_open;
    return popup.children.length > 0 && getComputedStyle(popup).display !== 'none';
  }

  function closeSitePopup() {
    if (window.popup && typeof window.popup.close === 'function') {
      window.popup.close();
      return;
    }
    var x = popup.querySelector('header svg.close');
    if (x && window.jQuery) window.jQuery(x).trigger('click');
    else if (x) x.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }

  function sync() {
    var now = isOpen();
    if (now === open) return;
    open = now;
    if (now) {
      history.pushState({ ccwPopup: true }, '');
    } else if (closingFromBack) {
      closingFromBack = false;
    } else if (history.state && history.state.ccwPopup) {
      history.back(); // closed with ✕: drop our entry
    }
  }

  window.addEventListener('popstate', function () {
    if (open && !(history.state && history.state.ccwPopup)) {
      closingFromBack = true;
      closeSitePopup();
      // the site may animate the close; sync() picks up the final state
      setTimeout(sync, 400);
    }
  });

  // is_open flips around the time the popup's content/attributes change.
  new MutationObserver(function () { setTimeout(sync, 0); }).observe(popup, {
    attributes: true,
    attributeFilter: ['style', 'class'],
    childList: true,
  });
  sync();
});
